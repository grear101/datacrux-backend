import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const AVAILABLE_PRODUCTS_TTL_SECONDS = 60;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  private assertSanePricing(price: number, minPrice: number) {
    // Same principle as the Negotiation Engine: pricing rules are enforced
    // server-side, not trusted from whatever the admin panel UI sends.
    if (minPrice > price) {
      throw new BadRequestException('minPrice cannot be greater than price.');
    }
  }

  private availableProductsCacheKey(clientId: string) {
    return `products:available:${clientId}`;
  }

  async create(clientId: string, dto: CreateProductDto) {
    this.assertSanePricing(dto.price, dto.minPrice);
    const product = await this.prisma.product.create({
      data: {
        clientId,
        name: dto.name,
        description: dto.description,
        category: dto.category,
        price: dto.price,
        minPrice: dto.minPrice,
        available: dto.available ?? true,
        imageUrl: dto.imageUrl,
        isService: dto.isService ?? false,
      },
    });
    await this.redis.del(this.availableProductsCacheKey(clientId));
    return product;
  }

  async findAll(clientId: string) {
    return this.prisma.product.findMany({ where: { clientId }, orderBy: { createdAt: 'desc' } });
  }

  /**
   * Just the products AMARA is allowed to sell right now - used by the
   * list_products AI tool, which gets called on nearly every conversation
   * turn. Cached briefly (60 seconds) instead of hitting the database every
   * single time. This is safe to cache because it's only ever used to tell
   * a customer what's available and roughly how much things cost - the
   * moment pricing actually matters (propose_price, confirm_order), those
   * always go straight to the database via the Negotiation Engine,
   * regardless of anything cached here.
   */
  async findAvailable(clientId: string) {
    const cacheKey = this.availableProductsCacheKey(clientId);
    const cached = await this.redis.getJson<any[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const products = await this.prisma.product.findMany({
      where: { clientId, available: true },
      orderBy: { createdAt: 'desc' },
    });
    await this.redis.setJson(cacheKey, products, AVAILABLE_PRODUCTS_TTL_SECONDS);
    return products;
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

    const updated = await this.prisma.product.update({
      where: { id },
      data: dto,
    });
    // The change should be visible to the next customer message right
    // away, not up to 60 seconds late - so the cache is cleared now
    // rather than waiting for it to expire on its own.
    await this.redis.del(this.availableProductsCacheKey(clientId));
    return updated;
  }

  async remove(clientId: string, id: string) {
    await this.findOne(clientId, id); // enforces tenant isolation before touching anything

    const orderItemCount = await this.prisma.orderItem.count({ where: { productId: id } });
    let result;
    if (orderItemCount > 0) {
      // Never hard-delete a product with real order history - just hide it
      // from new sales instead, so past orders still make sense.
      result = await this.prisma.product.update({ where: { id }, data: { available: false } });
    } else {
      result = await this.prisma.product.delete({ where: { id } });
    }
    await this.redis.del(this.availableProductsCacheKey(clientId));
    return result;
  }
}
