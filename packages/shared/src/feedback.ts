import { z } from "zod";

export const feedbackTitleSchema = z.string().trim().min(1, "Title is required").max(200);
export const feedbackBodySchema = z.string().trim().min(1).max(8000);
export const feedbackCommentTextSchema = feedbackBodySchema;
export const feedbackCaptchaAnswerSchema = z.coerce.number().int();
