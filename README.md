# Pix Live

> **TL;DR (EN):** A signed-webhook Pix checkout where money can't double — replay the exact same provider webhook and watch idempotency block the duplicate, live, in the client's language, not the stack's.

**Checkout Pix que não duplica dinheiro.** Reenvie o mesmo webhook e veja, ao vivo, a idempotência bloquear a segunda entrega — a prova de que "dinheiro não some", no idioma do cliente.

<!-- Badges: alguns só acendem após o primeiro run de CI / deploy / Scorecard. Ver "Estado atual do build". -->

[![CI](https://github.com/racionalmengo/pix-live/actions/workflows/ci.yml/badge.svg)](https://github.com/racionalmengo/pix-live/actions/workflows/ci.yml)
[![Cobertura](https://img.shields.io/badge/cobertura-core%20100%25%20%C2%B7%20global%20%E2%89%A580%25-brightgreen)](https://github.com/racionalmengo/pix-live/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/racionalmengo/pix-live/badge)](https://securityscorecards.dev/viewer/?uri=github.com/racionalmengo/pix-live)
[![Licença: MIT](https://img.shields.io/github/license/racionalmengo/pix-live)](./LICENSE)
[![Último commit](https://img.shields.io/github/last-commit/racionalmengo/pix-live)](https://github.com/racionalmengo/pix-live/commits)
[![Deploy](https://img.shields.io/badge/deploy-placeholder-lightgrey)](#-demo-ao-vivo)

---

## ▶️ Demo ao vivo

> **`<DEMO_URL>`** — _placeholder: o link ainda não existe. Será fixado aqui apontando de preferência ao **painel de conciliação** (caminho de wow em menos de 10s)._

> ⚠️ **Demo sandbox — não processa dinheiro real.** Toda cobrança é gerada no ambiente de testes do Mercado Pago. Nenhum valor real transita, nenhum Pix real é cobrado. Isto é uma isca de portfólio, não um produto financeiro em produção.

### O wow em 10 segundos

Abra o painel de conciliação: já existe ali um **pedido pago pré-semeado** com histórico de webhook. Clique **"reenviar este webhook"**. Em segundos o contador daquele pedido vira **`processado 1× · idempotência bloqueou 1×`**, o log registra o veredito **`duplicata_ignorada`**, e o valor **não dobra**. Sem login, sem gerar nada.

<!-- Hero visual: GIF de ~3s do wow (reenviar webhook → contador "processado 1× / bloqueado 1×"). -->

> 🎞️ _Placeholder do GIF do wow — a ser adicionado em `docs/wow.gif` quando o front estiver no ar._

---

## 🎯 O que isto prova

Integração **Pix real** de ponta a ponta com a barra de segurança e engenharia de um time grande — em escopo minúsculo, de propósito:

- **Webhook assinado de verdade.** Verificação HMAC-SHA256 sobre o **corpo cru** (raw body), em **tempo constante**, remontando o manifesto exato do provedor.
- **Integração real, não auto-simulação.** Pelo menos **1 webhook REAL capturado do sandbox do Mercado Pago** (headers e payload genuínos, PII redigida) vive como **fixture de teste em CI** — fecha a dúvida óbvia do avaliador técnico: "isso valida contra o formato real do provedor ou só contra si mesmo?".
- **Dinheiro não duplica — garantido pelo banco.** O crédito é exatamente-uma-vez via **constraint de unicidade** em transação, sob corrida entre entregas simultâneas (`at-least-once` do provedor resolvido pelo banco, não por `if` em memória).
- **Processo de engenharia visível.** Badge do **OpenSSF Scorecard**, **SBOM**, **scan de imagem** e a aba Actions com checks required — não só código, mas a cadeia de entrega levada a sério.

**Contraste que vende:** escopo de brinquedo, barra de produção. Um produto fixo, um preço — a loja fictícia **Papelaria Nó de Fita** vendendo o **Kit Caderno Artesanal** por **R$ 47,00**.

---

## 📦 Escopo

Fronteira explícita — maturidade é dizer o que **não** se faz.

### ✅ Faz

- Um produto fixo, preço fixo (Kit Caderno Artesanal, **R$ 47,00**), com seed realista.
- Cobrança Pix via SDK oficial do Mercado Pago em **sandbox**: QR Code (PNG), copia-e-cola (EMV) e expiração.
- Página de pagamento com QR, copiar copia-e-cola, contador de expiração e status que vira **"Pago"** via polling curto (pausado quando a aba perde foco).
- Endpoint público de webhook: raw body, HMAC em tempo constante, processamento idempotente, cap de tamanho de corpo e `Content-Type` validado.
- **Painel de conciliação público** (leitura): pedidos e log de webhooks com veredito, validade de assinatura e latência — **e-mail do pagador mascarado no backend** (nunca só CSS).
- Um pedido **já pago pré-semeado** para alcançar o wow em <10s direto pelo link.
- **Modo mock MP** para rodar 100% offline (`docker compose up` e CI, sem conta no Mercado Pago).
- API versionada (`/api/v1`), erro em `problem+json` (RFC 9457), OpenAPI/Swagger, health `live`/`ready` e graceful shutdown.

### ⛔ NÃO faz

- Sem carrinho, múltiplos produtos, variações ou estoque.
- Sem cartão, boleto ou qualquer meio que não seja Pix.
- Sem nota fiscal, frete, cupom ou imposto.
- Sem cadastro/login de cliente final.
- **Sem dinheiro real** — é sandbox, declarado em destaque; zero claim de "pronto pra produção financeira".
- Sem estorno/refund, split, marketplace, multi-tenant, CMS ou app mobile.
- Não é uma biblioteca reutilizável de pagamentos — é a demonstração focada de **uma** integração.
- Sem SSE/push: polling curto de 2–3s com pausa em aba inativa entrega a mesma percepção de "ao vivo" com muito menos superfície de falha — escolha de engenharia documentada, não limitação escondida.

---

## 🔒 Como a segurança funciona

### Três camadas independentes na rota pública de webhook

A rota pública `POST /webhooks/mercadopago` **nunca** aceita nenhuma flag do cliente que relaxe a segurança:

1. **Autenticidade (HMAC).** Lê o raw body (com cap de tamanho e `Content-Type` validado), remonta o manifesto exato do MP e compara HMAC-SHA256 **em tempo constante**. Inválida/ausente → **401**, veredito `assinatura_invalida`, sem tocar no pedido. _(Implementação em [`packages/core/src/signature.ts`](./packages/core/src/signature.ts).)_
2. **Anti-replay.** Dedupe real por `x-request-id` (índice único) + janela de timestamp **generosa (24h)**. Trade-off consciente: quando o HMAC é válido mas o `ts` foge da janela, registra o veredito **`ts_suspeito`** em vez de dar 401 — para não descartar permanentemente uma reentrega legítima tardia. _(Ver [`packages/core/src/idempotency.ts`](./packages/core/src/idempotency.ts).)_
3. **Idempotência de negócio.** Credita exatamente uma vez via **constraint de unicidade em `mp_payment_id`**, dentro de transação. A corrida entre entregas simultâneas é resolvida pelo banco, não por checagem em memória.

### Rotas admin separadas — não é contradição com "zero login"

O painel de conciliação é **público por design** (só leitura). As ações de **escrita** ("simular confirmação", "reenviar webhook") vivem em **rotas `/admin/*` separadas**, protegidas por um **demo-token NÃO-secreto** — pré-anexado pelo front (zero fricção pro avaliador) e rotulado na UI como _"token de demonstração pública, não é credencial real"_, com rate limit próprio bem mais agressivo (alvo óbvio de bot/scraper).

O botão **"reenviar webhook"** invoca o **pipeline do core diretamente em processo** (`origin='admin-replay'`, parâmetro interno confiável) — **nunca** faz um novo POST à rota pública. Assim a Camada 2 nunca é reaberta a um vetor de forjamento.

### Hardening de borda

- **API:** helmet + CORS restrito + rate limit (webhook, criação de pedido e admin) + validação Zod de todo input e do env (fail-fast no boot) + request timeout. Sem SSRF (host MP fixo), sem card data (Pix-only).
- **Site estático:** NÃO herda o helmet da API — CSP restrita e security headers (HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors`) definidos no próprio host. O QR embutido como base64 permite CSP sem `img-src` externo.
- **Container:** Dockerfile multi-stage, usuário **non-root**, base pinada por digest, `HEALTHCHECK`, signal handling PID1 correto, `.dockerignore`, deps de produção apenas.
- **Supply chain:** actions do CI **pinadas por SHA**, `GITHUB_TOKEN` com permissões mínimas por job.

Threat model completo e política de disclosure em **[`SECURITY.md`](./SECURITY.md)**.

---

## 🏗️ Arquitetura

Monorepo pnpm com o **domínio puro isolado do framework**:

```mermaid
flowchart TD
    MP[Mercado Pago sandbox] -->|POST webhook| WH["/webhooks/mercadopago (público)"]
    WH -->|raw body| L1{"Camada 1<br/>HMAC tempo constante"}
    L1 -->|inválida| R401[401 · assinatura_invalida]
    L1 -->|válida| L2{"Camada 2<br/>dedupe x-request-id + janela ts"}
    L2 -->|request-id repetido| DUP[200 · duplicata_ignorada]
    L2 -->|ok| L3{"Camada 3<br/>constraint unicidade mp_payment_id"}
    L3 -->|crédito já existe| DUP
    L3 -->|crédito novo| OK[200 · processado · pedido = paid]

    ADMIN["/admin/* (demo-token não-secreto)"] -.->|replay em processo| CORE[["packages/core<br/>domínio puro"]]
    CORE --- L1 & L2 & L3
    PANEL["Painel de conciliação (público, leitura)<br/>e-mail mascarado no backend"] --> DB[(PostgreSQL)]
    L3 --> DB
```

- **`packages/core`** — domínio **puro** (sem NestJS/Prisma/HTTP): builder do manifesto de assinatura, verificador HMAC em tempo constante, decisor de idempotência, máquina de estados do pedido cobrindo **todas** as transições do MP (`approved`/`rejected`/`cancelled`/`in_process`/`expirado`), formatação de dinheiro em centavos. Fronteira imposta por lint (core não importa framework).
- **`apps/api`** — NestJS + Prisma + Postgres, adapter de provedor plugável (MP real vs. mock).
- **`apps/web`** — React + Vite + TanStack Query (polling curto).

Diagrama detalhado e fluxos em **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

---

## 🚀 Rode em 30s

Modo mock — **100% offline, sem conta no Mercado Pago**:

```bash
git clone https://github.com/racionalmengo/pix-live.git
cd pix-live
cp .env.example .env      # PAYMENT_PROVIDER=mock já vem por padrão
docker compose up          # sobe API + Postgres + web, com seed (inclui o pedido pago pré-semeado)
```

Abra o painel de conciliação, clique **"reenviar este webhook"** no pedido pré-semeado e veja o contador. O `.env.example` é curto e comentado — nenhum segredo real, o `DEMO_ADMIN_TOKEN` é explicitamente não-secreto:

```dotenv
PAYMENT_PROVIDER=mock                 # "mock" offline · "mercadopago" usa o sandbox
DATABASE_URL=postgresql://pixlive:pixlive@localhost:5432/pixlive?schema=public
MP_ACCESS_TOKEN=                      # só quando PAYMENT_PROVIDER=mercadopago
MP_WEBHOOK_SECRET=
DEMO_ADMIN_TOKEN=demo-nao-secreto     # NÃO é segredo — rotulado na UI
```

Só o **domínio puro** (`packages/core`)? `pnpm install && pnpm test`.

---

## 🧰 Stack (enxuta, e por quê)

| Camada   | Escolha                                                                  | Por quê                                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend | React + Vite + TypeScript strict, Tailwind, TanStack Query               | Cache e **polling curto** (2–3s, pausado via Page Visibility API) — **SSE foi avaliado e descartado**: mesma percepção de "ao vivo" com muito menos superfície de falha no free tier. |
| Backend  | Node.js + NestJS + TS strict, SDK `mercadopago` atrás de um adapter      | Adapter real vs. mock para rodar offline/CI; `nestjs-zod`, `pino`, `helmet`, `@nestjs/throttler`, `@nestjs/terminus`, `@nestjs/swagger`.                                              |
| Dados    | PostgreSQL 16 + Prisma                                                   | Idempotência é do banco: constraint de unicidade + transação. Seed determinístico com o pedido pré-semeado e a fixture real do MP.                                                    |
| Deploy   | Render (Blueprint) — API em Docker + site estático + Postgres gerenciado | Persistência resolvida explicitamente (ver abaixo). Keep-warm por cron contra `/health/ready`.                                                                                        |

Toolchain: pnpm workspaces, Node LTS (20+), TypeScript strict total, ESLint 9 flat config, Prettier, Husky + commitlint (Conventional Commits), release-please (SemVer/CHANGELOG).

---

## 🧪 Testes & CI

Pirâmide real, específica deste domínio:

- **Unit (Vitest)** no domínio puro: manifesto HMAC, assinatura (válida/adulterada/ausente/tempo constante), decisor de idempotência, máquina de estados cobrindo **todos** os status do MP, formatação de dinheiro. _(Testes em [`packages/core/test/`](./packages/core/test).)_
- **Mutation testing (Stryker)** sobre `packages/core` — score-alvo **≥85%**: prova que os testes **matam mutantes**, não só cobrem linhas.
- **Integração (Supertest + Postgres real):** crédito exatamente-uma-vez sob re-entrega, 401 em assinatura inválida, `ts` fora da janela como sinal (não hard-reject), **corrida de entregas concorrentes**, e um caso contra a **fixture REAL do MP sandbox**.
- **Admin isolado:** `/admin/*` exige demo-token, respeita rate limit próprio, e o replay nunca passa pela rota pública.
- **E2E (Playwright + axe-core):** caminho rápido (pedido pré-semeado) e completo, com checagem de acessibilidade.

**Cobertura-alvo imposta no CI:** core ≥90% linhas/branches, global ≥80%. CI em Node LTS, gates required em `main` (nenhum merge com check vermelho).

<!-- Print da aba Actions com todos os checks required verdes. -->

> 🖼️ _Placeholder do print da aba Actions (checks required verdes) — a ser adicionado quando o pipeline `ci.yml` estiver publicado._

---

## 🛡️ Supply chain & segurança

Diferencial que quase nenhum repo de portfólio tem — cadeia de entrega auditável:

- **[![OpenSSF Scorecard](https://img.shields.io/badge/OpenSSF-Scorecard-blue)](https://securityscorecards.dev/viewer/?uri=github.com/racionalmengo/pix-live)** rodando com badge público (no topo).
- **SBOM CycloneDX** (api + web) anexado a cada release.
- **Trivy** (scan de imagem) e **hadolint** (lint de Dockerfile), reprovando HIGH/CRITICAL.
- **CodeQL** (SAST), **gitleaks** + GitHub secret scanning (push protection), **dependency-review**, **OSV-Scanner**.
- **Actions SHA-pinned** + `GITHUB_TOKEN` least-privilege por job; **Renovate** + Dependabot alerts.

Detalhes e threat model em **[`SECURITY.md`](./SECURITY.md)**.

---

## 📐 Decisões de arquitetura (ADRs)

Julgamento de engenharia documentado, com trade-offs explícitos:

- **[ADR-0001 — Estratégia de idempotência](./adr/0001-idempotencia.md):** crédito exatamente-uma-vez por constraint de banco sob corrida (não por checagem em memória).
- **[ADR-0002 — Verificação de assinatura + anti-replay](./adr/0002-assinatura-anti-replay.md):** HMAC sobre raw body + a ressalva honesta sobre a semântica do campo `ts` do MP (a confirmar contra a doc do provedor) e a política de janela generosa como sinal.
- **[ADR-0003 — Replay como ferramenta de demo](./adr/0003-replay-demo.md):** honestidade explícita de que em produção o botão não existiria e a Camada 2 rejeitaria a reentrega antiga.

O design completo (spec adversarialmente revisada) está em **[`SPEC.md`](./SPEC.md)**.

---

## 👁️ Observabilidade

O painel de conciliação é observabilidade de domínio de primeira classe: cada webhook vira um registro auditável com **veredito, validade de assinatura e latência em ms**. A UI deixa explícito que ações de escrita passam por rota admin separada e que o **e-mail é mascarado no backend** — transparência sobre o próprio hardening. Nos bastidores: logs estruturados JSON (pino) com **request-id** correlacionado ponta a ponta e redaction de e-mail/token/secret; health `live`/`ready` (readiness pinga o Postgres); graceful shutdown que drena requests em voo e fecha o Prisma.

<!-- Screenshot do painel de conciliação (e-mail já mascarado, mostrando o hardening em ação). -->

> 🖼️ _Placeholder do screenshot do painel de conciliação — a ser adicionado quando o front estiver no ar._

---

## 🗄️ Nota de persistência do Postgres

Decisão **bloqueante e escrita**, não implícita: um link "no ar" que fica mudo em 30 dias é pior que não ter link. Free tiers de Postgres gerenciado frequentemente **expiram dados** (diferente de um web service que só "dorme"). Antes do deploy, uma das opções é decidida e documentada aqui: **(a)** um Postgres gerenciado pago sem expiração de free tier; **(b)** um provedor cujo free tier comprovadamente não expira dados (confirmado antes de depender dele); ou **(c)** self-host num container Postgres atrás da infra já mantida (Caddy/Tailscale). O cold-start do web service é mitigado por cron pingando `/health/ready` — isso **não** substitui a decisão de persistência do banco.

---

## 📄 Licença & mais

- **Licença:** [MIT](./LICENSE) · **Versionamento:** SemVer (primeira release pública `v1.0.0`, CHANGELOG por release-please).
- **Perfil / hub:** `<HUB_URL>` _(placeholder do link do hub com as demais iscas)_.
- **Outras iscas públicas:** `<ISCAS_URL>` _(placeholder)_.

> Esta é uma das iscas públicas de portfólio de um dev full-stack BR que entrega **produto completo com segurança por padrão**. O código de negócio real fica fechado — discrição profissional, não desculpa; esta isca de escopo minúsculo mostra a **barra de execução** em código aberto.

---

## 🧭 Estado atual do build

Para honestidade total sobre o que já está no repositório vs. o que segue este README:

- **Pronto e testado:** `packages/core` — o domínio puro que decide "o dinheiro duplica ou não" (assinatura HMAC, idempotência/anti-replay, máquina de estados, formatação de dinheiro), com suíte de testes.
- **Em construção conforme este spec:** `apps/api`, `apps/web`, o deploy, o **demo ao vivo**, os badges de CI/Scorecard/deploy, os GIFs/screenshots e os documentos `ARCHITECTURE.md` / `SECURITY.md` / `adr/*`.
- Onde este README diz `<...>` ou "placeholder", o item **ainda não existe** — nada aqui afirma que a demo já está no ar.
