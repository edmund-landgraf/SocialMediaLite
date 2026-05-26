import { z } from "zod";
import { STUB_TEST_USER_KINDS, type StubTestUserKind } from "./stubTestUsers.js";

export {
  STUB_TEST_USERS,
  STUB_TEST_USER_KINDS,
  STUB_TEST_USER_LOGIN_OPTIONS,
  findStubTestUserProfileByOfflineUserId,
  findStubTestUserProfileByUsername,
  getStubTestUserProfile,
  isStubTestUserKind,
  type StubTestUserKind,
  type StubTestUserProfile,
} from "./stubTestUsers.js";

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
  z.object({ kind: z.literal("test_user_2") }),
  z.object({ kind: z.literal("facebook_stub") }),
]);

export const commentTextSchema = z.string().trim().min(1).max(8000);

export const postTextSchema = z.string().trim().min(1).max(32000).optional();

export const TEXT_POST_FONT_SIZE_MIN = 12;
export const TEXT_POST_FONT_SIZE_MAX = 32;
export const TEXT_POST_FONT_SIZE_DEFAULT = 16;
export const TEXT_POST_BG_DEFAULT = "#18181b";
export const TEXT_POST_COLOR_DEFAULT = "#e4e4e7";

export const textPostHexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex value");

export const textPostFontSizeSchema = z
  .number()
  .int()
  .min(TEXT_POST_FONT_SIZE_MIN)
  .max(TEXT_POST_FONT_SIZE_MAX);

export const videoUrlSchema = z.string().trim().url().max(2048).optional();

export const usernameParamSchema = z.object({
  username: usernameSchema,
});

export type StubLoginBody = z.infer<typeof stubLoginSchema>;

export {
  POST_REACTIONS,
  POST_REACTION_KINDS,
  getPostReaction,
  isPostReactionKind,
  postReactionKindSchema,
  postReactionDetailsSchema,
  reactionCollectsDetails,
  POST_REACTIONS_WITH_DETAILS,
  type PostReactionCount,
  type PostReactionDef,
  type PostReactionKind,
} from "./postReactions.js";

export {
  feedbackTitleSchema,
  feedbackBodySchema,
  feedbackCommentTextSchema,
  feedbackCaptchaAnswerSchema,
} from "./feedback.js";
