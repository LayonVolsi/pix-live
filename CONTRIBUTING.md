# Contribuindo com o Pix Live

> **Pix Live** é uma isca de portfólio pública: checkout Pix que não duplica dinheiro
> (webhook assinado, idempotência e replay ao vivo). É uma **demo em sandbox do Mercado
> Pago — não processa dinheiro real**. Escopo minúsculo, barra de produção.

Este documento descreve como rodar o projeto, o padrão de qualidade e a disciplina de
commits/PR. Ele é **honesto sobre o estado atual do repo**: partes marcadas como
_planejado_ ainda não existem no código — estão descritas para deixar o alvo explícito, não
para fingir que já estão prontas.

## Sobre a fronteira de escopo

Este repositório é **público e descartável por design**. Ele demonstra **uma** integração de
pagamento com acabamento de produção. Código de negócio real do dono vive em repositórios
fechados — isso é discrição profissional, não uma omissão. Contribuições externas não são o
objetivo primário (é um artefato de portfólio), mas o repo segue as convenções abaixo como
se fosse um produto de time, de propósito.

## Estado atual do monorepo

Monorepo com **pnpm workspaces** (`pnpm-workspace.yaml`: `packages/*` e `apps/*`).

| Pacote          | Estado      | O que é                                                                                                                        |
| --------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/core` | **pronto**  | Domínio puro em TS: HMAC, idempotência, máquina de estados, money. Sem framework, cobertura ≥90% imposta.                      |
| `apps/api`      | **pronto**  | API NestJS completa (webhook 3 camadas, rotas admin, loja, painel, Prisma/Postgres), provada por integração com Postgres real. |
| `apps/web`      | _planejado_ | Front React + Vite (loja, página de pagamento, painel de conciliação).                                                         |

Enquanto o `apps/web` e o Docker não existem, os comandos que dependem deles (compose, e2e)
ainda não se aplicam — estão documentados aqui porque chegam junto com essas peças.

## Pré-requisitos

- **Node.js** na versão fixada em [`.node-version`](./.node-version) / [`.nvmrc`](./.nvmrc)
  (atualmente **20**). Use `nvm use` ou `fnm use` para casar a versão local. O campo
  `engines` do `package.json` exige `node >=20`. A matriz de CI roda os testes em
  **Node 20 e 22**; 22/24 entram quando a stack permitir (o porquê está no
  [`adr/0004`](./adr/0004-nest10-esm-nodenext.md)).
- **pnpm** via **corepack** (recomendado) — a versão é fixada por `packageManager`
  (`pnpm@9.15.4`). Ative com:
  ```bash
  corepack enable
  corepack prepare pnpm@9.15.4 --activate
  ```
- **Docker** + **Docker Compose** — só para o fluxo local full-stack (_planejado_, chega com o
  Dockerfile/compose e o `apps/web`). Não é necessário para o `packages/core` nem para a API
  (que roda contra qualquer Postgres local).
- **Git** com **assinatura de commit** configurada (GPG ou SSH). A branch protection de `main`
  exige commits verificados — configure `git config commit.gpgsign true` (ou o equivalente
  SSH) antes de contribuir. Veja "Fluxo de PR e branch protection".

## Setup

```bash
git clone https://github.com/racionalmengo/pix-live.git
cd pix-live
pnpm install            # instala deps e, via "prepare", ativa os git hooks (husky)
cp .env.example .env    # ajuste se for usar o sandbox do MP; o default roda em modo mock
```

O script `prepare` (`husky`) roda automaticamente no `pnpm install` e instala os git hooks.
**Nunca comite `.env`** — só o `.env.example` versionado. Segredos reais (MP access token,
webhook secret) vivem em env/secret group do host de deploy, jamais no repo.

## Rodando localmente

### Hoje — core + API

O `packages/core` roda 100% offline, sem Docker e sem banco:

```bash
pnpm test          # roda a suíte (vitest run) — os testes de integração pulam sem DATABASE_URL
pnpm test:watch    # modo watch durante desenvolvimento
pnpm test:cov      # com cobertura (thresholds impostos — ver "Padrão de qualidade")
pnpm typecheck     # tsc --noEmit em todos os pacotes (TS strict)
pnpm build         # build de todos os pacotes (tsc por pacote)
pnpm lint          # ESLint (flat config) em todo o repo
```

A **API** roda contra qualquer Postgres local (sem Docker):

```bash
cd apps/api
DATABASE_URL="postgresql://..." pnpm run db:migrate   # prisma migrate deploy
DATABASE_URL="postgresql://..." pnpm run db:seed      # semeia produto + pedido pago do wow
cd ../..
pnpm build && node apps/api/dist/main.js              # lê o .env da raiz
```

Os testes de **integração** (Supertest + Postgres real) rodam com
`DATABASE_URL=... pnpm test`; sem a variável eles **pulam** (`describe.skipIf`) e a suíte
continua verde — é assim que o CI unit fica determinístico sem banco.

### Full-stack local — `docker compose up` (_planejado_)

Quando o compose e o `apps/web` existirem, o alvo é **um comando** subir tudo com seed
determinístico (incluindo o pedido já pago pré-semeado) em **modo mock do Mercado Pago**,
sem precisar de conta no MP e sem rede:

```bash
docker compose up            # API (NestJS) + Postgres + web (React) — modo mock, offline
```

O `docker-compose.yml` ainda não existe neste ponto do repo; ele acompanha os apps. Enquanto
isso, `PAYMENT_PROVIDER=mock` no `.env` é o modo default que dispensa credenciais.

## Scripts disponíveis (raiz)

Todos rodam a partir da raiz do monorepo. Os `-r` propagam para cada workspace.

| Script              | O que faz                                                   |
| ------------------- | ----------------------------------------------------------- |
| `pnpm build`        | `pnpm -r run build` — build de cada pacote                  |
| `pnpm typecheck`    | `pnpm -r run typecheck` — `tsc --noEmit`, TypeScript strict |
| `pnpm test`         | `vitest run` — suíte completa                               |
| `pnpm test:watch`   | `vitest` — modo watch                                       |
| `pnpm test:cov`     | `vitest run --coverage` — cobertura com thresholds          |
| `pnpm lint`         | `eslint .` — flat config, type-checked + plugin security    |
| `pnpm lint:fix`     | `eslint . --fix`                                            |
| `pnpm format`       | `prettier --write .`                                        |
| `pnpm format:check` | `prettier --check .` — usado como gate                      |

## Padrão de qualidade

O padrão não é aspiracional: os gates que existem hoje são impostos localmente (hooks) e serão
required na CI (ver DoD no `SPEC.md`).

### TypeScript strict

`tsconfig.base.json` liga o modo estrito total, herdado por todos os pacotes:

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
- `noImplicitOverride`, `noImplicitReturns`, `noFallthroughCasesInSwitch`
- `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`
- `forceConsistentCasingInFileNames`

Regra de ouro: nada de `any` solto, nada de `console.log` (é erro de lint — logger
estruturado é obrigatório no app).

### Lint e formatação

- **ESLint 9 flat config** (`eslint.config.mjs`): `typescript-eslint` type-checked +
  `eslint-plugin-security`. Regras notáveis: `@typescript-eslint/no-floating-promises: error`,
  `no-console: error`. A flag `--max-warnings=0` no job de lint do CI é _planejada_
  (hardening de CI).
- **Prettier** é o formatador único (`.prettierrc.json`: aspas simples, trailing comma `all`,
  `printWidth` 100, `semi`). `.editorconfig` normaliza charset/EOL/indent; `format:check` é gate.

### Cobertura

Configurada em `vitest.config.ts` sobre `packages/*/src`:

- **Atual:** `packages/*/src` com ≥90% em linhas, branches, funções e statements — imposto no
  `test:cov` (o `apps/api` ainda está fora da medição de cobertura).
- **Alvo (_planejado_, entra com o `apps/web`):** gate global ≥80% incluindo `apps/`
  (`SPEC.md`). Badge de cobertura no README.

### Mutation testing (_planejado_)

**Stryker** sobre `packages/core` com **mutation score ≥85%** como gate — prova que os testes
matam mutantes, não só cobrem linha. O núcleo do "dinheiro não duplica" (HMAC, idempotência,
máquina de estados) é o alvo. A config do Stryker ainda não está no repo; entra como job de CI
(ou cron noturno, se o loop de PR ficar pesado).

## Convenção de commits — Conventional Commits

Todo commit segue [Conventional Commits](https://www.conventionalcommits.org/), validado por
**commitlint** (`commitlint.config.cjs` → `@commitlint/config-conventional`) no hook
`commit-msg`; a validação do título do PR via CI é _planejada_.

Formato:

```
<tipo>(<escopo opcional>): <descrição no imperativo, minúscula, sem ponto final>

[corpo opcional explicando o porquê]

[rodapé opcional: BREAKING CHANGE: ..., Refs: #123]
```

**Tipos aceitos:** `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`,
`style`, `revert`.

**Escopos sugeridos** (não obrigatórios): `core`, `api`, `web`, `ci`, `deps`, `docs`, `deploy`.

Exemplos:

```
feat(core): verificação HMAC-SHA256 em tempo constante do webhook
fix(api): não relaxar a Camada 2 via header do cliente na rota pública
test(core): matar mutante da janela de anti-replay
docs: nota honesta de branch protection de dev solo
```

Breaking change: use `!` após o tipo/escopo **ou** o rodapé `BREAKING CHANGE:`:

```
feat(api)!: renomeia /webhooks/mp para /webhooks/mercadopago
```

**Versionamento:** SemVer com `CHANGELOG` e tags automatizados por **release-please**
(_planejado_) a partir dos tipos de commit. Por isso a mensagem importa: ela vira changelog.
Primeira release pública alvo: `v1.0.0`.

## Git hooks (husky)

Instalados automaticamente pelo `pnpm install` (script `prepare`). Espelham os gates da CI
para falhar **localmente antes** de falhar no PR:

| Hook         | Comando                       | O que roda                                    |
| ------------ | ----------------------------- | --------------------------------------------- |
| `pre-commit` | `pnpm lint-staged`            | ESLint `--fix` + Prettier nos arquivos staged |
| `commit-msg` | `commitlint --edit`           | valida a mensagem (Conventional Commits)      |
| `pre-push`   | `pnpm typecheck && pnpm test` | typecheck + suíte de testes                   |

`lint-staged` (config no `package.json`): `*.{ts,tsx,mjs,cjs}` → `eslint --fix` + `prettier`;
`*.{json,md,yml,yaml}` → `prettier`.

Os hooks são **conveniência, não a fonte da verdade**. É possível pulá-los localmente
(`git commit --no-verify`), mas isso não ajuda: os **mesmos checks são required na CI** e o PR
não mergeia com check vermelho. Não use `--no-verify` para escapar de um gate — use para casos
legítimos (ex.: WIP em branch pessoal) sabendo que a CI vai cobrar depois.

## Fluxo de PR e branch protection

`main` é protegida: **proibido push direto**, exige PR, todos os status checks do `ci.yml`
verdes, branch up-to-date (strict), **linear history**, **commits assinados/verificados**,
conversation resolution obrigatória, sem force-push, sem deleção, regras valendo inclusive
para administradores.

Fluxo:

1. Crie uma branch a partir de `main` (`feat/...`, `fix/...`).
2. Commits em Conventional Commits, assinados.
3. Abra o PR; espere **todos** os checks required ficarem verdes.
4. Merge com history linear (rebase/squash), mantendo mensagens convencionais.

### Nota honesta: branch protection de dev solo

Este é um projeto de **um desenvolvedor só**. Isso significa que **não há um segundo revisor**
para aprovar o PR de forma independente — exigir "1 approval" de outra pessoa seria teatro,
porque o único aprovador possível é o próprio autor.

A escolha consciente, portanto, é **não** fingir revisão humana que não existe, e sim deslocar
o gate de qualidade para onde ele é real e não-negociável:

- o **conjunto de checks required** da CI — hoje: lint, format, typecheck, testes com cobertura,
  CodeQL, gitleaks e dependency-review; _planejados_ para o endurecimento: mutation, Trivy, OSV e
  Scorecard — nenhum merge com vermelho (a branch protection em si é configurada na publicação);
- a **disciplina de PR** (nada direto em `main`, branch por mudança, history linear,
  conversation resolution, commits assinados);
- a **branch protection** que vale inclusive para o administrador — o autor não consegue burlar
  as próprias regras.

Em resumo: **em um time, o gate seria "checks verdes + aprovação de outra pessoa"; aqui é
"checks verdes + disciplina de PR + branch protection aplicada a todos, sem exceção para o
dono"**. É uma decisão explícita e documentada, não uma omissão de processo. Se/quando houver
um segundo mantenedor, a regra de required review passa a fazer sentido e deve ser ligada.

## Segurança

Vulnerabilidades: siga o `SECURITY.md` (política de disclosure e threat model). Nunca comite
segredos — o repo roda gitleaks no CI sobre o history completo; secret scanning com push
protection (setting do GitHub) entra na publicação. Se um segredo vazar no history, rotacione-o
(não basta apagar o commit). O `.env.example` documenta as variáveis; os
valores reais só no host de deploy.
