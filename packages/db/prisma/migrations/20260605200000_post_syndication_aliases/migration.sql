-- AlterTable
ALTER TABLE "PostSyndication" ADD COLUMN "randomizeNames" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PostSyndicationAlias" (
    "id" TEXT NOT NULL,
    "syndicationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostSyndicationAlias_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostSyndicationAlias_syndicationId_userId_key" ON "PostSyndicationAlias"("syndicationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PostSyndicationAlias_syndicationId_alias_key" ON "PostSyndicationAlias"("syndicationId", "alias");

-- CreateIndex
CREATE INDEX "PostSyndicationAlias_syndicationId_idx" ON "PostSyndicationAlias"("syndicationId");

-- AddForeignKey
ALTER TABLE "PostSyndicationAlias" ADD CONSTRAINT "PostSyndicationAlias_syndicationId_fkey" FOREIGN KEY ("syndicationId") REFERENCES "PostSyndication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
