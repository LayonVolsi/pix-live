import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Modo em que a API está rodando — o que o front precisa saber, e nada além. */
export interface RuntimeConfigView {
  /** `mock` (offline) ou `mercadopago` (sandbox real). */
  readonly paymentProvider: 'mock' | 'mercadopago';
  /** O botão "simular confirmação" só existe no mock (no real, quem paga é o pagador). */
  readonly canSimulatePayment: boolean;
}

/**
 * Expõe o MODO da API — nunca segredo, nunca credencial.
 *
 * Existe por honestidade de produto: no modo real, "simular confirmação" não faz
 * sentido (não dá para fingir que alguém pagou no Mercado Pago) e a rota devolve
 * 400. Um botão que só falha é pior que um botão ausente — o front esconde o
 * controle e mostra o selo do modo, em vez de deixar o visitante bater a cabeça.
 */
@Controller({ path: 'config', version: '1' })
export class ConfigController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  get(): RuntimeConfigView {
    const provider =
      this.config.get<string>('PAYMENT_PROVIDER') === 'mercadopago' ? 'mercadopago' : 'mock';
    return {
      paymentProvider: provider,
      canSimulatePayment: provider === 'mock',
    };
  }
}
