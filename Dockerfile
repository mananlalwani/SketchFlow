# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy source code
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build shared package
RUN pnpm --filter @live-draw/shared build

# Generate Prisma client (for build)
RUN pnpm --filter @live-draw/server db:generate

# Build server
RUN pnpm --filter @live-draw/server build

# Deploy server (isolated production build)
# This installs prod dependencies into /app/deploy
RUN pnpm --filter @live-draw/server --prod deploy /app/deploy

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
    adduser --system --uid 1001 livedraw

# Copy the deployed application from builder
COPY --from=builder --chown=livedraw:nodejs /app/deploy .

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Set ownership
USER livedraw

EXPOSE 3000

CMD ["node", "dist/index.js"]
