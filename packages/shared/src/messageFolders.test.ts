import { describe, expect, it } from "vitest";
import {
  assignThreadFolderSchema,
  createMessageFolderSchema,
  isTrashRetentionExpired,
  MESSAGE_CUSTOM_FOLDERS_MAX,
  MESSAGE_FOLDER_NAME_MAX_LENGTH,
  MESSAGE_TRASH_RETENTION_DAYS,
} from "./messageFolders.js";

describe("createMessageFolderSchema", () => {
  it("accepts valid names", () => {
    expect(createMessageFolderSchema.safeParse({ name: "Trip to Mexico" }).success).toBe(true);
  });

  it("rejects empty names", () => {
    expect(createMessageFolderSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects names over max length", () => {
    const long = "a".repeat(MESSAGE_FOLDER_NAME_MAX_LENGTH + 1);
    expect(createMessageFolderSchema.safeParse({ name: long }).success).toBe(false);
  });
});

describe("assignThreadFolderSchema", () => {
  it("accepts null folderId", () => {
    expect(assignThreadFolderSchema.safeParse({ folderId: null }).success).toBe(true);
  });

  it("accepts uuid folderId", () => {
    expect(
      assignThreadFolderSchema.safeParse({ folderId: "550e8400-e29b-41d4-a716-446655440000" }).success,
    ).toBe(true);
  });
});

describe("MESSAGE_CUSTOM_FOLDERS_MAX", () => {
  it("is a positive limit", () => {
    expect(MESSAGE_CUSTOM_FOLDERS_MAX).toBeGreaterThan(0);
  });
});

describe("isTrashRetentionExpired", () => {
  it("returns false before retention window elapses", () => {
    const trashedAt = new Date("2026-06-01T12:00:00Z");
    const now = new Date("2026-06-15T12:00:00Z");
    expect(isTrashRetentionExpired(trashedAt, now)).toBe(false);
  });

  it("returns true after 30 days", () => {
    const trashedAt = new Date("2026-05-01T12:00:00Z");
    const now = new Date("2026-06-05T12:00:00Z");
    expect(isTrashRetentionExpired(trashedAt, now)).toBe(true);
  });

  it("uses a 30-day retention constant", () => {
    expect(MESSAGE_TRASH_RETENTION_DAYS).toBe(30);
  });
});
