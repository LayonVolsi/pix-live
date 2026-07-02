import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookSource } from '@prisma/client';
import { buildSignatureManifest, computeSignature } from '@pix-live/core';
import { MockPaymentProvider } from '../payment/mock-payment-provider.js';
import { PAYMENT_PROVIDER } from '../payment/payment-provider.port.js';
import type { PaymentProvider } from '../payment/payment-provider.port.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WebhookService } from '../webhook/webhook.service.js';
import type { WebhookInput, WebhookOutcome } from '../webhook/webhook.service.js';

/**
 * Ações administrativas de demonstração. NUNCA reabrem a rota pública nem relaxam
 * qualquer camada: assinam o payload server-side (o segredo nunca sai do servidor)
 * e invocam o MESMO pipeline de verificação em processo. É o que exercita a
 * verificação real (simular) e demonstra a idempotência (replay).
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly webhook: WebhookService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** Simula a confirmação do pagamento (só no mock) e dispara o pipeline assinado. */
  async simulate(orderId: string): Promise<WebhookOutcome> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (order?.mpPaymentId == null) {
      throw new NotFoundException('pedido não encontrado ou sem cobrança gerada');
    }
    // Só o mock permite "forçar" aprovação — no sandbox real, paga-se o Pix de fato.
    if (!(this.provider instanceof MockPaymentProvider)) {
      throw new BadRequestException('simular confirmação só está disponível no modo mock');
    }
    this.provider.settle(order.mpPaymentId, 'approved');
    this.logger.log('Simulando confirmação de pagamento (mock)');
    return this.webhook.process(this.signSelf(order.mpPaymentId, WebhookSource.mercadopago));
  }

  /**
   * Reenvia um webhook: invoca o pipeline em processo com source=admin_replay e
   * um request-id NOVO. A Camada 3 detecta o crédito já existente → duplicata
   * (o "bloqueado 1×" do wow). Nunca posta na rota pública.
   */
  async replay(webhookEventId: string): Promise<WebhookOutcome> {
    const event = await this.prisma.webhookEvent.findUnique({ where: { id: webhookEventId } });
    if (event?.mpPaymentId == null) {
      throw new NotFoundException('evento de webhook não encontrado');
    }
    this.logger.log('Reenviando webhook em processo (admin_replay)');
    return this.webhook.process(this.signSelf(event.mpPaymentId, WebhookSource.admin_replay));
  }

  /** Monta um input de webhook assinado server-side (o segredo nunca vai ao browser). */
  private signSelf(dataId: string, source: WebhookSource): WebhookInput {
    const secret = this.config.get<string>('MP_WEBHOOK_SECRET') ?? '';
    const ts = String(Math.floor(Date.now() / 1000));
    const requestId = randomUUID();
    const v1 = computeSignature(buildSignatureManifest({ dataId, requestId, ts }), secret);
    return {
      rawBody: JSON.stringify({ type: 'payment', data: { id: dataId } }),
      dataId,
      signatureHeader: `ts=${ts},v1=${v1}`,
      requestId,
      source,
    };
  }
}
