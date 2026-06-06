import { describe, expect, it } from "vitest";
import { DELETED_COMMENT_TEXT, DELETED_USER_DISPLAY_NAME } from "./deletedUser.js";

describe("deleted user labels", () => {
  it("uses stable tombstone copy", () => {
    expect(DELETED_USER_DISPLAY_NAME).toBe("(deleted user)");
    expect(DELETED_COMMENT_TEXT).toBe("(deleted user - deleted comment)");
  });
});
