import {
  getStubTestUserProfile,
  type StubTestUserKind,
} from "@socialmedialite/shared";
import { prisma } from "../lib/prisma.js";
import { ensureAiFriendshipForUser } from "./aiFriend.js";

/** Upsert a Phase 1 stub test user and ensure Glowbyte friendship (same as test user 1). */
export async function loginStubTestUser(kind: StubTestUserKind) {
  const profile = getStubTestUserProfile(kind);
  const user = await prisma.user.upsert({
    where: { username: profile.username },
    create: {
      displayName: profile.displayName,
      username: profile.username,
      email: null,
      fbUserId: null,
      profilePicUrl: null,
    },
    update: {
      displayName: profile.displayName,
      email: null,
      fbUserId: null,
      profilePicUrl: null,
    },
  });

  await ensureAiFriendshipForUser(user.id);
  return user;
}
