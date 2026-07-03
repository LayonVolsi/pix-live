# ADR 0005 — Pins do front (Vite 6, Tailwind 3.4, React 18.3) sob Node 18 local

- **Status:** aceito (2026-07-03)
- **Contexto:** o `apps/web` entra no monorepo. A máquina de desenvolvimento
  roda Node 18 e não sobe nesta fase (mudança de sistema, decisão do operador);
  o contrato declarado do repo segue Node ≥20 (`engines`, `.nvmrc`, CI 20/22) —
  o mesmo descompasso deliberado já ratificado pelo [ADR-0004](0004-nest10-esm-nodenext.md)
  para o Nest 10. O gate "ver rodando" da metodologia exige `vite dev`
  funcionando localmente.
- **Decisão:** pinar o front no menor denominador comum que roda em 18/20/22:
  **Vite 6** (Vite 7 exige Node 20.19+), **Tailwind 3.4** (v4 exige 20+),
  **React 18.3**, TanStack Query 5, react-router-dom 6, **jsdom 25** (o 29
  puxa dependência ESM-only que quebra `require()` no Node 18 — verificado
  empiricamente na suíte). `engines`, `.nvmrc` e `.npmrc` da raiz ficam
  **intocados** — o piso declarado continua 20.
- **Consequências:** dev local e CI verdes com os mesmos pins. A migração
  Vite 7 / Tailwind 4 (junto com Node 20+ local e Nest 11) é mecânica e está
  registrada no backlog (B7); nenhum código do front depende de comportamento
  exclusivo das versões pinadas.
- **Alternativas rejeitadas:** subir o Node local nesta fase (rede/apt e
  mudança de sistema — fora do escopo offline da sessão; prerrogativa do
  operador); baixar o `engines` para ≥18 (Node 18 está EOL — piorar o contrato
  público do repo pra acomodar a exceção local inverteria a hierarquia).
