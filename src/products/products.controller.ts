import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('products')
@UseGuards(JwtAuthGuard) // product management is an admin action - requires a real login
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() dto: CreateProductDto, @CurrentUser() user: { clientId: string }) {
    return this.productsService.create(user.clientId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: { clientId: string }) {
    return this.productsService.findAll(user.clientId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { clientId: string }) {
    return this.productsService.findOne(user.clientId, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser() user: { clientId: string },
  ) {
    return this.productsService.update(user.clientId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: { clientId: string }) {
    return this.productsService.remove(user.clientId, id);
  }
}
