import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { VerdictBadge } from '../components/VerdictBadge';

/** Polling do painel: 3s, pausado quando a aba perde o foco (Page Visibility). */
const POLLING_PAINEL_MS = 3000;

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour12: false });
}

/**
 * Painel de conciliação — observabilidade de domínio como página pública
 * (leitura por design; escrita só nas rotas admin). O e-mail já chega mascarado
 * do backend; os contadores são agregados por veredito, nunca campo solto.
 */
export function Painel(): ReactElement {
  const painel = useQuery({
    queryKey: ['panel'],
    queryFn: api.painel,
    refetchInterval: POLLING_PAINEL_MS,
    refetchIntervalInBackground: false,
  });

  // A DEMONSTRAÇÃO: reenvia o webhook em processo (rota admin) e a idempotência bloqueia
  // a 2ª entrega — o contador do pedido vira "processado 1× · bloqueado 1×".
  const queryClient = useQueryClient();
  const reenviar = useMutation({
    mutationFn: (eventId: string) => api.reenviarWebhook(eventId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['panel'] }),
  });

  if (painel.isPending) {
    return (
      <p className="py-16 text-center font-mono text-sm text-tinta-fraca" role="status">
        Carregando painel…
      </p>
    );
  }

  if (painel.isError || painel.data === undefined) {
    return (
      <p className="py-16 text-center text-tinta-fraca" role="alert">
        {painel.error instanceof ApiError
          ? painel.error.message
          : 'Não foi possível carregar o painel.'}
      </p>
    );
  }

  const { orders, events } = painel.data;

  return (
    <section aria-labelledby="painel-titulo" className="py-10">
      <h1 id="painel-titulo" className="text-2xl font-bold">
        Conciliação ao vivo
      </h1>
      <p className="mt-2 max-w-prose text-sm text-tinta-fraca">
        Leitura pública por design. Ações de escrita passam por rota admin separada com token de
        demonstração; o e-mail do pagador é mascarado no backend, nunca no CSS.
      </p>

      <h2 className="mt-10 font-mono text-xs uppercase tracking-[0.25em] text-tinta-fraca">
        pedidos · últimos {orders.length}
      </h2>
      <div className="mt-3 overflow-x-auto border border-tinta bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-tinta text-left font-mono text-[11px] uppercase tracking-wider text-tinta-fraca">
              <th className="px-3 py-2" scope="col">
                Pedido
              </th>
              <th className="px-3 py-2" scope="col">
                Valor
              </th>
              <th className="px-3 py-2" scope="col">
                Status
              </th>
              <th className="px-3 py-2" scope="col">
                Pagador
              </th>
              <th className="px-3 py-2" scope="col">
                Webhooks
              </th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.publicRef} className="border-b border-pauta last:border-0">
                <td className="px-3 py-2">
                  <Link
                    className="font-mono underline decoration-pauta underline-offset-4 hover:decoration-pix-escuro"
                    to={`/pedido/${o.publicRef}`}
                  >
                    {o.publicRef}
                  </Link>
                  <span className="block text-xs text-tinta-fraca">{o.productName}</span>
                </td>
                <td data-numeric className="px-3 py-2 font-bold">
                  {o.amountFormatted}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={o.status} />
                </td>
                <td data-numeric className="px-3 py-2 text-tinta-fraca">
                  {o.payerEmailMasked ?? '—'}
                </td>
                <td data-numeric className="px-3 py-2 whitespace-nowrap">
                  processado {o.processedCount}×{' '}
                  <span className="text-alerta">· bloqueado {o.blockedCount}×</span>
                </td>
              </tr>
            ))}
            {orders.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-tinta-fraca" colSpan={5}>
                  Nenhum pedido ainda — crie um na loja.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 font-mono text-xs uppercase tracking-[0.25em] text-tinta-fraca">
        trilha de webhooks · últimos {events.length}
      </h2>
      <div className="mt-3 overflow-x-auto border border-tinta bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-tinta text-left font-mono text-[11px] uppercase tracking-wider text-tinta-fraca">
              <th className="px-3 py-2" scope="col">
                Recebido
              </th>
              <th className="px-3 py-2" scope="col">
                Origem
              </th>
              <th className="px-3 py-2" scope="col">
                Veredito
              </th>
              <th className="px-3 py-2" scope="col">
                Assinatura
              </th>
              <th className="px-3 py-2" scope="col">
                Latência
              </th>
              <th className="px-3 py-2" scope="col">
                Pedido
              </th>
              <th className="px-3 py-2" scope="col">
                Ação
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-pauta last:border-0">
                <td data-numeric className="px-3 py-2">
                  {hora(e.receivedAt)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.source}</td>
                <td className="px-3 py-2">
                  <VerdictBadge verdict={e.verdict} />
                </td>
                <td className="px-3 py-2">
                  {e.signatureValid ? (
                    <span className="text-pix-tinta">✓ válida</span>
                  ) : (
                    <span className="text-erro">✗ inválida</span>
                  )}
                </td>
                <td data-numeric className="px-3 py-2">
                  {e.processingMs} ms
                </td>
                <td className="px-3 py-2">
                  {e.orderPublicRef !== null ? (
                    <Link
                      className="font-mono underline decoration-pauta underline-offset-4 hover:decoration-pix-escuro"
                      to={`/pedido/${e.orderPublicRef}`}
                    >
                      {e.orderPublicRef}
                    </Link>
                  ) : (
                    <span className="text-tinta-fraca">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {e.verdict === 'processado' ? (
                    <button
                      className="whitespace-nowrap border border-tinta bg-white px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider hover:bg-papel disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={reenviar.isPending}
                      aria-busy={reenviar.isPending && reenviar.variables === e.id}
                      onClick={() => reenviar.mutate(e.id)}
                      type="button"
                    >
                      {reenviar.isPending && reenviar.variables === e.id
                        ? 'Reenviando…'
                        : 'Reenviar este webhook'}
                    </button>
                  ) : (
                    <span className="text-tinta-fraca">—</span>
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-tinta-fraca" colSpan={7}>
                  Nenhum webhook recebido ainda.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
