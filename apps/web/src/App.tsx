import type { ReactElement } from 'react';

/**
 * Casca mínima do scaffold — as rotas reais (loja, pagamento, painel) entram
 * nos próximos incrementos. Serve pra provar build/lint/typecheck/teste verdes.
 */
export function App(): ReactElement {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-tinta-fraca">
        demo sandbox — não processa dinheiro real
      </p>
      <h1 className="mt-3 text-3xl font-bold">
        Pix Live
        <span aria-hidden="true" className="text-pix-escuro">
          {' '}
          ▮
        </span>
      </h1>
      <p className="mt-4 max-w-prose text-tinta-fraca">
        Checkout Pix que não duplica dinheiro: webhook assinado, idempotência por constraint de
        banco e replay ao vivo. A loja, a página de pagamento e o painel de conciliação chegam nos
        próximos incrementos.
      </p>
    </main>
  );
}
