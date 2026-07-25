#!/usr/bin/env sh
set -eu

compose_file=docker-compose.test.yml
project_name=${COMPOSE_PROJECT_NAME:-"sketchflow-real-infrastructure-$$"}
compose="docker compose -f $compose_file -p $project_name"

cleanup() {
  status=$?
  trap - EXIT
  $compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

$compose up --detach --wait
postgres_port=$($compose port postgres 5432 | sed 's/.*://')
redis_port=$($compose port redis 6379 | sed 's/.*://')

export NODE_ENV=test
export RUN_REAL_INFRASTRUCTURE=1
export DATABASE_URL="postgresql://sketchflow:sketchflow_test@127.0.0.1:${postgres_port}/sketchflow_test?schema=public"
export REDIS_URL="redis://127.0.0.1:${redis_port}"
export REDIS_TEST_URL="$REDIS_URL"
export CLERK_SECRET_KEY='sk_test_infrastructure_only'
export CLERK_PUBLISHABLE_KEY='pk_test_infrastructure_only'
export CORS_ORIGINS='http://127.0.0.1:4173'

pnpm --filter @sketchflow/server db:generate
pnpm --filter @sketchflow/server db:migrate:deploy
pnpm --filter @sketchflow/server test:integration
pnpm --filter @sketchflow/server exec vitest run src/__tests__/api/socket.integration.test.ts
