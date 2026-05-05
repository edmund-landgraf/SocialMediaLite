import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .min(3, "Username must be at least 3 characters")
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/, "Only letters, numbers, and underscores allowed")
  .transform((u) => u.toLowerCase());

/** Stable demo portrait for stub Facebook login (no Meta token). */
export const FACEBOOK_STUB_AVATAR_URL =
  "https://api.dicebear.com/9.x/avataaars/png?seed=SocialMediaLiteFB&size=256";

export const stubLoginSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("test_user") }),
  z.object({ kind: z.literal("facebook_stub") }),
]);

export const commentTextSchema = z.string().trim().min(1).max(8000);

export const postTextSchema = z.string().trim().min(1).max(32000).optional();

export const videoUrlSchema = z.string().trim().url().max(2048).optional();

export const usernameParamSchema = z.object({
  username: usernameSchema,
});

export type StubLoginBody = z.infer<typeof stubLoginSchema>;
