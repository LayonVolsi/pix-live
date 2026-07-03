import type { ReactElement } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Loja } from './pages/Loja';
import { Pagamento } from './pages/Pagamento';
import { Painel } from './pages/Painel';

function EmConstrucao(): ReactElement {
  return (
    <section aria-labelledby="wip-titulo" className="py-16 text-center">
      <h1 id="wip-titulo" className="font-mono text-sm uppercase tracking-[0.25em]">
        — em construção —
      </h1>
      <p className="mt-4 text-tinta-fraca">
        Esta página chega no próximo incremento.{' '}
        <Link className="underline decoration-pix-escuro underline-offset-4" to="/">
          Voltar à loja
        </Link>
      </p>
    </section>
  );
}

export function App(): ReactElement {
  const navLink = ({ isActive }: { isActive: boolean }): string =>
    `font-mono text-xs uppercase tracking-widest underline-offset-4 hover:underline ${
      isActive ? 'text-pix-tinta underline' : 'text-tinta-fraca'
    }`;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5">
      <header className="flex items-baseline justify-between border-b border-tinta py-5">
        <Link className="font-mono text-lg font-bold tracking-tight" to="/">
          PIX_LIVE<span className="text-pix-escuro">▮</span>
        </Link>
        <nav aria-label="principal" className="flex gap-6">
          <NavLink className={navLink} end to="/">
            Loja
          </NavLink>
          <NavLink className={navLink} to="/painel">
            Conciliação
          </NavLink>
        </nav>
      </header>

      <main className="flex-1">
        <Routes>
          <Route element={<Loja />} path="/" />
          <Route element={<Pagamento />} path="/pedido/:publicRef" />
          <Route element={<Painel />} path="/painel" />
          <Route element={<EmConstrucao />} path="*" />
        </Routes>
      </main>

      <footer className="border-t border-dashed border-pauta py-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-tinta-fraca">
          demo sandbox — não processa dinheiro real · webhook HMAC + idempotência por constraint
        </p>
      </footer>
    </div>
  );
}
