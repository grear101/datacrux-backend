import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { checkAvailability, unavailableBody } from '../common/subscription.util';

// This is deliberately much lighter than JwtAuthGuard: no login, no
// expiring session - just a long-lived key each business embeds in their
// own website's chat widget. It identifies WHICH BUSINESS is talking, not
// which admin is logged in, so it's the right fit for customer-facing chat.
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing x-api-key header.');
    }

    const client = await this.prisma.client.findUnique({ where: { apiKey } });
    if (!client) {
      throw new UnauthorizedException('Invalid API key.');
    }

    // A suspended account or an expired trial gets no answers at all - not
    // even for a chat already in progress. This is read straight from the
    // database on every message (never cached), so suspending a business
    // takes effect on its very next message.
    const availability = checkAvailability(client);
    if (!availability.available) {
      throw new ForbiddenException(unavailableBody(availability.reason));
    }

    // Attach the resolved clientId the same way JwtStrategy attaches `user`,
    // so controllers can read it consistently either way.
    request.apiKeyClient = { clientId: client.id };
    return true;
  }
}
