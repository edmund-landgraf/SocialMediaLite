import { afterEach, describe, expect, it, vi } from "vitest";
import { probeFacebookImportAccessToken } from "./facebookAccessToken.js";

describe("probeFacebookImportAccessToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok when Graph accepts me/posts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    await expect(probeFacebookImportAccessToken("token")).resolves.toEqual({ ok: true });
  });

  it("returns expired for OAuth error 190", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Invalid token", code: 190 } }), {
          status: 400,
        }),
      ),
    );
    const result = await probeFacebookImportAccessToken("bad");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.expired).toBe(true);
    }
  });
});
