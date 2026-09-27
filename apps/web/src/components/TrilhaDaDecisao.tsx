import type { ReactElement } from 'react';
import { DESFECHOS, FRASES } from '../trilha/frases';
import { TRECHOS } from '../trilha/trechos.gerados';
import type { PassoTrilha } from '../trilha/trechos.gerados';

function conhecido(passo: string): passo is PassoTrilha {
  return Object.prototype.hasOwnProperty.call(TRECHOS, passo);
}

/**
 * O que o sistema acabou de fazer, passo a passo, na ordem em que o SERVIDOR executou.
 * Cada passo é uma frase para quem não lê código; aberto, mostra o trecho real que o
 * executou e o link para a linha no repositório. Passo que o front não conhece (API mais
 * nova que o bundle) aparece declarado como desconhecido — nunca some em silêncio.
 */
export function TrilhaDaDecisao({ trail }: { readonly trail: readonly string[] }): ReactElement {
  return (
    <section
      aria-labelledby="trilha-titulo"
      className="mt-6 border border-tinta bg-white p-4"
      data-testid="trilha-da-decisao"
    >
      <h2 id="trilha-titulo" className="text-lg font-bold">
        O que o sistema acabou de fazer
      </h2>
      <p className="mt-1 text-sm text-tinta-fraca">
        Chegou um aviso de pagamento. Estes são os passos, na ordem em que aconteceram. Clique em um
        passo para ver o código que o executou.
      </p>
      <ol className="mt-4 space-y-2">
        {trail.map((passo, i) => {
          if (!conhecido(passo)) {
            return (
              <li key={`${passo}-${i}`} className="text-sm text-tinta-fraca">
                {i + 1}. Passo não reconhecido por esta versão da tela.
              </li>
            );
          }
          const trecho = TRECHOS[passo];
          const destaque = DESFECHOS.has(passo);
          return (
            <li key={`${passo}-${i}`}>
              <details className="group border border-pauta">
                <summary
                  className={`cursor-pointer list-none px-3 py-2 text-sm ${destaque ? 'font-bold' : ''}`}
                >
                  <span className="mr-2 font-mono text-tinta-fraca">{i + 1}.</span>
                  {FRASES[passo]}
                  <span className="ml-2 whitespace-nowrap font-mono text-[11px] text-tinta-fraca group-open:hidden">
                    ver código ▸
                  </span>
                </summary>
                <div className="border-t border-pauta bg-papel px-3 py-2">
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed">
                    <code>{trecho.codigo}</code>
                  </pre>
                  <a
                    className="mt-2 inline-block font-mono text-[11px] underline decoration-pauta underline-offset-4"
                    href={trecho.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {trecho.arquivo}, linhas {trecho.linhas}
                  </a>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
