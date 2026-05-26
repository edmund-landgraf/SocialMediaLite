import type { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  findStubTestUserProfileByOfflineUserId,
} from "@socialmedialite/shared";

export {
  OFFLINE_GLOWBYTE_USER_ID,
  OFFLINE_TEST_USER_ID,
  OFFLINE_TEST_USERNAME,
  offlineGlowbyteIntroPhotoDataUrl,
  offlineGlowbyteUserRow,
  offlineGlowbyteWallPostRows,
  offlineStubTestUserRow,
  offlineStubTestUserRowById,
  offlineTestUserRow,
} from "./offlineSeedData.js";

export function isOfflineTestUserSession(req: Request): boolean {
  if (!req.session.offlineTestUser || !req.session.userId) return false;
  return findStubTestUserProfileByOfflineUserId(req.session.userId) != null;
}

export function offlineSessionStubUsername(req: Request): string | null {
  if (!req.session.userId) return null;
  return findStubTestUserProfileByOfflineUserId(req.session.userId)?.username ?? null;
}

export function isPrismaConnectionError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P1001" || e.code === "P1003") return true;
    if ((e as { code?: string }).code === "ECONNREFUSED") return true;
  }
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  if (e instanceof Error && /ECONNREFUSED|Can't reach database server|P1001|P1003/i.test(e.message)) {
    return true;
  }
  return false;
}

export function respondOfflineWritesDisabled(res: Response): void {
  res.status(503).json({
    error:
      "Test user offline mode: Postgres is unavailable. Start the database to create posts, comments, or friend actions.",
  });
}
