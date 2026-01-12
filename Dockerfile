# syntax=docker/dockerfile:1
# NOTE: To avoid caching issues with build artifacts, always build with:
#   docker build --no-cache -t your-image-name .
# Production Dockerfile for Live Draw Server (API only)

# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Prisma: only generate for linux-musl-arm64-openssl-3.0.x (Alpine ARM64)
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-arm64-openssl-3.0.x

# Copy package files (server + shared only)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/prisma ./apps/server/prisma/

# Install ALL dependencies (needed for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared


# Build shared package (must be before server build and prune)
RUN pnpm --filter @live-draw/shared build

# Ensure dist exists before prune
RUN test -d /app/packages/shared/dist

# Generate Prisma client (single target)
RUN pnpm --filter @live-draw/server db:generate

# Build server
RUN pnpm --filter @live-draw/server build


# Prune to production dependencies only (after all builds)
RUN CI=true pnpm prune --prod

# Remove unnecessary files from node_modules
RUN find node_modules -type f \( -name "*.md" -o -name "*.ts" -o -name "*.map" -o -name "LICENSE*" -o -name "CHANGELOG*" -o -name "*.d.ts" \) -delete 2>/dev/null || true
RUN find node_modules -type d -name ".git" -exec rm -rf {} + 2>/dev/null || true
RUN rm -rf node_modules/.pnpm/@swc* node_modules/.pnpm/typescript* 2>/dev/null || true

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 livedraw

## Copy only what's needed
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma

# Set ownership
RUN chown -R livedraw:nodejs /app

USER livedraw

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start command
CMD ["node", "apps/server/dist/index.js"]
