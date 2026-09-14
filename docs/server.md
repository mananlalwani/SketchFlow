# Server structure

`apps/server/src/index.ts` constructs Express, Socket.IO, optional Redis, and process shutdown. It does not own project HTTP or collaboration apply math.

| Layer | Role |
| --- | --- |
| `routes/health.ts`, `routes/projects.ts`, `routes/folders.ts` | HTTP status mapping and Clerk/share wiring |
| `realtime/collaborationSocket.ts` | Socket auth, rooms, presence, `collaboration:commit` |
| `lib/collaborationDocument.ts` | Canonical `{ objects }` upsert/delete/batch |
| `lib/projectAccess.ts` | Role matrix for view/edit/share/manage |
| `lib/projectHistory.ts` | Snapshot hash + retention |
| `services/ProjectService.ts` | Prisma persistence, revisions, receipts, permissions |
| `services/ProjectShareService.ts` | Public share tokens |
| `services/ProjectCollaboratorService.ts` | Collaborator membership |
| `services/FolderService.ts` | Folder CRUD and moving projects |
| `validation/project.ts` | Wire size/shape limits |

Collaboration semantics: [ADR 0001](adr/0001-server-ordered-collaboration.md).
