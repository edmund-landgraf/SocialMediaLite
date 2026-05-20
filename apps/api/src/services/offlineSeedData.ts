import type { User } from "@prisma/client";
import { AI_FRIEND, aiFriendIntroSvg } from "./aiFriend.js";

/** Stable ids so offline mode matches the same logical users as DB seed (testuser + Glowbyte). */
export const OFFLINE_TEST_USER_ID = "00000000-0000-4000-8000-00000000e1e1";
export const OFFLINE_TEST_USERNAME = "testuser";

export const OFFLINE_GLOWBYTE_USER_ID = "00000000-0000-4000-8000-00000000e2e2";

const epoch = new Date("2020-01-01T00:00:00.000Z");

export function offlineTestUserRow(): User {
  return {
    id: OFFLINE_TEST_USER_ID,
    username: OFFLINE_TEST_USERNAME,
    displayName: "Test User",
    email: null,
    fbUserId: null,
    profilePicUrl: null,
    bannerImageKey: null,
    createdAt: epoch,
    updatedAt: epoch,
  };
}

export function offlineGlowbyteUserRow(): User {
  return {
    id: OFFLINE_GLOWBYTE_USER_ID,
    username: AI_FRIEND.username,
    displayName: AI_FRIEND.displayName,
    email: null,
    fbUserId: null,
    profilePicUrl: null,
    bannerImageKey: null,
    createdAt: epoch,
    updatedAt: epoch,
  };
}

/** Same key pattern as `ensureAiFriendSeed` (storage may be empty offline; API patches `photoUrl`). */
export function offlineGlowbyteIntroPhotoKey(): string {
  return `users/${OFFLINE_GLOWBYTE_USER_ID}/intro-sunset.svg`;
}

export function offlineGlowbyteIntroPhotoDataUrl(): string {
  const svg = aiFriendIntroSvg();
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf-8").toString("base64")}`;
}

export const OFFLINE_GLOWBYTE_INTRO_POST_ID = "00000000-0000-4000-8000-00000000de01";

/** Glowbyte wall: one PHOTO intro post (aligned with `ensureAiFriendSeed`). */
export function offlineGlowbyteWallPostRows() {
  const gb = offlineGlowbyteUserRow();
  return [
    {
      id: OFFLINE_GLOWBYTE_INTRO_POST_ID,
      authorId: gb.id,
      profileOwnerId: gb.id,
      type: "PHOTO" as const,
      text: AI_FRIEND.welcomeMessage,
      photoKey: offlineGlowbyteIntroPhotoKey(),
      photoCaption: null,
      videoUrl: null,
      linkTitle: null,
      linkDescription: null,
      linkPreviewImageKey: null,
      isPinned: false,
      sharedToFriendsFeed: true,
      createdAt: epoch,
      updatedAt: epoch,
      author: {
        id: gb.id,
        username: gb.username,
        displayName: gb.displayName,
        profilePicUrl: gb.profilePicUrl,
      },
      _count: { comments: 0 },
    },
  ];
}

export const OFFLINE_SEED_BROWSE_NOTE =
  "Offline seed: Test User is friends with Glowbyte (same as DB seed). Start Postgres for full data.";
