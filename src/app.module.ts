import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { NegotiationModule } from './negotiation/negotiation.module';
import { AiModule } from './ai/ai.module';
import { ConversationModule } from './conversation/conversation.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { HandoversModule } from './handovers/handovers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Default rate limit for every route: 100 requests per 60 seconds,
    // tracked per IP address. Individual routes (like /auth/login below)
    // can override this with a stricter limit using @Throttle(). This is a
    // sensible starting point for a business's customers chatting through
    // the widget - generous enough that a real conversation never trips
    // it, tight enough to blunt a scripted flood.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    NegotiationModule,
    AiModule,
    ConversationModule,
    AuthModule,
    ProductsModule,
    ClientsModule,
    OrdersModule,
    HandoversModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Applies the throttler to every route automatically, app-wide -
    // no need to remember to add a guard to each new controller.
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
