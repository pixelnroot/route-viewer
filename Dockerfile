# ── Stage 1: install deps ──────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2: build ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Stage 3: minimal runtime ───────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# persistent data directory (routes.json lives here)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
