import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifySignature } from '@pix-live/core';
import { describe, expect, it } from 'vitest';
import { canonicalDataId } from '../src/webhook/webhook.controller.js';

/**
 * Teste-âncora da Camada 1 contra a forma REAL do tráfego do Mercado Pago.
 *
 * A janela de prova (2026-07-12) capturou uma notificação real do sandbox e
 * confirmou, empiricamente, duas coisas (ver SECURITY.md §0 e adr/0006):
 *   P1 — o `data.id` vem na QUERY string (é ela que assina o manifesto);
 *   P2 — o manifesto `id;request-id;ts` re-hasheado com o segredo bate com o `v1`.
 *
 * A fixture aqui é SINTÉTICA (ids/ts sintéticos, re-assinada com segredo de
 * teste, PII zerada) mas modelada nessa forma provada. Este teste amarra P1 e P2
 * JUNTOS, sem Postgres: fica vermelho se a extração da query OU o formato do
 * manifesto regredirem — antes de a verificação passar a rejeitar toda
 * notificação legítima do MP. Cobertura que nenhum teste existente dá combinada:
 * `webhook-controller.test.ts` cobre só `canonicalDataId`; `webhook.integration`
 * cobre a assinatura mas recebe o `data.id` já extraído e pula sem banco.
 */
interface Camada1Fixture {
  readonly testSecret: string;
  readonly request: {
    readonly query: Record<string, unknown>;
    readonly headers: Record<string, string>;
    readonly body: { readonly data: { readonly id: string } };
  };
  readonly expected: { readonly canonicalDataId: string; readonly signatureValid: boolean };
}

// Path fixo, derivado de import.meta.url (constante de compilação, nunca input) —
// o alerta de fs com argumento não-literal é falso-positivo neste caso.
// eslint-disable-next-line security/detect-non-literal-fs-filename
const raw = readFileSync(
  fileURLToPath(new URL('./fixtures/camada1-mp-notificacao.json', import.meta.url)),
  'utf8',
);
const fixture = JSON.parse(raw) as Camada1Fixture;

describe('Camada 1 — forma real do tráfego do Mercado Pago (fixture da janela)', () => {
  it('P1: o data.id canônico vem da query string capturada', () => {
    const canonical = canonicalDataId(fixture.request.query, fixture.request.body);
    expect(canonical).toBe(fixture.expected.canonicalDataId);
  });

  it('P2: o manifesto do id da query verifica contra a assinatura re-assinada', () => {
    // Encadeia P1 → P2: o MESMO id extraído da query alimenta a verificação HMAC.
    const canonical = canonicalDataId(fixture.request.query, fixture.request.body);
    expect(canonical).not.toBeNull();

    const result = verifySignature({
      signatureHeader: fixture.request.headers['x-signature'] ?? '',
      requestId: fixture.request.headers['x-request-id'] ?? '',
      dataId: canonical!,
      secret: fixture.testSecret,
    });

    expect(result.valid).toBe(fixture.expected.signatureValid);
  });
});
