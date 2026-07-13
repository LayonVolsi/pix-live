import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoPaymentProvider } from './mercadopago-payment-provider.js';
import { MockPaymentProvider } from './mock-payment-provider.js';
import { OutboundBudgetService } from './outbound-budget.service.js';
import { PAYMENT_PROVIDER } from './payment-provider.port.js';
import type { PaymentProvider } from './payment-provider.port.js';

/**
 * Seleciona a implementação do provedor por env (`PAYMENT_PROVIDER`). O resto da
 * aplicação fala com a porta, nunca com o provedor concreto — trocar de modo é
 * trocar um binding.
 *
 * O default segue `mock` (offline, sem conta no MP). O modo real exige
 * `MP_ACCESS_TOKEN` de TESTE — garantido pelo schema de env, que se recusa a
 * subir com credencial de produção (ver `env.config.ts` e SECURITY.md §7).
 */
@Module({
  providers: [
    OutboundBudgetService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider => {
        if (config.get<string>('PAYMENT_PROVIDER') !== 'mercadopago') {
          return new MockPaymentProvider();
        }
        // O Zod já garantiu presença e prefixo TEST-; aqui só falharia se alguém
        // instanciasse o módulo fora do boot validado.
        // DÍVIDA TÉCNICA (backlog B12): este é o 2º guard idêntico contra
        // `string | undefined` porque o ConfigService é injetado sem o generic
        // `<Env, true>`. Na 3ª credencial, trocar por `ConfigService<Env, true>`
        // ou um helper `requireEnvVar()` — deferido para não amalgamar refactor.
        const token = config.get<string>('MP_ACCESS_TOKEN');
        if (token === undefined || token === '') {
          throw new Error('MP_ACCESS_TOKEN ausente no modo mercadopago');
        }
        const payerEmail = config.get<string>('MP_TEST_PAYER_EMAIL');
        if (payerEmail === undefined || payerEmail === '') {
          throw new Error('MP_TEST_PAYER_EMAIL ausente no modo mercadopago');
        }
        return new MercadoPagoPaymentProvider(token, payerEmail);
      },
    },
  ],
  exports: [PAYMENT_PROVIDER, OutboundBudgetService],
})
export class PaymentModule {}
