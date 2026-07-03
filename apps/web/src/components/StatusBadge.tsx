import type { ReactElement } from 'react';

interface Visual {
  readonly rotulo: string;
  readonly classes: string;
}

const VISUAIS: Readonly<Record<string, Visual>> = {
  pending: { rotulo: 'Aguardando pagamento', classes: 'border-alerta text-alerta' },
  paid: { rotulo: 'Pago', classes: 'border-pix-tinta bg-pix-tinta text-white' },
  expired: { rotulo: 'Expirado', classes: 'border-tinta-fraca text-tinta-fraca' },
  cancelled: { rotulo: 'Cancelado', classes: 'border-erro text-erro' },
  rejected: { rotulo: 'Rejeitado', classes: 'border-erro text-erro' },
};

/**
 * Estado do pedido como carimbo de extrato. A mudança pra "Pago" é anunciada
 * pelo aria-live do contêiner (a página envolve o badge — texto, não só cor).
 */
export function StatusBadge({ status }: { readonly status: string }): ReactElement {
  const visual = VISUAIS[status] ?? { rotulo: status, classes: 'border-tinta-fraca' };
  return (
    <span
      className={`inline-block border-2 px-3 py-1 font-mono text-xs font-bold uppercase tracking-[0.18em] ${visual.classes}`}
    >
      {visual.rotulo}
    </span>
  );
}
