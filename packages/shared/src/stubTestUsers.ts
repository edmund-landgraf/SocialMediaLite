export type StubTestUserKind = "test_user" | "test_user_2";

export type StubTestUserProfile = {
  kind: StubTestUserKind;
  username: string;
  displayName: string;
  /** Stable UUID used when Postgres is unavailable (offline stub session). */
  offlineUserId: string;
};

export const STUB_TEST_USERS: Record<StubTestUserKind, StubTestUserProfile> = {
  test_user: {
    kind: "test_user",
    username: "testuser",
    displayName: "Test User",
    offlineUserId: "00000000-0000-4000-8000-00000000e1e1",
  },
  test_user_2: {
    kind: "test_user_2",
    username: "testuser2",
    displayName: "Test User 2",
    offlineUserId: "00000000-0000-4000-8000-00000000e1e3",
  },
};

export const STUB_TEST_USER_KINDS = Object.keys(STUB_TEST_USERS) as StubTestUserKind[];

export function getStubTestUserProfile(kind: StubTestUserKind): StubTestUserProfile {
  return STUB_TEST_USERS[kind];
}

export function isStubTestUserKind(kind: string): kind is StubTestUserKind {
  return kind in STUB_TEST_USERS;
}

export function findStubTestUserProfileByUsername(username: string): StubTestUserProfile | null {
  const normalized = username.trim().toLowerCase();
  for (const profile of Object.values(STUB_TEST_USERS)) {
    if (profile.username === normalized) return profile;
  }
  return null;
}

export function findStubTestUserProfileByOfflineUserId(userId: string): StubTestUserProfile | null {
  for (const profile of Object.values(STUB_TEST_USERS)) {
    if (profile.offlineUserId === userId) return profile;
  }
  return null;
}

export const STUB_TEST_USER_LOGIN_OPTIONS: ReadonlyArray<{
  kind: StubTestUserKind;
  label: string;
}> = [
  { kind: "test_user", label: "Login with test user" },
  { kind: "test_user_2", label: "Login with test user 2" },
];
