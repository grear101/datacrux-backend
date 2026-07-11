// Negotiation logic must be testable without a generated Prisma client
// (no live DB / engine binary required for pure business-logic tests).
jest.mock('@prisma/client', () => ({
  PrismaClient: class {},
}));

import { Test } from '@nestjs/testing';
import { NegotiationService } from './negotiation.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('NegotiationService', () => {
  let service: NegotiationService;
  let prisma: { product: { findFirst: jest.Mock }; auditLog: { create: jest.Mock } };

  const mockProduct = {
    id: 'prod_1',
    clientId: 'client_1',
    price: 100,
    minPrice: 70,
    available: true,
  };

  beforeEach(async () => {
    prisma = {
      product: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NegotiationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(NegotiationService);
  });

  it('approves a price within [minPrice, listPrice]', async () => {
    prisma.product.findFirst.mockResolvedValue(mockProduct);

    const result = await service.evaluate({
      clientId: 'client_1',
      productId: 'prod_1',
      requestedPrice: 80,
      quantity: 1,
    });

    expect(result.approved).toBe(true);
    expect(result.finalPrice).toBe(80);
  });

  it('NEVER approves below minPrice - counters at floor instead', async () => {
    prisma.product.findFirst.mockResolvedValue(mockProduct);

    const result = await service.evaluate({
      clientId: 'client_1',
      productId: 'prod_1',
      requestedPrice: 1, // attempting to negotiate to $1
      quantity: 1,
    });

    expect(result.approved).toBe(false);
    expect(result.finalPrice).toBe(70); // floor, not the requested $1
    expect(result.finalPrice).toBeGreaterThanOrEqual(mockProduct.minPrice);
  });

  it('caps an over-list-price offer at list price rather than accepting it verbatim', async () => {
    prisma.product.findFirst.mockResolvedValue(mockProduct);

    const result = await service.evaluate({
      clientId: 'client_1',
      productId: 'prod_1',
      requestedPrice: 500,
      quantity: 1,
    });

    expect(result.approved).toBe(true);
    expect(result.finalPrice).toBe(100);
  });

  it('rejects negotiation on a product belonging to a different tenant', async () => {
    // Simulates the tenant-isolation query returning nothing because the
    // productId/clientId combination doesn't match any row.
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.evaluate({
        clientId: 'client_2', // wrong tenant
        productId: 'prod_1',
        requestedPrice: 80,
        quantity: 1,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('logs every negotiation decision to the audit trail', async () => {
    prisma.product.findFirst.mockResolvedValue(mockProduct);

    await service.evaluate({
      clientId: 'client_1',
      productId: 'prod_1',
      requestedPrice: 1,
      quantity: 1,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data.result).toBe('failure');
  });
});
