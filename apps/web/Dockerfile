# Imagem do front — build Vite num estágio node, runtime nginx estático.
# Context de build: a RAIZ do monorepo (docker build -f apps/web/Dockerfile .).
#
# Bases pinadas por digest (gate do SPEC; resolvidos na verificação com Docker
# de 2026-07-03 via `docker buildx imagetools inspect`; Renovate mantém).
FROM node:20-bookworm-slim@sha256:2cf067cfed83d5ea958367df9f966191a942351a2df77d6f0193e162b5febfc0 AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable pnpm
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @pix-live/web
COPY apps/web/ apps/web/
# Token de demonstração PÚBLICO por design (a UI o rotula) — baked no bundle
# pelo Vite. B4: o compose alimenta este ARG com a MESMA variável que vira o
# DEMO_TOKEN da api — fonte única, sem dessincronia silenciosa (401 no wow).
ARG VITE_DEMO_TOKEN=demo-nao-secreto
ENV VITE_DEMO_TOKEN=${VITE_DEMO_TOKEN}
RUN pnpm --filter @pix-live/web run build

# nginxinc/nginx-unprivileged: variante do vendor nginxinc, FORA do programa
# Docker Official Images (vigilante-F7) — escolhida por rodar non-root nativo
# (uid 101, listen 8080). Procedência: namespace oficial nginxinc no Docker
# Hub; o digest abaixo congela o artefato exato auditado (Trivy limpo).
FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0 AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
