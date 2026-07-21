ALTER TABLE "projects"
  ADD COLUMN "shareExpiresAt" TIMESTAMP(3),
  ADD COLUMN "shareRevokedAt" TIMESTAMP(3);

CREATE INDEX "projects_shareExpiresAt_idx" ON "projects"("shareExpiresAt");
