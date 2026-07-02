import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildSignatureManifest,
  computeSignature,
  parseSignatureHeader,
  verifyHmac,
  verifySignature,
} from '../src/signature.js';

const SECRET = 'test-webhook-secret';
const DATA_ID = 'pay_123';
const REQUEST_ID = 'req-abc';
const TS = '1719800000';

function validHeaderFor(dataId: string, requestId: string, ts: string): string {
  const manifest = buildSignatureManifest({ dataId, requestId, ts });
  const v1 = computeSignature(manifest, SECRET);
  return `ts=${ts},v1=${v1}`;
}

describe('parseSignatureHeader', () => {
  it('extrai ts e v1 e ignora espaços', () => {
    expect(parseSignatureHeader('ts=123, v1=deadbeef')).toEqual({ ts: '123', v1: 'deadbeef' });
  });

  it('devolve null quando falta ts ou v1', () => {
    expect(parseSignatureHeader('v1=deadbeef')).toBeNull();
    expect(parseSignatureHeader('ts=123')).toBeNull();
    expect(parseSignatureHeader('')).toBeNull();
    expect(parseSignatureHeader('ts=,v1=')).toBeNull();
  });

  it('ignora segmentos sem "="', () => {
    expect(parseSignatureHeader('garbage,ts=1,v1=ab')).toEqual({ ts: '1', v1: 'ab' });
  });
});

describe('buildSignatureManifest', () => {
  it('monta o manifesto na ordem esperada', () => {
    expect(buildSignatureManifest({ dataId: 'a', requestId: 'b', ts: 'c' })).toBe(
      'id:a;request-id:b;ts:c;',
    );
  });
});

describe('verifyHmac', () => {
  it('aceita hmac idêntico', () => {
    const h = createHmac('sha256', SECRET).update('x').digest('hex');
    expect(verifyHmac(h, h)).toBe(true);
  });

  it('rejeita hmac diferente de mesmo tamanho', () => {
    const a = createHmac('sha256', SECRET).update('x').digest('hex');
    const b = createHmac('sha256', SECRET).update('y').digest('hex');
    expect(verifyHmac(a, b)).toBe(false);
  });

  it('rejeita comprimentos diferentes', () => {
    expect(verifyHmac('abcd', 'ab')).toBe(false);
  });

  it('rejeita hex vazio e hex inválido (esperado ou fornecido) sem lançar', () => {
    expect(verifyHmac('', '')).toBe(false);
    expect(verifyHmac('zz', 'zz')).toBe(false);
    expect(verifyHmac('abcd', 'zzzz')).toBe(false);
    expect(verifyHmac('zz', 'ab')).toBe(false);
  });
});

describe('verifySignature', () => {
  it('valida um webhook corretamente assinado', () => {
    const header = validHeaderFor(DATA_ID, REQUEST_ID, TS);
    const result = verifySignature({
      signatureHeader: header,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
    });
    expect(result).toEqual({ valid: true, ts: TS });
  });

  it('rejeita quando o segredo está errado', () => {
    const header = validHeaderFor(DATA_ID, REQUEST_ID, TS);
    const result = verifySignature({
      signatureHeader: header,
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: 'wrong',
    });
    expect(result.valid).toBe(false);
    expect(result.ts).toBe(TS);
  });

  it('rejeita quando o dataId foi adulterado (mas ainda extrai ts)', () => {
    const header = validHeaderFor(DATA_ID, REQUEST_ID, TS);
    const result = verifySignature({
      signatureHeader: header,
      requestId: REQUEST_ID,
      dataId: 'pay_999',
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
  });

  it('rejeita quando o request-id foi adulterado', () => {
    const header = validHeaderFor(DATA_ID, REQUEST_ID, TS);
    const result = verifySignature({
      signatureHeader: header,
      requestId: 'req-evil',
      dataId: DATA_ID,
      secret: SECRET,
    });
    expect(result.valid).toBe(false);
  });

  it('devolve inválido e ts nulo quando o header é malformado', () => {
    const result = verifySignature({
      signatureHeader: 'lixo',
      requestId: REQUEST_ID,
      dataId: DATA_ID,
      secret: SECRET,
    });
    expect(result).toEqual({ valid: false, ts: null });
  });
});
