import { prisma } from "../lib/prisma.js";
import { createStorageProviderFromEnv } from "../storage/index.js";

export const AI_FRIEND = {
  username: "glowbyte",
  displayName: "Glowbyte",
  welcomeMessage:
    "Hey friend, I'm Glowbyte. I am your built-in AI buddy on SocialMediaLite. Drop a post, share a photo, and let's make your page shine.",
};

function sunsetSvg(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a2a7a"/>
      <stop offset="45%" stop-color="#ff7a59"/>
      <stop offset="75%" stop-color="#ffb347"/>
      <stop offset="100%" stop-color="#1e3d59"/>
    </linearGradient>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#294c60"/>
      <stop offset="100%" stop-color="#0f2130"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)" />
  <circle cx="800" cy="470" r="110" fill="#ffd27f" opacity="0.95"/>
  <rect y="560" width="1600" height="340" fill="url(#water)" />
  <ellipse cx="800" cy="625" rx="250" ry="35" fill="#ffd27f" opacity="0.35"/>
  <path d="M0,700 C260,660 390,760 640,710 C920,650 1120,760 1600,700 L1600,900 L0,900 Z" fill="#122433" opacity="0.8"/>
</svg>`;
}

export async function ensureAiFriendSeed() {
  const aiUser = await prisma.user.upsert({
    where: { username: AI_FRIEND.username },
    create: {
      username: AI_FRIEND.username,
      displayName: AI_FRIEND.displayName,
      fbUserId: null,
      profilePicUrl: null,
    },
    update: {
      displayName: AI_FRIEND.displayName,
    },
  });

  const existingWelcome = await prisma.post.findFirst({
    where: {
      authorId: aiUser.id,
      profileOwnerId: aiUser.id,
      type: "PHOTO",
      text: AI_FRIEND.welcomeMessage,
    },
  });

  if (existingWelcome) {
    return aiUser;
  }

  const storage = createStorageProviderFromEnv();
  const photoKey = `users/${aiUser.id}/intro-sunset.svg`;
  await storage.putObject({
    key: photoKey,
    contentType: "image/svg+xml",
    buffer: Buffer.from(sunsetSvg(), "utf-8"),
  });

  await prisma.post.create({
    data: {
      authorId: aiUser.id,
      profileOwnerId: aiUser.id,
      type: "PHOTO",
      text: AI_FRIEND.welcomeMessage,
      photoKey,
    },
  });

  return aiUser;
}

export async function ensureAiFriendshipForUser(userId: string): Promise<void> {
  const aiUser = await ensureAiFriendSeed();
  if (aiUser.id === userId) return;

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: aiUser.id, addresseeId: userId },
        { requesterId: userId, addresseeId: aiUser.id },
      ],
    },
  });

  if (!existing) {
    await prisma.friendship.create({
      data: {
        requesterId: aiUser.id,
        addresseeId: userId,
        status: "ACCEPTED",
      },
    });
    return;
  }

  if (existing.status !== "ACCEPTED") {
    await prisma.friendship.update({
      where: { id: existing.id },
      data: { status: "ACCEPTED" },
    });
  }
}

