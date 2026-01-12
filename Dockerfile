# syntax=docker/dockerfile:1
# Production Dockerfile for Live Draw Sync

# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Build argument for Clerk publishable key (needed at build time for Vite)
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/prisma ./apps/server/prisma/

# Install all dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build shared package first
RUN pnpm --filter @live-draw/shared build

# Generate Prisma client
WORKDIR /app/apps/server
RUN pnpm db:generate
WORKDIR /app

# Build client and server
RUN pnpm --filter @live-draw/client build
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
COPY apps/client/package.json ./apps/client/
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
COPY --from=builder /app/apps/client/dist ./apps/client/dist
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
