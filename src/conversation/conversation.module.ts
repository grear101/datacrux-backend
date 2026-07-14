import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { AiModule } from '../ai/ai.module';
import { NegotiationModule } from '../negotiation/negotiation.module';

@Module({
  imports: [AiModule, NegotiationModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
