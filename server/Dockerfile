# syntax=docker/dockerfile:1

# ---- build: compile TypeScript (this stage can also run the dev scripts, e.g. the seed) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts skips mongodb-memory-server's binary download; tests do not run in the image.
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

# ---- runtime: production dependencies and compiled JavaScript only ----
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
RUN mkdir -p uploads .outbox && chown -R node:node /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/server.js"]
