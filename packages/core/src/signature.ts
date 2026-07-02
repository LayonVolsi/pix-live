import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Camada 1 (autenticidade): verificação de assinatura HMAC-SHA256 do webhook,
 * em tempo constante.
 *
 * O manifesto exato do Mercado Pago (ordem/campos) é confirmado contra a doc do
 * provedor na integração — ver adr/0002. As funções aqui são genéricas: recebem
 * os componentes já extraídos, então permanecem corretas independentemente do
 * template exato.
 */

export interface ParsedSignature {
  readonly ts: string;
  readonly v1: string;
}

/** Faz o parse do header `x-signature` no formato `ts=<...>,v1=<hex>`. */
export function parseSignatureHeader(header: string): ParsedSignature | null {
  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'v1') v1 = value;
  }
  if (ts === undefined || ts === '' || v1 === undefined || v1 === '') return null;
  return { ts, v1 };
}

/** Remonta o manifesto assinado a partir dos componentes do webhook. */
export function buildSignatureManifest(input: {
  readonly dataId: string;
  readonly requestId: string;
  readonly ts: string;
}): string {
  return `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
}

/** Calcula o HMAC-SHA256 hex de um manifesto com o segredo do webhook. */
export function computeSignature(manifest: string, secret: string): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/**
 * Compara dois HMAC em hex em tempo constante.
 * Falha fechada: hex inválido ou comprimentos distintos → `false`, sem lançar.
 */
export function verifyHmac(expectedHex: string, providedHex: string): boolean {
  if (!/^[0-9a-f]+$/i.test(providedHex) || !/^[0-9a-f]+$/i.test(expectedHex)) {
    return false;
  }
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  if (expected.length === 0 || expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export interface VerifySignatureInput {
  readonly signatureHeader: string;
  readonly requestId: string;
  readonly dataId: string;
  readonly secret: string;
}

export interface VerifySignatureResult {
  readonly valid: boolean;
  /** `ts` extraído do header (em segundos, string) — usado na Camada 2. */
  readonly ts: string | null;
}

/** Verificação de ponta a ponta: parse → remontar manifesto → comparar HMAC. */
export function verifySignature(input: VerifySignatureInput): VerifySignatureResult {
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (parsed === null) return { valid: false, ts: null };
  const manifest = buildSignatureManifest({
    dataId: input.dataId,
    requestId: input.requestId,
    ts: parsed.ts,
  });
  const expected = computeSignature(manifest, input.secret);
  return { valid: verifyHmac(expected, parsed.v1), ts: parsed.ts };
}
