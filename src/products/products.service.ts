import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private assertSanePricing(price: number, minPrice: number) {
    // Same principle as the Negotiation Engine: pricing rules are enforced
    // server-side, not trusted from whatever the admin panel UI sends.
    if (minPrice > price) {
      throw new BadRequestException('minPrice cannot be greater than price.');
    }
  }

  async create(clientId: string, dto: CreateProductDto) {
    this.assertSanePricing(dto.price, dto.minPrice);
    return this.prisma.product.create({
      data: {
        clientId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        minPrice: dto.minPrice,
        available: dto.available ?? true,
      },
    });
  }

  async findAll(clientId: string) {
    return this.prisma.product.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  async findOne(clientId: string, id: string) {
    const product = await this.prisma.product.findFirst({ where: { id, clientId } });
    if (!product) {
      throw new NotFoundException('Product not found for this client.');
    }
    return product;
  }

  async update(clientId: string, id: string, dto: UpdateProductDto) {
    const existing = await this.findOne(clientId, id); // also enforces tenant isolation

    const nextPrice = dto.price ?? Number(existing.price);
    const nextMinPrice = dto.minPrice ?? Number(existing.minPrice);
    this.assertSanePricing(nextPrice, nextMinPrice);

    return this.prisma.product.update({
      where: { id },
      data: dto,
    });
  }

  async remove(clientId: string, id: string) {
    await this.findOne(clientId, id); // enforces tenant isolation before touching anything

    const orderItemCount = await this.prisma.orderItem.count({ where: { productId: id } });
    if (orderItemCount > 0) {
      // Never hard-delete a product with real order history - just hide it
      // from new sales instead, so past orders still make sense.
      return this.prisma.product.update({ where: { id }, data: { available: false } });
    }

    return this.prisma.product.delete({ where: { id } });
  }
}
