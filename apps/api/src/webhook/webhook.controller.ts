import { Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { WebhookService } from './webhook.service.js';

/**
 * Rota PÚBLICA do webhook do Mercado Pago. Fina de propósito: extrai os fatos
 * (raw body, data.id defensivo, headers) e delega ao service. NUNCA aceita flag
 * do cliente que relaxe qualquer camada. Rate limit próprio, mais agressivo que
 * o global. Resposta mínima e uniforme (o service lança em 401/500).
 */
@Controller({ path: 'webhooks', version: '1' })
export class WebhookController {
  constructor(private readonly service: WebhookService) {}

  @Post('mercadopago')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async mercadopago(@Req() req: RawBodyRequest<Request>): Promise<{ received: true }> {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    // Corpo é input hostil não-autenticado neste ponto: acesso defensivo.
    const body = req.body as { data?: { id?: unknown } } | undefined;
    const dataId = typeof body?.data?.id === 'string' ? body.data.id : null;

    await this.service.process({
      rawBody,
      dataId,
      signatureHeader: this.header(req.headers['x-signature']),
      requestId: this.header(req.headers['x-request-id']),
    });

    return { received: true };
  }

  private header(value: string | string[] | undefined): string | null {
    return typeof value === 'string' ? value : null;
  }
}
