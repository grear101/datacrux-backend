import { Body, Controller, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationService } from './conversation.service';
import { SendMessageDto } from './dto/send-message.dto';

@Controller('conversation')
export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly config: ConfigService,
  ) {}

  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto) {
    // Same Phase 1 pattern as the negotiation controller: clientId comes from
    // server config until the Auth Service exists, never from the request.
    const clientId = this.config.getOrThrow<string>('ACTIVE_CLIENT_ID');

   return this.conversationService.sendMessage({
      clientId,
      conversationId: dto.conversationId,
      customerId: dto.customerId,
      productId: dto.productId,
      message: dto.message,
    });
  }
}
