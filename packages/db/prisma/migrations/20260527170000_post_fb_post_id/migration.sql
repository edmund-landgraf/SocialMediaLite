ALTER TABLE "Post" ADD COLUMN "fbPostId" TEXT;

CREATE UNIQUE INDEX "Post_fbPostId_key" ON "Post"("fbPostId");
