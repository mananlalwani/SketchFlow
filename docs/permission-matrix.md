# Project access and sharing permission matrix

This matrix is the authorization contract for HTTP and Socket.IO boundaries. The server derives
identity from Clerk and roles from the database; it never accepts a client-supplied role or project
permission as authority.

| Actor                           | Project read                                        | Project write / socket mutations | Delete / share / collaborators / folders | Socket room join                                              |
| ------------------------------- | --------------------------------------------------- | -------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| Owner                           | Allowed                                             | Allowed                          | Allowed                                  | Allowed                                                       |
| Editor collaborator             | Allowed                                             | Allowed                          | Denied                                   | Allowed                                                       |
| Viewer collaborator             | Allowed                                             | Denied                           | Denied                                   | Allowed                                                       |
| Anonymous                       | Denied                                              | Denied                           | Denied                                   | Denied                                                        |
| Valid public-link visitor       | Shared-project HTTP read only                       | Denied                           | Denied                                   | Not supported; public links do not grant realtime room access |
| Expired or revoked link visitor | Denied (`404`)                                      | Denied                           | Denied                                   | Denied                                                        |
| Guessed project ID or token     | Denied (`404` for HTTP; no room join for Socket.IO) | Denied                           | Denied                                   | Denied                                                        |

## Enforcement notes

- REST project and folder endpoints require Clerk authentication. `ProjectService` checks ownership
  or collaborator role for each operation.
- The public share endpoint accepts only an active, non-revoked, unexpired token and returns a
  viewer role. It never grants write access.
- Socket.IO requires a verified Clerk token at handshake. A room is joined only after a server-side
  `view` permission check. Every mutation rechecks `edit` permission for the joined room.
- IDs and share tokens are validated at the HTTP parameter boundary and before Socket.IO permission
  lookup. Socket event/message frequency and HTTP body size are capped separately.

The public-link realtime policy is intentionally deny-by-default until a scoped, token-bound socket
authorization contract is implemented and tested.
