-- CreateTable
CREATE TABLE "BlogEntry" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3) NOT NULL,
    "sha" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogEntry_slug_key" ON "BlogEntry"("slug");

CREATE UNIQUE INDEX "BlogEntry_sha_key" ON "BlogEntry"("sha");

CREATE INDEX "BlogEntry_committedAt_idx" ON "BlogEntry"("committedAt" DESC);
