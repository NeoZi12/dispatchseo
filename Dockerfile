# DispatchSEO self-host image. Multi-stage: deps -> build -> minimal runner
# (Next.js standalone output, non-root). Built by docker-compose.yml; see
# docs/SELF_HOSTING.md for the quickstart.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN npm install --global --no-update-notifier --no-fund pnpm@11.5.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN npm install --global --no-update-notifier --no-fund pnpm@11.5.2
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DOCKER_BUILD flips next.config.ts to standalone output. No secrets are
# needed at build time - all env (database, keys) is runtime-only.
ENV DOCKER_BUILD=1 NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system nodejs && useradd --system --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
