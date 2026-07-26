# syntax=docker/dockerfile:1
ARG BUILDPLATFORM
ARG TARGETPLATFORM

# This target is built independently in CI so Docker's own context rules—not a
# filesystem glob approximation—prove local env files and maps never enter it.
FROM --platform=$BUILDPLATFORM node:24-alpine AS context-audit
WORKDIR /context
COPY . .
RUN test ! -e .env && \
    test ! -e apps/client/.env && \
    test ! -e apps/server/.env && \
    ! find . -type f \( -name '*.map' -o \( \( -name '.env' -o -name '.env.*' \) ! -name '.env.example' \) \) -print -quit | grep -q .

FROM --platform=$BUILDPLATFORM node:24-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

# Copy only workspace manifests before installing. This keeps the dependency
# layer reusable for code-only changes, which are the common CI case.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

# Source changes below no longer invalidate this expensive layer. The cache
# mount also reuses fetched packages when the lockfile does change.
RUN --mount=type=cache,id=sketchflow-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# Copy application source only after dependencies are available.
COPY . .

# Build shared package
RUN pnpm --filter @sketchflow/shared build

# Generate Prisma client (for build). The builder runs on BUILDPLATFORM (native
# AMD64), so the native Prisma engine works without QEMU emulation issues.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/sketchflow_build \
    pnpm --filter @sketchflow/server db:generate

# Build client and server. The Sentry token is mounted only for this build step, never
# copied into an image layer or exposed as a Vite variable. RELEASE_ID is public release metadata.
ARG RELEASE_ID=unknown
ARG SENTRY_ORG
ARG SENTRY_PROJECT
RUN --mount=type=secret,id=sentry_auth_token,required=false \
    if [ -f /run/secrets/sentry_auth_token ]; then \
      SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token)" \
      SENTRY_ORG="$SENTRY_ORG" \
      SENTRY_PROJECT="$SENTRY_PROJECT" \
      VITE_RELEASE_ID="$RELEASE_ID" \
      pnpm --filter @sketchflow/client build; \
    else \
      VITE_RELEASE_ID="$RELEASE_ID" pnpm --filter @sketchflow/client build; \
    fi && \
    ! find apps/client/dist -type f -name '*.map' -print -quit | grep -q . && \
    ! grep -R --include='*.js' --include='*.css' 'sourceMappingURL=' apps/client/dist
RUN pnpm --filter @sketchflow/server build

# Deploy server (isolated production build)
# This installs prod dependencies into /app/deploy
RUN pnpm --filter @sketchflow/server --prod deploy --legacy /app/deploy

# pnpm records the wall-clock time of its production prune in this otherwise
# identical metadata file. It is not read at runtime, but would make the entire
# node_modules image layer receive a new digest on every code-only build.
RUN sed -i '/^prunedAt: /d' /app/deploy/node_modules/.modules.yaml

# pnpm deploy can include dependency source maps and package env templates. Neither is
# needed at runtime and retaining either expands the public image surface.
RUN find /app/deploy -type f \( -name '*.map' -o -name '.env' -o -name '.env.*' \) -delete

# pnpm deploy might not copy ignored build artifacts like dist, so we copy them explicitly.
RUN cp -r apps/server/dist /app/deploy/dist
RUN cp -r apps/server/prisma /app/deploy/prisma

# Generate Prisma Data Proxy/Client for the production deploy
WORKDIR /app/deploy
RUN DATABASE_URL=postgresql://build:build@localhost:5432/sketchflow_build \
    pnpm db:generate

# --- Production Stage ---
FROM --platform=$TARGETPLATFORM node:24-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 sketchflow

# Keep production dependencies independent from application code. A normal
# server edit now replaces only `dist`; Docker reuses the much larger
# node_modules layer already present on the VPS.
COPY --from=builder --chown=sketchflow:nodejs /app/deploy/node_modules /app/node_modules
COPY --from=builder --chown=sketchflow:nodejs /app/deploy/package.json /app/package.json
COPY --from=builder --chown=sketchflow:nodejs /app/deploy/dist /app/dist
COPY --from=builder --chown=sketchflow:nodejs /app/deploy/prisma /app/prisma
# Keep client output in separately cached layers. New app code does not force a
# VPS to re-download unchanged vendors or optional PDF/canvas workers.
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/index.html /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/manifest.webmanifest /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/sw.js /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/registerSW.js /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/workbox-*.js /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/favicon.ico /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/apple-touch-icon.png /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/masked-icon.svg /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/pwa-192x192.png /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/pwa-512x512.png /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/vite.svg /app/client/dist/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/assets/rendererWorker-*.js /app/client/dist/assets/
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/assets/vendor /app/client/dist/assets/vendor
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/assets/styles /app/client/dist/assets/styles
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/assets/workers /app/client/dist/assets/workers
COPY --from=builder --chown=sketchflow:nodejs /app/apps/client/dist/assets/app /app/client/dist/assets/app

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV CLIENT_DIST_PATH=/app/client/dist

# Set ownership
USER sketchflow

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/readyz').then(response => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
