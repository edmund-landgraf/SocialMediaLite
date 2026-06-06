-- CreateTable
CREATE TABLE "PostSyndication" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostSyndication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostSyndication_token_key" ON "PostSyndication"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PostSyndication_postId_key" ON "PostSyndication"("postId");

-- CreateIndex
CREATE INDEX "PostSyndication_createdByUserId_idx" ON "PostSyndication"("createdByUserId");

-- AddForeignKey
ALTER TABLE "PostSyndication" ADD CONSTRAINT "PostSyndication_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
