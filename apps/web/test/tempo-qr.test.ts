import { describe, expect, it } from 'vitest';
import { qrDataUri } from '../src/lib/qr';
import { msRestante, rotuloRestante } from '../src/lib/tempo';

describe('tempo — contador de expiração', () => {
  it('deriva o restante do relógio e clampa em zero após expirar', () => {
    const expira = '2026-07-03T12:15:00.000Z';
    const t0 = new Date('2026-07-03T12:00:30.000Z').getTime();
    expect(msRestante(expira, t0)).toBe(14.5 * 60 * 1000);
    const depois = new Date('2026-07-03T12:15:01.000Z').getTime();
    expect(msRestante(expira, depois)).toBe(0);
  });

  it('formata mm:ss com zero à esquerda, minutos corridos acima de 1h', () => {
    expect(rotuloRestante(14.5 * 60 * 1000)).toBe('14:30');
    expect(rotuloRestante(5_000)).toBe('00:05');
    expect(rotuloRestante(0)).toBe('00:00');
    expect(rotuloRestante(75 * 60 * 1000)).toBe('75:00');
  });
});

describe('qr — sanity check do data-URI', () => {
  it('base64 legítimo vira data:image/png', () => {
    expect(qrDataUri('iVBORw0KGgoAAAANSUhEUg==')).toBe(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==',
    );
  });

  it('lixo, vazio e null são recusados (nunca viram src)', () => {
    expect(qrDataUri(null)).toBeNull();
    expect(qrDataUri('')).toBeNull();
    expect(qrDataUri('javascript:alert(1)')).toBeNull();
    expect(qrDataUri('AAA BBB')).toBeNull();
    expect(qrDataUri('data:text/html;base64,PGI+')).toBeNull();
  });
});
