import { Module } from '@nestjs/common';
import { RetentionService } from './retention.service.js';

/**
 * Retenção da demo. O `ScheduleModule.forRoot()` (registrado no AppModule) descobre o
 * `@Interval` deste service. `PrismaService` vem do PrismaModule global.
 */
@Module({
  providers: [RetentionService],
})
export class RetentionModule {}
