import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NegotiationService } from './negotiation.service';
import { EvaluateNegotiationDto } from './dto/evaluate-negotiation.dto';

@Controller('negotiation')
export class NegotiationController {
  constructor(
    private readonly negotiationService: NegotiationService,
    private readonly config: ConfigService,
  ) {}

  @Post('evaluate')
  async evaluate(@Body() dto: EvaluateNegotiationDto) {
    // Phase 1 is single-tenant: clientId comes from server config, not the request,
    // so there's no attack surface for tenant spoofing before Auth Service exists.
    // Phase 2 replaces this with clientId extracted from a verified JWT/API key.
    const clientId = this.config.getOrThrow<string>('ACTIVE_CLIENT_ID');

    return this.negotiationService.evaluate({
      clientId,
      productId: dto.productId,
      requestedPrice: dto.requestedPrice,
      quantity: dto.quantity,
    });
  }
}
