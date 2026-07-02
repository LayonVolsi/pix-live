import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ANTI_REPLAY_WINDOW_MS,
  decideVerdict,
  httpStatusForVerdict,
  isTimestampWithinWindow,
  verdictResultsInCredit,
  type WebhookEvaluation,
} from '../src/idempotency.js';

const OK: WebhookEvaluation = {
  signatureValid: true,
  requestIdAlreadyProcessed: false,
  orderKnown: true,
  creditAlreadyExists: false,
  tsWithinWindow: true,
};

describe('decideVerdict', () => {
  it('processa um webhook válido e inédito', () => {
    expect(decideVerdict(OK)).toBe('processado');
  });

  it('assinatura inválida barra tudo, mesmo com o resto ok', () => {
    expect(decideVerdict({ ...OK, signatureValid: false })).toBe('assinatura_invalida');
  });

  it('request-id repetido → duplicata_ignorada (dedupe da Camada 2)', () => {
    expect(decideVerdict({ ...OK, requestIdAlreadyProcessed: true })).toBe('duplicata_ignorada');
  });

  it('pedido desconhecido → pagamento_desconhecido', () => {
    expect(decideVerdict({ ...OK, orderKnown: false })).toBe('pagamento_desconhecido');
  });

  it('crédito já existente → duplicata_ignorada (idempotência da Camada 3)', () => {
    expect(decideVerdict({ ...OK, creditAlreadyExists: true })).toBe('duplicata_ignorada');
  });

  it('ts fora da janela com HMAC válido → ts_suspeito (sinal, não rejeição)', () => {
    expect(decideVerdict({ ...OK, tsWithinWindow: false })).toBe('ts_suspeito');
  });

  it('assinatura inválida tem precedência sobre request-id repetido', () => {
    expect(decideVerdict({ ...OK, signatureValid: false, requestIdAlreadyProcessed: true })).toBe(
      'assinatura_invalida',
    );
  });

  it('dedupe por request-id tem precedência sobre crédito existente', () => {
    expect(
      decideVerdict({ ...OK, requestIdAlreadyProcessed: true, creditAlreadyExists: true }),
    ).toBe('duplicata_ignorada');
  });
});

describe('verdictResultsInCredit', () => {
  it('credita em processado e ts_suspeito', () => {
    expect(verdictResultsInCredit('processado')).toBe(true);
    expect(verdictResultsInCredit('ts_suspeito')).toBe(true);
  });

  it('não credita em rejeição/duplicata/erro', () => {
    for (const v of [
      'assinatura_invalida',
      'duplicata_ignorada',
      'pagamento_desconhecido',
      'erro',
    ] as const) {
      expect(verdictResultsInCredit(v)).toBe(false);
    }
  });
});

describe('httpStatusForVerdict', () => {
  it('401 só para assinatura inválida', () => {
    expect(httpStatusForVerdict('assinatura_invalida')).toBe(401);
  });

  it('500 para erro interno', () => {
    expect(httpStatusForVerdict('erro')).toBe(500);
  });

  it('200 (ack) para todo o resto — reentrega é inofensiva', () => {
    for (const v of [
      'processado',
      'ts_suspeito',
      'duplicata_ignorada',
      'pagamento_desconhecido',
    ] as const) {
      expect(httpStatusForVerdict(v)).toBe(200);
    }
  });
});

describe('isTimestampWithinWindow', () => {
  const now = 1_719_800_000_000; // ms

  it('aceita ts dentro da janela padrão de 24h', () => {
    const oneHourAgoSeconds = now / 1000 - 3600;
    expect(isTimestampWithinWindow(oneHourAgoSeconds, now)).toBe(true);
  });

  it('rejeita ts além da janela', () => {
    const twoDaysAgoSeconds = now / 1000 - 2 * 24 * 3600;
    expect(isTimestampWithinWindow(twoDaysAgoSeconds, now)).toBe(false);
  });

  it('aceita exatamente na borda da janela', () => {
    const edgeSeconds = (now - DEFAULT_ANTI_REPLAY_WINDOW_MS) / 1000;
    expect(isTimestampWithinWindow(edgeSeconds, now)).toBe(true);
  });

  it('respeita janela customizada', () => {
    const tenSecondsAgo = now / 1000 - 10;
    expect(isTimestampWithinWindow(tenSecondsAgo, now, 5000)).toBe(false);
    expect(isTimestampWithinWindow(tenSecondsAgo, now, 15000)).toBe(true);
  });

  it('rejeita valores não finitos sem lançar', () => {
    expect(isTimestampWithinWindow(Number.NaN, now)).toBe(false);
    expect(isTimestampWithinWindow(now / 1000, Number.POSITIVE_INFINITY)).toBe(false);
  });
});
