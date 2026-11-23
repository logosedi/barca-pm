# Imagem de produção do BARCA PM.
#
#   docker build -t barca-pm:1 .
#
# Ao iniciar, o contêiner aplica as migrações pendentes no Postgres de DATABASE_URL e
# sobe o servidor na porta 3000. Sem DATABASE_URL ele não inicia, de propósito: o banco
# embutido é só para desenvolvimento. Variáveis e volume: veja docker-stack.yml.

FROM node:24-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@10.33.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && rm -rf .next/cache

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads
WORKDIR /app
# A imagem leva as dependências completas: `next start` precisa do TypeScript para ler
# next.config.ts e as migrações rodam com tsx, exatamente como fora do contêiner.
COPY --from=build --chown=node:node /app ./
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
# Imagens coladas em descrições e comentários. Precisa ser um volume persistente.
VOLUME /data
EXPOSE 3000
# /api/health consulta o banco: 200 quando está tudo bem, 503 se o banco não responde.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# `exec` deixa o Node como processo principal, para receber o SIGTERM e encerrar com calma.
CMD ["sh", "-c", "node node_modules/tsx/dist/cli.mjs scripts/migrate.ts && exec node node_modules/next/dist/bin/next start -H 0.0.0.0"]
