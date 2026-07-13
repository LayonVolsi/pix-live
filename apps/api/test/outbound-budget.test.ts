import { beforeEach, describe, expect, it } from 'vitest';
import {
  CREATE_CHARGE_BUDGET,
  OutboundBudgetService,
  REPLAY_LOOKUP_BUDGET,
} from '../src/payment/outbound-budget.service.js';

/**
 * Não é rate limit de HTTP — é o teto de quanto esta demo pública pode gastar
 * contra a conta de OUTRA pessoa no provedor de pagamento. O throttler por IP
 * protege o nosso processo; um atacante com IPs rotativos passa por baixo dele e
 * segue criando cobranças de verdade na conta do operador.
 */
describe('OutboundBudgetService', () => {
  let budget: OutboundBudgetService;

  beforeEach(() => {
    budget = new OutboundBudgetService();
  });

  it('libera enquanto há orçamento e recusa quando esgota', () => {
    const janela = [{ limit: 3, windowMs: 60_000 }];

    expect(budget.consume('k', janela)).toBe(true);
    expect(budget.consume('k', janela)).toBe(true);
    expect(budget.consume('k', janela)).toBe(true);
    // Esgotou: o chamador DEVE recusar a operação, nunca degradar em silêncio.
    expect(budget.consume('k', janela)).toBe(false);
    expect(budget.consume('k', janela)).toBe(false);
  });

  it('chaves diferentes têm orçamentos independentes', () => {
    const janela = [{ limit: 1, windowMs: 60_000 }];

    expect(budget.consume('create_charge', janela)).toBe(true);
    expect(budget.consume('create_charge', janela)).toBe(false);
    // O replay não é penalizado por a criação de cobranças ter estourado.
    expect(budget.consume('replay_lookup', janela)).toBe(true);
  });

  it('a janela MAIS RESTRITIVA vence (rajada não fura o teto diário)', () => {
    // Teto duplo: a janela curta contém a rajada; a longa contém a maratona.
    const janelas = [
      { limit: 10, windowMs: 60 * 60 * 1000 },
      { limit: 2, windowMs: 24 * 60 * 60 * 1000 },
    ];

    expect(budget.consume('k', janelas)).toBe(true);
    expect(budget.consume('k', janelas)).toBe(true);
    // A janela de hora ainda tem folga (2 de 10), mas a de dia esgotou.
    expect(budget.consume('k', janelas)).toBe(false);
  });

  it('o balde não cresce sem limite (consumos velhos são descartados)', () => {
    const janelaCurtissima = [{ limit: 1, windowMs: 1 }];

    expect(budget.consume('k', janelaCurtissima)).toBe(true);
    // Espera a janela passar sem sleep artificial: um laço curto basta.
    const inicio = performance.now();
    while (performance.now() - inicio < 5) {
      /* aguarda a janela de 1ms expirar */
    }
    expect(budget.consume('k', janelaCurtissima)).toBe(true);
  });

  it('os tetos configurados são os que a demo declara', () => {
    // Criar cobrança é a operação CARA (cria objeto na conta do provedor).
    expect(CREATE_CHARGE_BUDGET).toEqual([
      { limit: 30, windowMs: 3_600_000 },
      { limit: 200, windowMs: 86_400_000 },
    ]);
    // Replay é leitura — e o caminho da demonstração nem chega a consultar o provedor.
    expect(REPLAY_LOOKUP_BUDGET).toEqual([{ limit: 5, windowMs: 60_000 }]);
  });
});
