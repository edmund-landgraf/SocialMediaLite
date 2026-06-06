-- CreateEnum
CREATE TYPE "MessageFolderKind" AS ENUM ('CUSTOM', 'SAVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "MessageFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MessageFolderKind" NOT NULL DEFAULT 'CUSTOM',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageFolder_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "MessageThreadParticipant" ADD COLUMN "folderId" TEXT;

-- CreateIndex
CREATE INDEX "MessageFolder_userId_sortOrder_idx" ON "MessageFolder"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MessageFolder_userId_name_key" ON "MessageFolder"("userId", "name");

-- CreateIndex
CREATE INDEX "MessageThreadParticipant_userId_folderId_idx" ON "MessageThreadParticipant"("userId", "folderId");

-- AddForeignKey
ALTER TABLE "MessageFolder" ADD CONSTRAINT "MessageFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThreadParticipant" ADD CONSTRAINT "MessageThreadParticipant_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "MessageFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
