CREATE TABLE "collaboration_snapshots" (
  "projectId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "collaboration_snapshots_pkey" PRIMARY KEY ("projectId"),
  CONSTRAINT "collaboration_snapshots_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
