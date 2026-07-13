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

    await this.service.process({
      rawBody,
      dataId: canonicalDataId(req.query, req.body),
      signatureHeader: this.header(req.headers['x-signature']),
      requestId: this.header(req.headers['x-request-id']),
    });

    return { received: true };
  }

  private header(value: string | string[] | undefined): string | null {
    return typeof value === 'string' ? value : null;
  }
}

/**
 * Três estados, não dois: AUSENTE (não veio) ≠ MALFORMADO (veio, mas não é uma
 * string usável — array de parameter pollution, objeto, número). Ausente permite
 * fallback; malformado é sinal de manipulação e derruba o request.
 */
type IdSlot =
  | { readonly kind: 'absent' }
  | { readonly kind: 'bad' }
  | { readonly kind: 'ok'; readonly value: string };

function readId(value: unknown): IdSlot {
  if (value === undefined || value === null) return { kind: 'absent' };
  if (typeof value !== 'string') return { kind: 'bad' };
  const normalized = value.trim().toLowerCase();
  return normalized === '' ? { kind: 'bad' } : { kind: 'ok', value: normalized };
}

/**
 * O `data.id` CANÔNICO — um único valor que atravessa a verificação do HMAC E a
 * consulta ao provedor. É a peça mais afiada da Camada 1.
 *
 * Por que a query: o Mercado Pago chama `POST /webhook?data.id=<id>&type=payment`
 * e o manifesto assinado usa esse id. Ler só do corpo (como antes) arriscava
 * rejeitar toda notificação legítima — fail-closed, mas a integração inteira
 * silenciosamente morta.
 *
 * Por que canônico: se a VERIFICAÇÃO usasse o id da query e a AÇÃO
 * (`getPayment`/`OrderCredit`) usasse o do corpo, um atacante que replicasse uma
 * notificação legítima trocando só o corpo faria a gente validar a assinatura do
 * pagamento X e creditar o pagamento Y. Uma variável só, sem segunda fonte.
 *
 * Divergência entre query e corpo é FAIL-CLOSED (devolve `null` → 401), nunca
 * "escolhe um em silêncio": ou os dois concordam, ou não há id.
 *
 * `toLowerCase()` é no-op para id numérico do MP — mantém o manifesto correto sob
 * as duas hipóteses de formato até a captura real confirmar (ver adr/0006).
 */
export function canonicalDataId(query: unknown, body: unknown): string | null {
  const q = query as Record<string, unknown> | undefined;
  const b = body as { data?: { id?: unknown } } | undefined;

  const fromQuery = readId(q?.['data.id']);
  const fromBody = readId(b?.data?.id);

  // Malformado em qualquer uma das fontes = manipulação. Não "ignora e usa a
  // outra": um `?data.id=1&data.id=2` (array) forçaria o fallback ao corpo, e
  // escolher fonte com base em input do atacante é justamente o que não se faz.
  if (fromQuery.kind === 'bad' || fromBody.kind === 'bad') return null;

  if (fromQuery.kind === 'ok' && fromBody.kind === 'ok') {
    return fromQuery.value === fromBody.value ? fromQuery.value : null;
  }
  if (fromQuery.kind === 'ok') return fromQuery.value;
  if (fromBody.kind === 'ok') return fromBody.value;
  return null;
}
