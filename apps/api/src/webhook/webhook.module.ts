import { Module } from '@nestjs/common';
import { PaymentModule } from '../payment/payment.module.js';
import { WebhookController } from './webhook.controller.js';
import { WebhookService } from './webhook.service.js';

/**
 * PrismaService (global) e ConfigService (global) já estão disponíveis; importa
 * PaymentModule para injetar o token PAYMENT_PROVIDER no WebhookService.
 */
@Module({
  imports: [PaymentModule],
  controllers: [WebhookController],
  providers: [WebhookService],
  exports: [WebhookService], // AdminModule injeta o pipeline para simular/replay
})
export class WebhookModule {}
