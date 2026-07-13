# Changelog

Todas as mudanças relevantes deste projeto são documentadas aqui.
O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e o versionamento segue [SemVer](https://semver.org/lang/pt-BR/).
A partir da v1.0.0 este arquivo passa a ser mantido automaticamente por
`release-please` a partir dos Conventional Commits.

## [Unreleased]

### Added

- Fundação do monorepo (pnpm workspaces) e `packages/core` — domínio puro:
  verificação HMAC em tempo constante, decisor de idempotência (3 camadas),
  máquina de estados do pedido e formatação BRL. Cobertura de testes 100%.
- Régua de qualidade: TypeScript strict, ESLint 9 type-checked + security,
  Prettier, Vitest, Husky + commitlint, CI (lint/format/typecheck/test/build),
  CodeQL, gitleaks, dependency-review, Renovate.
- `apps/api` (NestJS) completa: bootstrap endurecido (helmet, prefixo
  `/api/v1`, pino com redaction, problem+json RFC 9457, throttler
  estratificado, trust proxy = 1, graceful shutdown, env Zod fail-fast com
  mock proibido em produção).
- Camada de persistência Prisma/Postgres (5 entidades + migrations) e
  healthchecks `/health/live` e `/health/ready`.
- Porta `PaymentProvider` + adapter **mock** offline (QR real, `settle`
  stateful) — o adapter do SDK do MP entra na fase 4.
- Webhook público das 3 camadas wired ao core, provado por testes de
  integração contra Postgres real (inclui a corrida de entregas concorrentes).
- Rotas admin (`simulate`/`replay`) com guard de demo-token e rate limit
  próprio; replay invoca o pipeline em processo, nunca a rota pública.
- Loja (`POST`/`GET /orders`) com idempotência de saída
  (`OutboundIdempotencyKey`).
- Painel de conciliação (e-mail do pagador mascarado no backend) + seed do
  pedido pago pré-semeado (o caminho da demonstração).
- ADRs 0001–0004 e `ARCHITECTURE.md`.
- `apps/web` (React 18 + Vite 6 + Tailwind 3.4 + TanStack Query): loja de um
  produto, página de pagamento (QR com sanity check de base64, copia-e-cola
  acessível, contador derivado do relógio, polling de 2,5s pausado por Page
  Visibility e que para em estado final) e painel de conciliação ao vivo com
  o replay demonstrativo. Botões de mutação desabilitam em `isPending` (duplo-clique
  não duplica ação — coberto por teste). Erros HTTP viram catálogo fixo
  pt-BR; corpo cru de resposta nunca chega à UI.
- Painel de conciliação da API expõe `id` do evento e `orderPublicRef`
  (vínculo evento→pedido em 1 JOIN) — os handles que o front consome.
- Replay fail-closed: só eventos com veredito `processado` são reenviáveis,
  também na API (não só na UI).
- Bloco eslint type-checked + security + `react/no-danger` + `jsx-a11y` +
  `react-hooks` para `apps/web/**/*.{ts,tsx}`; ADR 0005 (pins do front sob
  Node 18 local).
- Fase container (verificada com Docker ativo em 2026-07-03: `compose up`
  ponta a ponta, XFF forjado não fura o rate-limit, liveness sobrevive a
  queda do Postgres, hadolint/Trivy limpos, bases pinadas por digest):
  `.dockerignore` hermético; Dockerfile multi-stage da API (non-root, deps
  de produção apenas, `HEALTHCHECK` de liveness pura em `/health/live`,
  CMD exec-form, `NODE_ENV=production` baked com override do compose
  documentado); Dockerfile do front (build Vite → nginx-unprivileged
  non-root com `proxy_set_header` explícitos — o rate-limit por IP real
  depende deles sob `trust proxy = 1`); `docker compose up` sobe
  Postgres + migrate/seed one-shot + API (`NODE_ENV=test`, porta não
  publicada no host) + front, 100% offline. Pin por digest + hadolint +
  Trivy fecham como gate pré-deploy.

### Changed

- **BREAKING:** `POST /api/v1/admin/orders/:id/simulate` virou
  `POST /api/v1/admin/orders/:publicRef/simulate` — o PK interno não é mais
  a chave (nenhuma view pública o expõe); `publicRef` é o handle público
  consistente da API. Sem consumidor externo afetado (o front nasceu já no
  contrato novo).

### Fixed

- Perda de crédito sob falha transitória da consulta ao provedor: o evento
  não é mais persistido antes do fato (500 sem gravar o delivery-id), então o
  dedupe não é envenenado e a reentrega completa o crédito — achado ALTO da
  revisão adversarial interna, corrigido antes de qualquer cliente ver.
- Replay do pedido semeado devolvia `pagamento_desconhecido` em vez do
  bloqueio de idempotência após restart da API (provider mock em memória ×
  ledger persistente no banco): `creditAlreadyExists` agora precede
  `orderKnown` no `decideVerdict` — o crédito continua duplo-gateado, só o
  rótulo de auditoria muda. Achado do "ver rodando" da verificação com
  Docker; a combinação exata não era coberta por nenhum teste e agora está
  travada por teste unitário e de integração.
- Suíte de integração expirava sozinha: fixture com "agora" hardcoded saía
  da janela anti-replay de 24h (`ts_suspeito` em 3 testes) — relógio real no
  fixture.
- CI quebrava em qualquer checkout limpo (latente até aqui — nunca tinha
  rodado num runner de verdade): `@pix-live/core` resolve via `exports` →
  `dist/` que não existe pós-checkout (coleta dos testes de integração
  falhava antes do `skipIf`; lint type-aware e typecheck do `apps/api` caíam
  em TS2307), e o client Prisma nunca era gerado em install limpo de
  monorepo pnpm (stubs sem modelos → TS2305 e `no-unsafe-*` no quality; no
  test, o import estático de `PrismaClient` quebrava a coleta). Os dois
  jobs agora geram o client e buildam `packages/*` antes dos passos que os
  consomem. Provado com a sequência exata de cada job em clones isolados —
  um clone por job, como runners de verdade (a revisão adversarial pegou a
  1ª prova reaproveitando `node_modules` entre os jobs).
