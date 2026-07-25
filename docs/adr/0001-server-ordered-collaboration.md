# ADR 0001: server-ordered, revision-guarded collaboration

## Status

Accepted.

## Decision

SketchFlow uses server-ordered object operations rather than a CRDT. Canvas events are broadcast only
after the server verifies room and editor permission. Each operation has an idempotency ID and is
applied with a monotonic project revision and conditional update.

## Semantics

- The server is the authority for room membership, mutation ordering, and persistence.
- Accepted operations and canonical project JSON are persisted transactionally; in-memory room state
  is only a cache.
- Upserts/deletes for different object IDs rebase over the latest canonical document. Batches apply
  atomically. Competing writes to the same object resolve by server acceptance order.
- Whole-project replacement remains revision-guarded and returns a conflict for stale writes.
- Undo/redo is local history expressed as normal object-operation batches when committed.
- Public links are HTTP read-only and intentionally never join realtime rooms.

## Recovery

The client stores unsent semantic operations in IndexedDB before socket emission and replays them on
reconnect or restart. Duplicate IDs are harmless. A revision gap triggers canonical hydration; a
whole-document conflict remains visible instead of silently overwriting newer data.

## Scaling

Production multi-instance Socket.IO deployments require the Redis adapter. Development may run a
single instance without Redis; this is not a horizontally scalable mode. Set
`SOCKET_INSTANCE_COUNT` to the planned deployment count; production startup rejects values above
one unless `REDIS_URL` is configured.
