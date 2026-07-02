import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module.js';
import { WebhookModule } from '../webhook/webhook.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { DemoTokenGuard } from './demo-token.guard.js';

@Module({
  imports: [WebhookModule, PaymentModule],
  controllers: [AdminController],
  providers: [AdminService, DemoTokenGuard],
})
export class AdminModule {}
