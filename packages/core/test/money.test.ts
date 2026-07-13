import { describe, expect, it } from 'vitest';
import { centsToReais, formatBRL, reaisToCents } from '../src/money.js';

describe('formatBRL', () => {
  it('formata valor do produto do projeto', () => {
    expect(formatBRL(4700)).toBe('R$ 47,00');
  });

  it('formata zero', () => {
    expect(formatBRL(0)).toBe('R$ 0,00');
  });

  it('preenche centavos com zero à esquerda', () => {
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(90)).toBe('R$ 0,90');
  });

  it('agrupa milhares com ponto', () => {
    expect(formatBRL(100000)).toBe('R$ 1.000,00');
    expect(formatBRL(123456789)).toBe('R$ 1.234.567,89');
  });

  it('formata valores negativos', () => {
    expect(formatBRL(-4700)).toBe('-R$ 47,00');
  });

  it('rejeita valores não inteiros', () => {
    expect(() => formatBRL(47.5)).toThrow(TypeError);
    expect(() => formatBRL(Number.NaN)).toThrow(TypeError);
  });
});

/**
 * O provedor manda float em reais; o domínio é inteiro em centavos. Esta é a
 * fronteira onde um centavo some sem ninguém ver — daí os casos adversariais.
 */
describe('reaisToCents', () => {
  it('converte os valores que o IEEE-754 sabota', () => {
    // 19.99 * 100 === 1998.9999999999998 na aritmética crua.
    expect(reaisToCents(19.99)).toBe(1999);
    expect(reaisToCents(10.1)).toBe(1010);
    expect(reaisToCents(0.29)).toBe(29);
  });

  it('converte os casos triviais sem drama', () => {
    expect(reaisToCents(47)).toBe(4700);
    expect(reaisToCents(0)).toBe(0);
    expect(reaisToCents(0.01)).toBe(1);
    expect(reaisToCents(1234.56)).toBe(123456);
  });

  it('FAIL-CLOSED: precisão sub-centavo é ambiguidade, não ruído — recusa', () => {
    // BRL não tem 3ª casa. Arredondar em silêncio seria escolher um centavo no
    // lugar do provedor; preferimos quebrar alto.
    expect(() => reaisToCents(10.001)).toThrow(RangeError);
    expect(() => reaisToCents(0.005)).toThrow(RangeError);
  });

  it('recusa entrada não-numérica, não-finita ou negativa', () => {
    expect(() => reaisToCents(Number.NaN)).toThrow(TypeError);
    expect(() => reaisToCents(Number.POSITIVE_INFINITY)).toThrow(TypeError);
    expect(() => reaisToCents(-1)).toThrow(RangeError);
  });

  it('recusa valor fora da faixa segura de inteiro', () => {
    expect(() => reaisToCents(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
  });
});

describe('centsToReais', () => {
  it('converte centavos em reais para enviar ao provedor', () => {
    expect(centsToReais(4700)).toBe(47);
    expect(centsToReais(1999)).toBe(19.99);
    expect(centsToReais(1)).toBe(0.01);
  });

  it('ida e volta preserva o valor (o que importa: nada some no caminho)', () => {
    for (const cents of [1, 29, 1010, 1999, 4700, 123456]) {
      expect(reaisToCents(centsToReais(cents))).toBe(cents);
    }
  });

  it('recusa centavos não-inteiros (float não entra no domínio)', () => {
    expect(() => centsToReais(19.99)).toThrow(TypeError);
  });
});
