import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { NegotiationService } from './negotiation.service';
import { EvaluateNegotiationDto } from './dto/evaluate-negotiation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('negotiation')
@UseGuards(JwtAuthGuard)
export class NegotiationController {
  constructor(private readonly negotiationService: NegotiationService) {}

  @Post('evaluate')
  async evaluate(@Body() dto: EvaluateNegotiationDto, @CurrentUser() user: { clientId: string }) {
    return this.negotiationService.evaluate({
      clientId: user.clientId,
      productId: dto.productId,
      requestedPrice: dto.requestedPrice,
      quantity: dto.quantity,
    });
  }
}