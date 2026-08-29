CREATE TYPE "collaboration_operation_kind" AS ENUM (
  'replace-project',
  'upsert-object',
  'delete-object',
  'batch'
);

CREATE TYPE "collaborator_role" AS ENUM ('editor', 'viewer');

ALTER TABLE "collaboration_operations"
  ALTER COLUMN "kind" TYPE "collaboration_operation_kind"
  USING "kind"::"collaboration_operation_kind";

ALTER TABLE "project_collaborators"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "collaborator_role"
  USING "role"::"collaborator_role",
  ALTER COLUMN "role" SET DEFAULT 'editor';

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_revision_positive" CHECK ("revision" > 0),
  ADD CONSTRAINT "projects_share_state_consistent" CHECK (
    ("shared" = TRUE AND "shareToken" IS NOT NULL AND "shareRevokedAt" IS NULL)
    OR ("shared" = FALSE AND "shareToken" IS NULL)
  );

ALTER TABLE "collaboration_operations"
  ADD CONSTRAINT "collaboration_operations_revision_positive" CHECK ("revision" > 0);
