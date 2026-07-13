import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { BotaoCopiar } from '../components/BotaoCopiar';
import { StatusBadge } from '../components/StatusBadge';
import { useAgora } from '../hooks/useAgora';
import { intervaloPollingPedido } from '../lib/polling';
import { qrDataUri } from '../lib/qr';
import { msRestante, rotuloRestante } from '../lib/tempo';

/**
 * Página de pagamento — o "cupom fiscal" da demo: QR, copia-e-cola (caminho
 * acessível), contador de expiração derivado do relógio, status ao vivo por
 * polling curto e o botão que simula a confirmação do sandbox.
 */
export function Pagamento(): ReactElement {
  const { publicRef = '' } = useParams();
  const pedido = useQuery({
    queryKey: ['order', publicRef],
    queryFn: () => api.pedido(publicRef),
    enabled: publicRef !== '',
    // Polling curto pausado quando a aba perde o foco (Page Visibility) e
    // desligado em estado final/expirado — política pura em lib/polling.ts.
    refetchInterval: (query) => intervaloPollingPedido(query.state.data, Date.now()),
    refetchIntervalInBackground: false,
  });

  const queryClient = useQueryClient();
  // O modo da API decide se "simular" faz sentido: no sandbox real, ninguém finge
  // que o pagador pagou — a rota devolve 400. Botão que só falha é pior que botão
  // ausente, então ele some e o selo do modo aparece no lugar.
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, staleTime: Infinity });
  // Default FECHADO: enquanto o modo não é conhecido (ou se /config falhar), o
  // botão não aparece. Mostrar e depois esconder seria pior — e um botão que só
  // falha é exatamente o que este controle existe para evitar.
  const podeSimular = config.data?.canSimulatePayment ?? false;

  const simular = useMutation({
    mutationFn: () => api.simularConfirmacao(publicRef),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['order', publicRef] }),
  });

  const aguardando = pedido.data?.status === 'pending';
  const agora = useAgora(aguardando);

  if (pedido.isPending) {
    return (
      <p className="py-16 text-center font-mono text-sm text-tinta-fraca" role="status">
        Carregando pedido…
      </p>
    );
  }

  if (pedido.isError || pedido.data === undefined) {
    return (
      <section className="py-16 text-center" aria-labelledby="erro-titulo">
        <h1 id="erro-titulo" className="text-xl font-bold">
          Pedido indisponível
        </h1>
        <p className="mt-3 text-tinta-fraca" role="alert">
          {pedido.error instanceof ApiError
            ? pedido.error.message
            : 'Não foi possível carregar o pedido.'}
        </p>
        <Link className="mt-6 inline-block underline underline-offset-4" to="/">
          Voltar à loja
        </Link>
      </section>
    );
  }

  const ordem = pedido.data;
  const qr = qrDataUri(ordem.qrPngBase64);
  const restanteMs = ordem.pixExpiresAt === null ? null : msRestante(ordem.pixExpiresAt, agora);
  const expirado = restanteMs !== null && restanteMs <= 0;

  return (
    <section aria-labelledby="pagamento-titulo" className="py-10">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-tinta-fraca">
        pedido <span data-numeric>{ordem.publicRef}</span>
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <h1 id="pagamento-titulo" className="text-2xl font-bold">
          {ordem.productName}
        </h1>
        {/* aria-live: a virada pra "Pago" é anunciada quando o polling entrar. */}
        <p aria-live="polite">
          <StatusBadge status={ordem.status} />
        </p>
      </div>

      {/* O cupom: borda picotada em cima/embaixo, miolo de recibo térmico. */}
      <div className="mt-8 border-x border-tinta bg-white shadow-[6px_6px_0_0_theme(colors.pauta)]">
        <div className="h-3 w-full [background:linear-gradient(-45deg,transparent_8px,white_0)_left_bottom/16px_16px_repeat-x] border-t border-tinta" />
        <div className="px-8 py-6">
          <dl className="grid grid-cols-2 gap-y-1 border-b border-dashed border-pauta pb-4 font-mono text-sm">
            <dt className="text-tinta-fraca">Valor</dt>
            <dd data-numeric className="text-right text-lg font-bold">
              {ordem.amountFormatted}
            </dd>
            {aguardando && restanteMs !== null ? (
              <>
                <dt className="text-tinta-fraca">{expirado ? 'Cobrança' : 'Expira em'}</dt>
                <dd data-numeric className="text-right" role="timer" aria-label="tempo restante">
                  {expirado ? 'expirada' : rotuloRestante(restanteMs)}
                </dd>
              </>
            ) : null}
          </dl>

          {aguardando && !expirado && !podeSimular ? (
            <div className="mt-8 border-t border-dashed border-pauta pt-5">
              <p className="max-w-prose text-xs text-tinta-fraca">
                <strong className="font-bold text-tinta">Sandbox real do Mercado Pago.</strong> Não
                há botão de simular: quem confirma o pagamento é o pagador, no app do banco — e o
                webhook chega assinado pelo provedor, como em produção.
              </p>
            </div>
          ) : null}

          {aguardando && !expirado && podeSimular ? (
            <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              {qr !== null ? (
                <img
                  alt={`QR Code Pix do pedido ${ordem.publicRef}`}
                  className="h-44 w-44 shrink-0 border border-pauta"
                  height={176}
                  src={qr}
                  width={176}
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <h2 className="font-mono text-xs uppercase tracking-widest text-tinta-fraca">
                  Pix copia-e-cola
                </h2>
                {ordem.qrEmv !== null ? (
                  <>
                    <code className="mt-2 block max-h-24 overflow-y-auto break-all border border-pauta bg-papel p-3 text-xs">
                      {ordem.qrEmv}
                    </code>
                    <div className="mt-3">
                      <BotaoCopiar texto={ordem.qrEmv} />
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-tinta-fraca">Código indisponível.</p>
                )}
              </div>
            </div>
          ) : null}

          {aguardando && !expirado ? (
            <div className="mt-8 border-t border-dashed border-pauta pt-5">
              <button
                className="border-2 border-tinta bg-white px-6 py-2.5 font-mono text-xs font-bold uppercase tracking-widest hover:bg-papel disabled:cursor-not-allowed disabled:opacity-60"
                disabled={simular.isPending}
                aria-busy={simular.isPending}
                onClick={() => simular.mutate()}
                type="button"
              >
                {simular.isPending ? 'Emitindo webhook…' : 'Simular confirmação (sandbox)'}
              </button>
              <p className="mt-2 max-w-prose text-xs text-tinta-fraca">
                Emite um webhook assinado server-side contra o endpoint público real, via rota admin
                com token de demonstração pública — <em>não é credencial real</em>. Nesta demo,
                qualquer pedido do painel é alvo legítimo; o freio é o rate-limit.
              </p>
              {simular.isError ? (
                <p className="mt-2 border-l-2 border-erro pl-3 text-sm text-erro" role="alert">
                  {simular.error instanceof ApiError
                    ? simular.error.message
                    : 'Não foi possível simular a confirmação agora.'}
                </p>
              ) : null}
            </div>
          ) : null}

          {expirado && aguardando ? (
            <p className="mt-6 text-sm text-tinta-fraca">
              A cobrança expirou sem pagamento.{' '}
              <Link className="underline underline-offset-4" to="/">
                Gerar um novo pedido
              </Link>
            </p>
          ) : null}
        </div>
        <div className="h-3 w-full [background:linear-gradient(135deg,transparent_8px,white_0)_left_top/16px_16px_repeat-x] border-b border-tinta" />
      </div>

      <p className="mt-6 max-w-prose text-sm text-tinta-fraca">
        Demo sandbox: nenhum dinheiro real muda de mãos. A confirmação chega por webhook{' '}
        <abbr title="HMAC-SHA256 verificado em tempo constante">assinado</abbr> e o crédito é
        idempotente por constraint de banco —{' '}
        <Link className="underline underline-offset-4" to="/painel">
          veja no painel de conciliação
        </Link>
        .
      </p>
    </section>
  );
}
