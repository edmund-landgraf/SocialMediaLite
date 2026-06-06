import { z } from "zod";

export const DELETED_USER_DISPLAY_NAME = "(deleted user)";
export const DELETED_COMMENT_TEXT = "(deleted user - deleted comment)";

export const deleteAccountSchema = z.object({
  confirmUsername: z.string().trim().min(1),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
