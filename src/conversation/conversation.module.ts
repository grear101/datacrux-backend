import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { AiModule } from '../ai/ai.module';
import { NegotiationModule } from '../negotiation/negotiation.module';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [AiModule, NegotiationModule, OrdersModule, CustomersModule],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
