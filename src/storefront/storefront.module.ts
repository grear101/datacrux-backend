import { Module } from '@nestjs/common';
import { StorefrontService } from './storefront.service';
import { StorefrontController } from './storefront.controller';

@Module({
  controllers: [StorefrontController],
  providers: [StorefrontService],
})
export class StorefrontModule {}
