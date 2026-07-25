CREATE TABLE "collaboration_operations" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "receiptHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "collaboration_operations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "collaboration_operations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "collaboration_operations_projectId_operationId_key"
ON "collaboration_operations"("projectId", "operationId");

CREATE UNIQUE INDEX "collaboration_operations_projectId_revision_key"
ON "collaboration_operations"("projectId", "revision");

CREATE INDEX "collaboration_operations_projectId_createdAt_idx"
ON "collaboration_operations"("projectId", "createdAt");
