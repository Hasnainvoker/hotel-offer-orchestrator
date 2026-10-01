# syntax=docker/dockerfile:1

# Debian (glibc) base: the Temporal worker ships a native Rust core that
# is built for glibc, so Alpine/musl is not used here.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-trixie-slim AS runtime
ENV NODE_ENV=production
# The app only needs the node binary. Removing the bundled package managers
# (npm, corepack, yarn) shrinks the image and drops their dependency CVEs.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
 && apt-get update && apt-get upgrade -y --no-install-recommends \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000

# Same image runs both processes; docker-compose overrides the command for the worker.
CMD ["node", "dist/server.js"]
