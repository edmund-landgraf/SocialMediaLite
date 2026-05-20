-- AlterTable
ALTER TABLE "Post" ADD COLUMN "sharedToFriendsFeed" BOOLEAN NOT NULL DEFAULT false;

-- Index for friends-feed candidate queries
CREATE INDEX "Post_sharedToFriendsFeed_createdAt_idx" ON "Post"("sharedToFriendsFeed", "createdAt" DESC);
