import { prisma } from "../lib/prisma.js";

export async function areAcceptedFriends(aId: string, bId: string): Promise<boolean> {
  if (aId === bId) return true;
  const row = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: aId, addresseeId: bId },
        { requesterId: bId, addresseeId: aId },
      ],
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function assertCanAccessProfile(
  viewerId: string,
  profileOwnerId: string,
): Promise<void> {
  const ok = await areAcceptedFriends(viewerId, profileOwnerId);
  if (!ok) {
    const err = new Error("FORBIDDEN_PROFILE");
    throw err;
  }
}
