export const FACEBOOK_STUB_FB_USER_ID = "stub-facebook-001";

/** True when the user authenticated via real Facebook OAuth (not stub login). */
export function isRealFacebookUser(fbUserId: string | null | undefined): boolean {
  if (!fbUserId) return false;
  if (fbUserId === FACEBOOK_STUB_FB_USER_ID) return false;
  if (fbUserId.startsWith("stub-")) return false;
  return true;
}
