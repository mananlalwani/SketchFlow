#!/bin/sh
set -eu

IMAGE="ghcr.io/mananlalwani/sketchflow:latest"
CONTAINER="live-draw"
ENV_FILE="/opt/sketchflow/.env"
PORT="4967"

exec 9>/run/lock/sketchflow-deploy.lock
flock -n 9 || exit 0

old_image=""
if docker inspect "$CONTAINER" >/dev/null 2>&1; then
  old_image="$(docker inspect --format '{{.Image}}' "$CONTAINER")"
fi

docker pull "$IMAGE" >/dev/null
new_image="$(docker image inspect --format '{{.Id}}' "$IMAGE")"

if [ "$old_image" = "$new_image" ]; then
  exit 0
fi

docker run --rm --env-file "$ENV_FILE" --pull never "$IMAGE" \
  node_modules/.bin/prisma migrate deploy

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d \
  --name "$CONTAINER" \
  --env-file "$ENV_FILE" \
  -p "$PORT:$PORT" \
  --restart unless-stopped \
  --pull never \
  "$IMAGE" >/dev/null

healthy=0
for _ in $(seq 1 30); do
  if curl --fail --silent "http://127.0.0.1:$PORT/api/health" >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done

if [ "$healthy" -ne 1 ]; then
  docker logs --tail 80 "$CONTAINER" >&2 || true
  exit 1
fi
