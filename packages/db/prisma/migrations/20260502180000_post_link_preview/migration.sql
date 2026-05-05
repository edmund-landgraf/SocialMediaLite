-- Link preview metadata + cached thumbnail for VIDEO_LINK posts (any HTTP(S) URL)
ALTER TABLE "Post" ADD COLUMN "linkTitle" TEXT;
ALTER TABLE "Post" ADD COLUMN "linkDescription" TEXT;
ALTER TABLE "Post" ADD COLUMN "linkPreviewImageKey" TEXT;
