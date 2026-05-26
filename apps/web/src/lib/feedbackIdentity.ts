const STORAGE_KEY = "sml.feedbackIdentity";
const PENDING_FB_KEY = "sml.feedbackPendingFacebook";

export type FeedbackIdentity =
  | { mode: "anonymous" }
  | { mode: "authenticated"; userId: string; displayName: string; username: string };

export function getFeedbackIdentity(): FeedbackIdentity | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedbackIdentity;
    if (parsed.mode === "anonymous") return { mode: "anonymous" };
    if (
      parsed.mode === "authenticated" &&
      typeof parsed.userId === "string" &&
      typeof parsed.displayName === "string" &&
      typeof parsed.username === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setFeedbackIdentity(identity: FeedbackIdentity): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function clearFeedbackIdentity(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function markFeedbackFacebookPending(): void {
  sessionStorage.setItem(PENDING_FB_KEY, "1");
}

export function consumeFeedbackFacebookPending(): boolean {
  const pending = sessionStorage.getItem(PENDING_FB_KEY) === "1";
  sessionStorage.removeItem(PENDING_FB_KEY);
  return pending;
}

export function feedbackIdentityLabel(identity: FeedbackIdentity): string {
  if (identity.mode === "anonymous") return "Anonymous";
  return identity.displayName;
}
