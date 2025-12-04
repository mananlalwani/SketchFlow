-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT DEFAULT '#3b82f6',
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");

-- CreateIndex
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");

-- CreateIndex
CREATE INDEX "projects_folderId_idx" ON "projects"("folderId");

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
