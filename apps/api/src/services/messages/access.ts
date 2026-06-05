import { prisma } from "../../lib/prisma.js";

export function sortParticipantPair(userAId: string, userBId: string): [string, string] {
  return userAId < userBId ? [userAId, userBId] : [userBId, userAId];
}

export async function areFriendsAccepted(userAId: string, userBId: string): Promise<boolean> {
  if (userAId === userBId) return false;
  const row = await prisma.friendship.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: userAId, addresseeId: userBId },
        { requesterId: userBId, addresseeId: userAId },
      ],
    },
  });
  return row != null;
}

export async function listAcceptedFriendUsers(viewerId: string) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ requesterId: viewerId }, { addresseeId: viewerId }],
    },
    include: { requester: true, addressee: true },
  });
  return rows.map((r) => (r.requesterId === viewerId ? r.addressee : r.requester));
}

export function messagePreviewText(text: string, deletedAt: Date | null): string {
  if (deletedAt) return "Message removed";
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 120) return oneLine;
  return `${oneLine.slice(0, 117)}…`;
}

export function canModifyMessage(
  viewerId: string,
  threadOwnerId: string,
  messageAuthorId: string,
): boolean {
  return viewerId === threadOwnerId || viewerId === messageAuthorId;
}
