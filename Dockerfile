FROM node:24-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runner

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    NUXT_DATABASE_PATH=/app/data/accounting.sqlite

WORKDIR /app
RUN mkdir -p /app/data && chown -R node:node /app
COPY --from=builder --chown=node:node /app/.output ./.output

USER node
EXPOSE 3000
VOLUME ["/app/data"]

CMD ["node", ".output/server/index.mjs"]
