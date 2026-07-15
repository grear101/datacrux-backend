import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { SendMessageDto } from './dto/send-message.dto';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ApiKeyClient } from '../auth/api-key-client.decorator';

@Controller('conversation')
@UseGuards(ApiKeyGuard) // customers authenticate with the business's public API key, not a login
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  @Post('message')
  async sendMessage(@Body() dto: SendMessageDto, @ApiKeyClient() client: { clientId: string }) {
    return this.conversationService.sendMessage({
      clientId: client.clientId,
      conversationId: dto.conversationId,
      customerId: dto.customerId,
      productId: dto.productId,
      message: dto.message,
    });
  }
}
