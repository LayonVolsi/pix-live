import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockPaymentProvider } from './mock-payment-provider.js';
import { PAYMENT_PROVIDER } from './payment-provider.port.js';
import type { PaymentProvider } from './payment-provider.port.js';

/**
 * Seleciona a implementação do provedor por env (`PAYMENT_PROVIDER`). Hoje só o
 * mock existe; o adapter real do Mercado Pago (sandbox) entra na fase 4 — trocar
 * é só mudar o binding, o resto da app fala com a porta `PAYMENT_PROVIDER`.
 */
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentProvider => {
        const provider = config.get<string>('PAYMENT_PROVIDER');
        if (provider === 'mercadopago') {
          throw new Error(
            'Provedor "mercadopago" entra na fase 4; use PAYMENT_PROVIDER=mock por enquanto.',
          );
        }
        return new MockPaymentProvider();
      },
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentModule {}
