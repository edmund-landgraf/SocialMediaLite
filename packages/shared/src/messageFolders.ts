import { z } from "zod";

export const MESSAGE_FOLDER_NAME_MAX_LENGTH = 64;
export const MESSAGE_CUSTOM_FOLDERS_MAX = 50;
export const MESSAGE_TRASH_RETENTION_DAYS = 30;
export const MESSAGE_TRASH_RETENTION_MS = MESSAGE_TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const messageFolderNameSchema = z
  .string()
  .trim()
  .min(1, "Folder name is required")
  .max(MESSAGE_FOLDER_NAME_MAX_LENGTH);

export const createMessageFolderSchema = z.object({
  name: messageFolderNameSchema,
});

export const assignThreadFolderSchema = z.object({
  folderId: z.string().uuid().nullable(),
});

export type MessageFolderKind = "CUSTOM" | "SAVED" | "ARCHIVED" | "TRASH";

/** True when a trashed thread is past retention and should be permanently removed for the viewer. */
export function isTrashRetentionExpired(trashedAt: Date, now = new Date()): boolean {
  return now.getTime() - trashedAt.getTime() >= MESSAGE_TRASH_RETENTION_MS;
}

export type MessageFolderDto = {
  id: string;
  name: string;
  kind: MessageFolderKind;
  sortOrder: number;
  threadCount: number;
};
