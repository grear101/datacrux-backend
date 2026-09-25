import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationController } from './conversation.controller';
import { AiModule } from '../ai/ai.module';
import { NegotiationModule } from '../negotiation/negotiation.module';
import { OrdersModule } from '../orders/orders.module';
import { CustomersModule } from '../customers/customers.module';
import { HandoversModule } from '../handovers/handovers.module';
import { ProductsModule } from '../products/products.module';
import { ClientsModule } from '../clients/clients.module';

@Module({
  imports: [
    AiModule,
    NegotiationModule,
    OrdersModule,
    CustomersModule,
    HandoversModule,
    ProductsModule,
    ClientsModule,
  ],
  controllers: [ConversationController],
  providers: [ConversationService],
})
export class ConversationModule {}
