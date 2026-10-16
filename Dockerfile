FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 JENERA_APP_MODE=byok JENERA_DATA_DIR=/app/data
RUN groupadd --system jenera && useradd --system --gid jenera jenera
RUN mkdir /app/data && chown jenera:jenera /app/data
COPY --from=build --chown=jenera:jenera /app/.next/standalone ./
COPY --from=build --chown=jenera:jenera /app/.next/static ./.next/static
COPY --from=build --chown=jenera:jenera /app/public ./public
COPY --from=build --chown=jenera:jenera /app/scripts/preflight.mjs /app/scripts/container-start.mjs ./scripts/
USER jenera
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/container-start.mjs"]
