CREATE TABLE "project_history_snapshots" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "contentHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_history_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_history_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "project_history_snapshots_projectId_contentHash_key" ON "project_history_snapshots"("projectId", "contentHash");
CREATE INDEX "project_history_snapshots_projectId_createdAt_idx" ON "project_history_snapshots"("projectId", "createdAt");
CREATE INDEX "project_history_snapshots_projectId_revision_idx" ON "project_history_snapshots"("projectId", "revision");
