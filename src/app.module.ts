import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { SentryModule } from '@sentry/nestjs/setup';
import { SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NegotiationModule } from './negotiation/negotiation.module';
import { AiModule } from './ai/ai.module';
import { ConversationModule } from './conversation/conversation.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { HandoversModule } from './handovers/handovers.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    // Sentry's own setup module - Sentry's docs specifically call for this
    // to be the FIRST import in the whole app, so it's registered before
    // anything else has a chance to run.
    SentryModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    RedisModule,
    NotificationsModule,
    NegotiationModule,
    AiModule,
    ConversationModule,
    AuthModule,
    ProductsModule,
    ClientsModule,
    OrdersModule,
    HandoversModule,
    AnalyticsModule,
  ],
  controllers: [AppController],
  providers: [
    // Reports every unhandled error, app-wide, to Sentry. Per Sentry's own
    // docs, this needs to be registered before any other exception
    // filters - there aren't any others here, so it's simply added first.
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
