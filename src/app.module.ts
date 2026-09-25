import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
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
    // tracked per IP address. Individual routes (like /auth/login) can
    // override this with a stricter limit using @Throttle().
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    // @Global() - registered once here, injectable anywhere in the app
    // afterwards without needing to import RedisModule in every module
    // that wants to use it.
    RedisModule,
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
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
