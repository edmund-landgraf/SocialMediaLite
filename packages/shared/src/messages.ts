import { z } from "zod";

const recipientUsernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed")
  .transform((u) => u.toLowerCase());

export const MESSAGE_SUBJECT_MAX_LENGTH = 200;
export const MESSAGE_BODY_MAX_LENGTH = 2000;

export const messageSubjectSchema = z
  .string()
  .trim()
  .min(1, "Subject is required")
  .max(MESSAGE_SUBJECT_MAX_LENGTH);

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Message is required")
  .max(MESSAGE_BODY_MAX_LENGTH);

export const createMessageThreadSchema = z.object({
  recipientUsername: recipientUsernameSchema,
  subject: messageSubjectSchema,
  text: messageBodySchema,
});

export const replyMessageSchema = z.object({
  text: messageBodySchema,
});

export const editMessageSchema = z.object({
  text: messageBodySchema,
});

export const recipientSearchModeSchema = z.enum(["name", "email"]);

export type RecipientSearchMode = z.infer<typeof recipientSearchModeSchema>;
