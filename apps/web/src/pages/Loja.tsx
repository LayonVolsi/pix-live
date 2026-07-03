import { useMutation } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

/**
 * Loja de UM produto. O card é vitrine estática (cópia de marketing do produto
 * semeado); os dados com autoridade — nome, valor, status — vêm sempre da API
 * na página de pagamento. Botão de mutação segue o C7: desabilita em isPending.
 */
export function Loja(): ReactElement {
  const navigate = useNavigate();
  const criar = useMutation({
    mutationFn: api.criarPedido,
    onSuccess: (order) => navigate(`/pedido/${order.publicRef}`),
  });

  return (
    <section aria-labelledby="produto-titulo" className="py-12">
      <p className="font-mono text-xs uppercase tracking-[0.25em] text-tinta-fraca">
        oferta única · pagamento via Pix
      </p>

      <div className="mt-6 border border-tinta bg-white p-8 shadow-[6px_6px_0_0_theme(colors.pauta)]">
        <h1 id="produto-titulo" className="text-3xl font-bold leading-tight">
          Kit Caderno Artesanal
        </h1>
        <p className="mt-3 max-w-prose text-tinta-fraca">
          Papel reciclado de gramatura alta, costura aparente e capa serigrafada. Feito à mão, um
          por vez — como todo bom registro que não se duplica.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-6 border-t border-dashed border-pauta pt-6">
          <p data-numeric className="text-3xl font-bold" aria-label="preço: quarenta e sete reais">
            R$&nbsp;47,00
          </p>
          <button
            className="bg-pix-escuro px-8 py-3 font-mono text-sm font-bold uppercase tracking-widest text-white hover:bg-pix-tinta disabled:cursor-not-allowed disabled:opacity-60"
            disabled={criar.isPending}
            aria-busy={criar.isPending}
            onClick={() => criar.mutate()}
            type="button"
          >
            {criar.isPending ? 'Gerando cobrança…' : 'Pagar com Pix'}
          </button>
        </div>

        {criar.isError ? (
          <p className="mt-4 border-l-2 border-erro pl-3 text-sm text-erro" role="alert">
            {criar.error instanceof ApiError
              ? criar.error.message
              : 'Não foi possível criar o pedido agora.'}
          </p>
        ) : null}
      </div>

      <p className="mt-6 max-w-prose text-sm text-tinta-fraca">
        Ao pagar, você recebe um QR Pix de sandbox e acompanha o pedido ao vivo — incluindo o
        webhook assinado que confirma o crédito <em>exatamente uma vez</em>.
      </p>
    </section>
  );
}
