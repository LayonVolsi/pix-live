import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';

/**
 * Copia o copia-e-cola EMV — a alternativa acessível ao QR (que nunca é o
 * caminho único). Feedback textual anunciado por aria-live, não só cor.
 */
export function BotaoCopiar({ texto }: { readonly texto: string }): ReactElement {
  const [copiado, setCopiado] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeout.current !== null) clearTimeout(timeout.current);
    },
    [],
  );

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      timeout.current = setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Clipboard bloqueado (permissão/contexto): o <code> ao lado permanece
      // selecionável — o caminho manual continua aberto.
      setCopiado(false);
    }
  }

  return (
    <button
      className="border border-tinta bg-white px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest hover:bg-papel"
      onClick={() => void copiar()}
      type="button"
    >
      {copiado ? 'Copiado ✓' : 'Copiar código'}
      <span aria-live="polite" className="sr-only">
        {copiado ? 'código Pix copiado' : ''}
      </span>
    </button>
  );
}
