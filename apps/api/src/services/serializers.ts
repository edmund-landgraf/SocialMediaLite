import type { User } from "@prisma/client";

export type PublicUser = Pick<
  User,
  | "id"
  | "username"
  | "displayName"
  | "email"
  | "profilePicUrl"
  | "bannerImageKey"
  | "bannerPositionX"
  | "bannerPositionY"
  | "createdAt"
>;

export function serializeUser(u: User): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    profilePicUrl: u.profilePicUrl,
    bannerImageKey: u.bannerImageKey,
    bannerPositionX: u.bannerPositionX,
    bannerPositionY: u.bannerPositionY,
    createdAt: u.createdAt,
  };
}
