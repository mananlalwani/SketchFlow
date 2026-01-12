# syntax=docker/dockerfile:1
# Production Dockerfile for Live Draw Server (API only)

# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files (server + shared only)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/prisma ./apps/server/prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY apps/server ./apps/server
COPY packages/shared ./packages/shared

# Build shared package first
RUN pnpm --filter @live-draw/shared build

# Generate Prisma client
WORKDIR /app/apps/server
RUN pnpm db:generate
WORKDIR /app

# Build server
RUN pnpm --filter @live-draw/server build

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 livedraw

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/prisma ./apps/server/prisma/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Generate Prisma client in production stage
WORKDIR /app/apps/server
RUN pnpm db:generate
WORKDIR /app

# Copy built artifacts from builder
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

# Set ownership
RUN chown -R livedraw:nodejs /app

USER livedraw

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start command
CMD ["node", "apps/server/dist/index.js"]
