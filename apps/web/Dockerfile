# Imagem do front — build Vite num estágio node, runtime nginx estático.
# Context de build: a RAIZ do monorepo (docker build -f apps/web/Dockerfile .).
#
# TODO(digest): pinar as bases por digest (@sha256:...) na verificação com
# Docker ligado — o pré-push cobra com grep antes do repo ir a público.
FROM node:20-bookworm-slim AS build
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
# (uid 101, listen 8080). Conferir procedência ao pinar o digest.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
