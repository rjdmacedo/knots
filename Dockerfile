FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/app
COPY ./package.json \
     ./pnpm-lock.yaml \
     ./next.config.mjs \
     ./tsconfig.json \
     ./reset.d.ts \
     ./postcss.config.js ./
COPY ./scripts ./scripts
COPY ./prisma ./prisma
COPY ./prisma.config.ts ./
# Provide env for prisma generate (and prisma.config.ts if loaded)
COPY scripts/build.env .env

RUN apk add --no-cache openssl && \
    pnpm install --frozen-lockfile --ignore-scripts && \
    pnpm approve-builds bcrypt && \
    npx prisma generate

COPY ./src ./src
COPY ./messages ./messages
COPY ./CHANGELOG.md ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm run build

RUN rm -r .next/cache

FROM node:20-alpine AS runtime-deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /usr/app
COPY --from=base /usr/app/package.json /usr/app/pnpm-lock.yaml /usr/app/next.config.mjs ./
COPY --from=base /usr/app/prisma ./prisma

RUN pnpm install --frozen-lockfile --prod --ignore-scripts && \
    npx prisma generate

FROM node:20-alpine AS runner

EXPOSE 3000/tcp
WORKDIR /usr/app

COPY --from=base /usr/app/package.json /usr/app/pnpm-lock.yaml /usr/app/next.config.mjs ./
COPY --from=runtime-deps /usr/app/node_modules ./node_modules
COPY ./public ./public
COPY ./scripts ./scripts
COPY --from=base /usr/app/prisma ./prisma
COPY --from=base /usr/app/.next ./.next
COPY ./CHANGELOG.md ./

ENTRYPOINT ["/bin/sh", "/usr/app/scripts/container-entrypoint.sh"]
