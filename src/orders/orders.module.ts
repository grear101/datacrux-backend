import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { NegotiationModule } from '../negotiation/negotiation.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [NegotiationModule, CustomersModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
