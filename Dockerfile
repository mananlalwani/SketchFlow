# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Copy source code
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package
RUN pnpm --filter @sketchflow/shared build

# Generate Prisma client (for build)
RUN pnpm --filter @sketchflow/server db:generate

# Build client and server
RUN pnpm --filter @sketchflow/client build
RUN pnpm --filter @sketchflow/server build

# Deploy server (isolated production build)
# This installs prod dependencies into /app/deploy
RUN pnpm --filter @sketchflow/server --prod deploy --legacy /app/deploy

# Verify and copy artifacts if needed
# pnpm deploy might not copy ignored build artifacts like dist, so we copy them explicitly
RUN cp -r apps/server/dist /app/deploy/dist
RUN cp -r apps/server/prisma /app/deploy/prisma

# Generate Prisma Data Proxy/Client for the production deploy
WORKDIR /app/deploy
RUN pnpm db:generate

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 sketchflow

# Copy the deployed application from builder
COPY --from=builder --chown=sketchflow:nodejs /app/deploy .
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist /app/client/dist

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV CLIENT_DIST_PATH=/app/client/dist

# Set ownership
USER sketchflow

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
