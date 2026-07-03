# Imagem da API — multi-stage, non-root, deps de produção apenas.
# Context de build: a RAIZ do monorepo (docker build -f apps/api/Dockerfile .).
# O MESMO Dockerfile serve o compose local (modo mock) e o deploy (Render).
#
# TODO(digest): pinar a base por digest (@sha256:...) na verificação com Docker
# ligado — gate do SPEC; o pré-push cobra com grep antes do repo ir a público.
FROM node:20-bookworm-slim AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm via corepack na versão exata do packageManager do repo. O engine nativo
# do Prisma precisa de libssl3 em runtime — o node:slim não garante openssl
# (recomendação oficial do Prisma para imagens debian-slim).
# hadolint ignore=DL3008
RUN corepack enable pnpm \
  && apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ── deps: só lockfile + manifests → cache desta layer sobrevive a mudança de fonte.
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
# frozen-lockfile exige TODOS os manifests do workspace no disco, mesmo os que
# o filtro não instala (o lockfile lista todos os importers):
COPY apps/web/package.json apps/web/
# Instala api + deps de workspace dela (core). O postinstall do Prisma baixa os
# engines aqui — rede SÓ dentro do docker build, análogo a um pnpm install.
RUN pnpm install --frozen-lockfile --filter "@pix-live/api..."

# ── build: core → prisma generate → api (a api compila contra o client gerado).
# Este estágio (prisma CLI + tsx de devDeps + client gerado) é o alvo do serviço
# one-shot `migrate` do docker-compose: `prisma migrate deploy && prisma db seed`.
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/core/ packages/core/
COPY apps/api/ apps/api/
RUN pnpm --filter @pix-live/core run build \
  && pnpm --filter @pix-live/api exec prisma generate \
  && pnpm --filter @pix-live/api run build

# ── prod: node_modules self-contained SÓ de produção + client Prisma gerado.
# ATENÇÃO: `pnpm deploy` é recurso oficialmente EXPERIMENTAL do pnpm 9. Na
# primeira verificação com Docker ligado, o teste nº 1 é
#   docker build --target prod ... && ls /out/dist/main.js /out/prisma/schema.prisma
# ANTES de subir o compose: apps/api não declara `files` e o .gitignore da
# raiz lista dist/ — se o deploy respeitar o ignore, o dist some de /out e o
# CMD falha com MODULE_NOT_FOUND (derruba a demo E o deploy, que reusam esta
# imagem). O segundo generate escreve o client DENTRO de /out: o Prisma
# resolve o node_modules a partir do --schema. Se a verificação desmentir o
# mecanismo: o fallback correto é REGENERAR dentro de /out — nunca cópia flat
# de .prisma/@prisma, porque a estrutura do pnpm é aninhada em
# node_modules/.pnpm e cópia flat quebra a resolução de módulos.
FROM build AS prod
RUN pnpm --filter @pix-live/api deploy --prod /out \
  && pnpm --filter @pix-live/api exec prisma generate --schema=/out/prisma/schema.prisma

# ── runtime: mínimo, non-root, sem toolchain, sem devDependencies.
FROM node:20-bookworm-slim AS runtime
# hadolint ignore=DL3008
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# production baked = default seguro pro alvo real (Render). O docker-compose
# local SOBRESCREVE para NODE_ENV=test: mock é proibido em produção (trava Zod
# do env) e `development` ligaria o transport pino-pretty — devDependency que
# NÃO existe neste runtime --prod (decisão D6/B1 do pipeline de desenho). Um
# `docker run` seco, sem env, falha fail-fast no Zod — esperado, não bug.
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod --chown=node:node /out /app
USER node
EXPOSE 3000
# Liveness pura (/health/live, NÃO toca o Postgres): healthcheck de container
# decide reciclagem de PROCESSO. /health/ready (dependente do banco) fica para
# gate de TRÁFEGO (depends_on do compose, LB, deploy) — readiness-como-liveness
# reiniciaria a API em cascata num blip do banco gerenciado (B3 do pipeline).
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/health/live`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# node como processo principal (PID1 sem init; PID2 sob docker-init quando o
# compose liga init:true) — exec form garante SIGTERM direto no node e o
# enableShutdownHooks() do Nest drena as conexões em voo.
CMD ["node", "dist/main.js"]
