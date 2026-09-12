import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Looks up a customer by phone number, scoped to this business only -
   * same tenant-isolation principle as everything else. A phone number
   * that exists for one business tells us nothing about any other
   * business's customers.
   */
  async findByPhone(clientId: string, phone: string) {
    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly) return null;

    const customer = await this.prisma.customer.findUnique({
      where: { clientId_phone: { clientId, phone: digitsOnly } },
    });

    if (!customer) return null;

    return {
      found: true,
      name: customer.name,
      orderCount: customer.orderCount,
    };
  }

  /**
   * Called automatically whenever an order is confirmed - this is the ONLY
   * place a Customer record gets created or updated, since it's the one
   * moment we know for certain a real name and phone number belong to the
   * same real person, tied to an actual transaction.
   */
  async recordOrder(clientId: string, phone: string, name: string) {
    const digitsOnly = phone.replace(/\D/g, '');
    if (!digitsOnly) return;

    await this.prisma.customer.upsert({
      where: { clientId_phone: { clientId, phone: digitsOnly } },
      create: {
        clientId,
        phone: digitsOnly,
        name,
        orderCount: 1,
        lastOrderAt: new Date(),
      },
      update: {
        name, // keep the most recently given name, in case it was mistyped before
        orderCount: { increment: 1 },
        lastOrderAt: new Date(),
      },
    });
  }
}
