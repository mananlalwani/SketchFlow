# ADR 0001: server-ordered, revision-guarded collaboration

## Status

Accepted.

## Decision

SketchFlow uses server-ordered snapshots rather than a CRDT. Canvas events are broadcast only after
the server verifies the room and editor permission. Durable project saves use a monotonic revision
and conditional update: the client supplies its last acknowledged revision and the server accepts
exactly one matching write.

## Semantics

- The server is the authority for room membership, mutation ordering, and persistence.
- Acknowledged canvas snapshots are persisted transactionally enough to survive process restarts;
  in-memory room state is a cache.
- A save with a stale revision returns `409` and preserves local IndexedDB recovery data.
- Undo remains client-local until a successful save; concurrent changes do not silently merge.
- Public links are HTTP read-only and intentionally never join realtime rooms.

## Recovery

The client retries transient failures with backoff, keeps an IndexedDB emergency snapshot, and
surfaces a conflict state instead of overwriting newer server data. Users can reload, duplicate, or
export their recovered local work.

## Scaling

Production multi-instance Socket.IO deployments require the Redis adapter. Development may run a
single instance without Redis; this is not a horizontally scalable mode. Set
`SOCKET_INSTANCE_COUNT` to the planned deployment count; production startup rejects values above
one unless `REDIS_URL` is configured.
