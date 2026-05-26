-- Apply any columns/indexes missing from migrations when DB predates _prisma_migrations tracking.
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "linkTitle" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "linkDescription" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "linkPreviewImageKey" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "photoCaption" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "sharedToFriendsFeed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Comment" ADD COLUMN IF NOT EXISTS "parentId" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "textBackgroundColor" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "textColor" TEXT;
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "textFontSize" INTEGER;

CREATE INDEX IF NOT EXISTS "Post_sharedToFriendsFeed_createdAt_idx"
  ON "Post"("sharedToFriendsFeed", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Comment_parentId_idx" ON "Comment"("parentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Comment_parentId_fkey'
  ) THEN
    ALTER TABLE "Comment"
      ADD CONSTRAINT "Comment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Comment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
