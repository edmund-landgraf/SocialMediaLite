-- CreateEnum
CREATE TYPE "FriendsFeedReviewStatus" AS ENUM ('READ', 'SAVED', 'DISCARDED');

-- CreateTable
CREATE TABLE "FriendsFeedReview" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "status" "FriendsFeedReviewStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FriendsFeedReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FriendsFeedReview_viewerId_postId_key" ON "FriendsFeedReview"("viewerId", "postId");

-- CreateIndex
CREATE INDEX "FriendsFeedReview_viewerId_status_updatedAt_idx" ON "FriendsFeedReview"("viewerId", "status", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "FriendsFeedReview" ADD CONSTRAINT "FriendsFeedReview_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FriendsFeedReview" ADD CONSTRAINT "FriendsFeedReview_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
