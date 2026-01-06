# syntax=docker/dockerfile:1
# Production Dockerfile for Live Draw Sync

# --- Build Stage ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client
RUN pnpm db:generate

# Build client and server
RUN pnpm build

# --- Production Stage ---
FROM node:20-alpine AS runner

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 livedraw

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Generate Prisma client in production stage
RUN pnpm db:generate

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Set ownership to non-root user
RUN chown -R livedraw:nodejs /app

USER livedraw

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

# Start the server
CMD ["node", "dist/server.js"]
