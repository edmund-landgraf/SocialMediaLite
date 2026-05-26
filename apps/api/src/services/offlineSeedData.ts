import type { User } from "@prisma/client";
import {
  findStubTestUserProfileByOfflineUserId,
  getStubTestUserProfile,
  type StubTestUserKind,
} from "@socialmedialite/shared";
import { AI_FRIEND, aiFriendIntroSvg } from "./aiFriend.js";

/** @deprecated Use getStubTestUserProfile("test_user").offlineUserId */
export const OFFLINE_TEST_USER_ID = getStubTestUserProfile("test_user").offlineUserId;
/** @deprecated Use getStubTestUserProfile("test_user").username */
export const OFFLINE_TEST_USERNAME = getStubTestUserProfile("test_user").username;

export const OFFLINE_GLOWBYTE_USER_ID = "00000000-0000-4000-8000-00000000e2e2";

const epoch = new Date("2020-01-01T00:00:00.000Z");

function offlineUserRow(profile: {
  id: string;
  username: string;
  displayName: string;
}): User {
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.displayName,
    email: null,
    fbUserId: null,
    profilePicUrl: null,
    bannerImageKey: null,
    bannerPositionX: 50,
    bannerPositionY: 50,
    createdAt: epoch,
    updatedAt: epoch,
  };
}

export function offlineStubTestUserRow(kind: StubTestUserKind): User {
  const profile = getStubTestUserProfile(kind);
  return offlineUserRow({
    id: profile.offlineUserId,
    username: profile.username,
    displayName: profile.displayName,
  });
}

export function offlineStubTestUserRowById(userId: string): User | null {
  const profile = findStubTestUserProfileByOfflineUserId(userId);
  if (!profile) return null;
  return offlineUserRow({
    id: profile.offlineUserId,
    username: profile.username,
    displayName: profile.displayName,
  });
}

/** @deprecated Use offlineStubTestUserRow("test_user") */
export function offlineTestUserRow(): User {
  return offlineStubTestUserRow("test_user");
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
    bannerPositionX: 50,
    bannerPositionY: 50,
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
  "Offline seed: stub test users are friends with Glowbyte (same as DB seed). Start Postgres for full data.";
