import { describe, expect, it } from "vitest";
import { writeVideoPlayerLog } from "./videoPlayerLog.js";

describe("writeVideoPlayerLog", () => {
  it("does not throw when logging an event", async () => {
    await expect(
      writeVideoPlayerLog({
        source: "test",
        kind: "player.error",
        message: "sample",
      }),
    ).resolves.toBeUndefined();
  });
});
