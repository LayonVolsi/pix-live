import type { ReactElement } from 'react';

interface Visual {
  readonly rotulo: string;
  readonly classes: string;
}

const VISUAIS: Readonly<Record<string, Visual>> = {
  processado: { rotulo: 'processado', classes: 'border-pix-tinta text-pix-tinta' },
  duplicata_ignorada: { rotulo: 'duplicata ignorada', classes: 'border-alerta text-alerta' },
  assinatura_invalida: { rotulo: 'assinatura inválida', classes: 'border-erro text-erro' },
  ts_suspeito: { rotulo: 'ts suspeito', classes: 'border-alerta text-alerta' },
  pagamento_desconhecido: {
    rotulo: 'pagamento desconhecido',
    classes: 'border-tinta-fraca text-tinta-fraca',
  },
  erro: { rotulo: 'erro', classes: 'border-erro text-erro' },
};

/** Veredito da trilha de auditoria como carimbo — texto sempre, cor por cima. */
export function VerdictBadge({ verdict }: { readonly verdict: string }): ReactElement {
  const visual = VISUAIS[verdict] ?? { rotulo: verdict, classes: 'border-tinta-fraca' };
  return (
    <span
      className={`inline-block whitespace-nowrap border px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider ${visual.classes}`}
    >
      {visual.rotulo}
    </span>
  );
}
