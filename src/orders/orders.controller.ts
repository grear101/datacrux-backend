import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('orders')
@UseGuards(JwtAuthGuard) // viewing orders is an admin action
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async findAll(@CurrentUser() user: { clientId: string }) {
    return this.prisma.order.findMany({
      where: { clientId: user.clientId },
      include: { items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
