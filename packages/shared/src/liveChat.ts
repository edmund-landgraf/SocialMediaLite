import { z } from "zod";

const liveRecipientUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/)
  .transform((u) => u.toLowerCase());

export const liveChatPresenceParamsSchema = z.object({
  username: liveRecipientUsernameSchema,
});

export const startLiveChatSessionSchema = z.object({
  recipientUsername: liveRecipientUsernameSchema,
  /** When started from an expanded thread, archive merges here when possible. */
  threadId: z.string().uuid().optional(),
});

export const liveChatLineSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export type LiveChatPresenceResponse = {
  username: string;
  online: boolean;
  lastSeenAt: string | null;
  /** True when viewer + friend are both online and accepted friends. */
  canGoLive: boolean;
};

export type LiveChatSessionStartResponse = {
  sessionId: string;
  /** WebSocket URL when transport is implemented. */
  wsUrl: string | null;
};

export type LiveChatArchiveLine = {
  authorId: string;
  text: string;
  createdAt: string;
};

export type LiveChatSessionEndResponse = {
  threadId: string;
  messagesAppended: number;
};
