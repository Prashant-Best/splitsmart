# syntax=docker/dockerfile:1
# Build context is the repository root: the client compiles the server's pure domain module
# (server/src/domain) into its bundle for the live split preview.

FROM node:24-alpine AS build
WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN cd client && npm ci
COPY server/src/domain ./server/src/domain
COPY client ./client
RUN cd client && npm run build

# nginx serves the static app and proxies /api to the API container (same origin, so the
# httpOnly SameSite=Lax session cookie just works).
FROM nginx:1.29-alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
