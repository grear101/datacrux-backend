import { Module } from '@nestjs/common';
import { HandoversService } from './handovers.service';
import { HandoversController } from './handovers.controller';

@Module({
  controllers: [HandoversController],
  providers: [HandoversService],
  exports: [HandoversService],
})
export class HandoversModule {}
