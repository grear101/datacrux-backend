import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertStorefrontDto } from './dto/upsert-storefront.dto';
import { TRACKING_PLATFORMS, buildTrackingSnippets } from './tracking-platforms';

const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'app', 'www', 'store', 'dashboard', 'platform',
  'chat', 'widget', 'assets', 'static', 'public', 'help', 'support',
]);

const ELIGIBLE_PLANS = new Set(['premium', 'enterprise']);

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, plan: true, storeSlug: true, storeTagline: true, brandingJson: true },
    });
    if (!client) {
      throw new NotFoundException('Business not found.');
    }
    const branding = (client.brandingJson as any) ?? {};
    return {
      eligible: client.plan != null && ELIGIBLE_PLANS.has(client.plan),
      enabled: !!client.storeSlug,
      slug: client.storeSlug,
      tagline: client.storeTagline,
      logoUrl: branding.logoUrl ?? null,
      accentColor: branding.accentColor ?? null,
    };
  }

  async upsert(clientId: string, dto: UpsertStorefrontDto) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException('Business not found.');
    }
    if (!client.plan || !ELIGIBLE_PLANS.has(client.plan)) {
      throw new ForbiddenException('A storefront is available on the Premium or Enterprise plan.');
    }

    if (RESERVED_SLUGS.has(dto.slug)) {
      throw new BadRequestException('That link is reserved - please choose a different one.');
    }

    const existingWithSlug = await this.prisma.client.findUnique({ where: { storeSlug: dto.slug } });
    if (existingWithSlug && existingWithSlug.id !== clientId) {
      throw new BadRequestException('That link is already taken - please choose a different one.');
    }

    const currentBranding = (client.brandingJson as any) ?? {};
    const nextBranding = {
      ...currentBranding,
      ...(dto.logoUrl !== undefined ? { logoUrl: dto.logoUrl } : {}),
      ...(dto.accentColor !== undefined ? { accentColor: dto.accentColor } : {}),
    };

    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        storeSlug: dto.slug,
        storeTagline: dto.tagline,
        brandingJson: nextBranding,
      },
    });

    return this.getMine(clientId);
  }

  async disable(clientId: string) {
    await this.prisma.client.update({ where: { id: clientId }, data: { storeSlug: null } });
    return { enabled: false };
  }

  async getTracking(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { trackingConfig: true },
    });
    const config = (client?.trackingConfig as Record<string, string>) ?? {};
    return TRACKING_PLATFORMS.map((p) => ({
      key: p.key,
      label: p.label,
      placeholder: p.placeholder,
      trackingId: config[p.key] ?? '',
    }));
  }

  async updateTracking(clientId: string, platform: string, trackingId: string | undefined) {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException('Business not found.');
    }

    const currentConfig = (client.trackingConfig as Record<string, string>) ?? {};
    const nextConfig = { ...currentConfig };
    const trimmed = trackingId?.trim();
    if (trimmed) {
      nextConfig[platform] = trimmed;
    } else {
      delete nextConfig[platform];
    }

    await this.prisma.client.update({
      where: { id: clientId },
      data: { trackingConfig: nextConfig },
    });

    return this.getTracking(clientId);
  }

  async getPublic(slug: string) {
    const client = await this.prisma.client.findUnique({
      where: { storeSlug: slug },
      select: {
        id: true,
        name: true,
        apiKey: true,
        plan: true,
        subscription: true,
        storeTagline: true,
        brandingJson: true,
        trackingConfig: true,
      },
    });

    if (!client || !client.plan || !ELIGIBLE_PLANS.has(client.plan) || client.subscription === 'suspended') {
      throw new NotFoundException('This storefront is not available.');
    }

    const products = await this.prisma.product.findMany({
      where: { clientId: client.id, available: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        imageUrl: true,
        imageUrls: true,
        isService: true,
      },
    });

    const branding = (client.brandingJson as any) ?? {};
    const trackingSnippets = buildTrackingSnippets((client.trackingConfig as Record<string, string>) ?? {});

    return {
      businessName: client.name,
      tagline: client.storeTagline,
      logoUrl: branding.logoUrl ?? null,
      accentColor: branding.accentColor ?? null,
      apiKey: client.apiKey,
      trackingSnippets,
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        price: Number(p.price),
        imageUrl: p.imageUrl,
        imageUrls: (p.imageUrls as string[] | null) ?? [],
        isService: p.isService,
      })),
    };
  }
}
