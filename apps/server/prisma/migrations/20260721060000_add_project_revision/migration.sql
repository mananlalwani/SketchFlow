ALTER TABLE "projects" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "projects_id_revision_key" ON "projects"("id", "revision");
