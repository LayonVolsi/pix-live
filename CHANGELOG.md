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
  pedido pago pré-semeado (o caminho do wow).
- ADRs 0001–0004 e `ARCHITECTURE.md`.
- `apps/web` (React 18 + Vite 6 + Tailwind 3.4 + TanStack Query): loja de um
  produto, página de pagamento (QR com sanity check de base64, copia-e-cola
  acessível, contador derivado do relógio, polling de 2,5s pausado por Page
  Visibility e que para em estado final) e painel de conciliação ao vivo com
  o replay-wow. Botões de mutação desabilitam em `isPending` (duplo-clique
  não duplica ação — coberto por teste). Erros HTTP viram catálogo fixo
  pt-BR; corpo cru de resposta nunca chega à UI.
- Painel de conciliação da API expõe `id` do evento e `orderPublicRef`
  (vínculo evento→pedido em 1 JOIN) — os handles que o front consome.
- Replay fail-closed: só eventos com veredito `processado` são reenviáveis,
  também na API (não só na UI).
- Bloco eslint type-checked + security + `react/no-danger` + `jsx-a11y` +
  `react-hooks` para `apps/web/**/*.{ts,tsx}`; ADR 0005 (pins do front sob
  Node 18 local).

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
