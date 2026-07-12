import { Controller, Get, Module, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { canonicalDataId } from '../src/webhook/webhook.controller.js';

/**
 * O `data.id` canônico é a peça mais afiada da Camada 1: o MESMO valor assina o
 * manifesto HMAC e vira a chave do crédito. Verificar a assinatura do pagamento
 * X e creditar o pagamento Y seria o buraco perfeito — daí a regra ser
 * fail-closed em qualquer ambiguidade, nunca "escolhe um em silêncio".
 */
describe('canonicalDataId', () => {
  const body = (id: unknown): unknown => ({ type: 'payment', data: { id } });

  it('usa o data.id da query (é o que o MP assina no manifesto)', () => {
    expect(canonicalDataId({ 'data.id': '123', type: 'payment' }, body('123'))).toBe('123');
  });

  it('cai para o corpo quando a query não traz o id', () => {
    expect(canonicalDataId({ type: 'payment' }, body('456'))).toBe('456');
  });

  it('FAIL-CLOSED: query e corpo divergentes → sem id (vira 401 na Camada 1)', () => {
    // O vetor: replay de uma notificação legítima com o corpo trocado.
    expect(canonicalDataId({ 'data.id': '123' }, body('999'))).toBeNull();
  });

  it('normaliza antes de comparar — divergência só de caixa/espaço não é divergência', () => {
    expect(canonicalDataId({ 'data.id': ' ABC ' }, body('abc'))).toBe('abc');
  });

  it('MALFORMADO ≠ AUSENTE: array na query não cai no corpo em silêncio', () => {
    // Sem essa distinção, `?data.id=1&data.id=2` viraria "ausente" e forçaria o
    // fallback pro corpo — deixar o atacante ESCOLHER a fonte do id é o buraco.
    expect(canonicalDataId({ 'data.id': ['1', '2'] }, body('1'))).toBeNull();
  });

  it('id não-string no corpo (número, objeto) → sem id', () => {
    expect(canonicalDataId({}, body(123))).toBeNull();
    expect(canonicalDataId({}, body({ nested: true }))).toBeNull();
  });

  it('null no corpo é ausência, não corrupção — a query decide', () => {
    expect(canonicalDataId({ 'data.id': '77' }, body(null))).toBe('77');
    expect(canonicalDataId({}, body(null))).toBeNull();
  });

  it('string vazia não é id', () => {
    expect(canonicalDataId({ 'data.id': '' }, body(''))).toBeNull();
  });

  it('ausente nos dois → sem id', () => {
    expect(canonicalDataId({}, {})).toBeNull();
    expect(canonicalDataId(undefined, undefined)).toBeNull();
  });
});

/** Rota-sonda: devolve o `req.query` cru, como o Nest/Express o entregam. */
@Controller('probe')
class QueryProbeController {
  @Get()
  echo(@Req() req: Request): { query: unknown; canonical: string | null } {
    return { query: req.query, canonical: canonicalDataId(req.query, undefined) };
  }
}

@Module({ controllers: [QueryProbeController] })
class ProbeModule {}

/**
 * Premissa VERIFICADA, não assumida, contra o Nest/Express REAIS (a mesma pilha
 * que serve o webhook em produção): `?data.id=123` chega como a chave LITERAL
 * `data.id` em `req.query` — o parser de query não aninha em `{ data: { id } }`.
 *
 * É o alicerce da Camada 1 no modo real: se um upgrade do Express mudar esse
 * comportamento, este teste fica vermelho ANTES de a verificação de assinatura
 * passar a rejeitar todas as notificações legítimas do Mercado Pago.
 */
describe('req.query do Express (premissa da Camada 1)', () => {
  let app: INestApplication;
  // `getHttpServer()` é `any` no Nest 10; o supertest só precisa do http.Server.
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('entrega data.id como chave literal (não aninha)', async () => {
    const res = await request(server).get('/probe?data.id=12345&type=payment');
    const payload = res.body as { query: Record<string, unknown>; canonical: string | null };

    expect(payload.query['data.id']).toBe('12345');
    expect(payload.query['data']).toBeUndefined();
    expect(payload.canonical).toBe('12345');
  });

  it('parameter pollution real (?data.id=1&data.id=2) vira array → fail-closed', async () => {
    const res = await request(server).get('/probe?data.id=1&data.id=2');
    const payload = res.body as { query: Record<string, unknown>; canonical: string | null };

    expect(Array.isArray(payload.query['data.id'])).toBe(true);
    expect(payload.canonical).toBeNull();
  });
});
