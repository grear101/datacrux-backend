import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsSchedulerService } from './notifications-scheduler.service';

@Global()
@Module({
  providers: [NotificationsService, NotificationsSchedulerService],
  exports: [NotificationsService, NotificationsSchedulerService],
})
export class NotificationsModule {}
