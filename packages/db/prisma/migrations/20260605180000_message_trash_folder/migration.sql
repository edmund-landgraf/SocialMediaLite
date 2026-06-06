-- AlterEnum
ALTER TYPE "MessageFolderKind" ADD VALUE 'TRASH';

-- AlterTable
ALTER TABLE "MessageThreadParticipant" ADD COLUMN "trashedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "MessageThreadParticipant_userId_trashedAt_idx" ON "MessageThreadParticipant"("userId", "trashedAt");
