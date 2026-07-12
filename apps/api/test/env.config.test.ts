import { describe, expect, it } from 'vitest';
import { validateEnv } from '../src/config/env.config.js';

/**
 * O schema de env é uma trava de segurança, não uma conveniência de tipagem: o
 * processo se RECUSA A SUBIR com um ambiente incoerente. Melhor falhar no
 * arranque que em produção — e melhor ainda: falhar antes de tocar dinheiro real.
 */
const BASE = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  MP_WEBHOOK_SECRET: 'segredo-de-dev-com-16+',
  DEMO_TOKEN: 'demo-nao-secreto',
};

describe('validateEnv — travas do provedor de pagamento', () => {
  it('modo mock não exige credencial do Mercado Pago', () => {
    const env = validateEnv({ ...BASE, PAYMENT_PROVIDER: 'mock' });
    expect(env.PAYMENT_PROVIDER).toBe('mock');
    expect(env.MP_ACCESS_TOKEN).toBeUndefined();
  });

  it('modo mercadopago SEM credencial não sobe', () => {
    expect(() => validateEnv({ ...BASE, PAYMENT_PROVIDER: 'mercadopago' })).toThrow(
      /MP_ACCESS_TOKEN é obrigatório/,
    );
  });

  it('modo mercadopago com credencial de teste sobe', () => {
    const env = validateEnv({
      ...BASE,
      PAYMENT_PROVIDER: 'mercadopago',
      MP_ACCESS_TOKEN: 'TEST-1234567890-abc',
    });
    expect(env.MP_ACCESS_TOKEN).toBe('TEST-1234567890-abc');
  });

  it('TRAVA PERMANENTE: credencial de PRODUÇÃO do MP (APP_USR-) não sobe, nunca', () => {
    // "Não processa dinheiro real" é não-objetivo declarado (SECURITY.md §9), não
    // uma fase. Quem quiser mover dinheiro de verdade tem que apagar a trava
    // conscientemente — a fricção é o ponto.
    expect(() =>
      validateEnv({
        ...BASE,
        PAYMENT_PROVIDER: 'mercadopago',
        MP_ACCESS_TOKEN: 'APP_USR-1234567890-real',
      }),
    ).toThrow(/prefixo TEST-/);
  });

  it('a trava vale inclusive em produção (não é relaxada por NODE_ENV)', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'mercadopago',
        MP_ACCESS_TOKEN: 'APP_USR-1234567890-real',
      }),
    ).toThrow(/prefixo TEST-/);
  });

  it('a mensagem de erro NUNCA contém o valor do token', () => {
    const segredo = 'APP_USR-nao-me-vaze-1234567890';
    try {
      validateEnv({ ...BASE, PAYMENT_PROVIDER: 'mercadopago', MP_ACCESS_TOKEN: segredo });
      expect.unreachable('deveria ter lançado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain(segredo);
      expect(message).not.toContain('nao-me-vaze');
      expect(message).toMatch(/prefixo TEST-/);
    }
  });

  it('mock continua proibido em produção (trava que já existia)', () => {
    expect(() =>
      validateEnv({ ...BASE, NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock' }),
    ).toThrow(/mock é proibido em produção/);
  });
});
