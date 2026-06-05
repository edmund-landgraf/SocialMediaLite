/**
 * Go Live — real-time IM session stubs.
 * See docs/plan/go-live-im.plan.md for full design.
 */

import { areFriendsAccepted } from "./access.js";

/** Presence TTL — implement heartbeat + store in phase 2. */
export const LIVE_PRESENCE_ONLINE_WINDOW_MS = 60_000;

export class LiveChatNotImplementedError extends Error {
  constructor(feature: string) {
    super(`Go live: ${feature} is not implemented yet`);
    this.name = "LiveChatNotImplementedError";
  }
}

export type PresenceSnapshot = {
  online: boolean;
  lastSeenAt: Date | null;
};

/** Stub: always offline until heartbeat + presence store exist. */
export async function getPresenceForUser(_userId: string): Promise<PresenceSnapshot> {
  return { online: false, lastSeenAt: null };
}

export async function recordPresenceHeartbeat(_userId: string): Promise<void> {
  throw new LiveChatNotImplementedError("presence heartbeat");
}

export async function canGoLiveWithFriend(viewerId: string, friendUserId: string): Promise<boolean> {
  if (!(await areFriendsAccepted(viewerId, friendUserId))) return false;
  const [viewer, friend] = await Promise.all([
    getPresenceForUser(viewerId),
    getPresenceForUser(friendUserId),
  ]);
  return viewer.online && friend.online;
}

export async function startLiveSession(
  _viewerId: string,
  _friendUserId: string,
  _threadId?: string,
): Promise<{ sessionId: string; wsUrl: string | null }> {
  throw new LiveChatNotImplementedError("start session");
}

export async function archiveLiveSession(
  _sessionId: string,
  _viewerId: string,
  _lines: Array<{ authorId: string; text: string; createdAt: Date }>,
): Promise<{ threadId: string; messagesAppended: number }> {
  throw new LiveChatNotImplementedError("archive session");
}
