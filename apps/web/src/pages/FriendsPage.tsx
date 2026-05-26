import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { apiFetch, apiJson } from "@/lib/api";
import type { PublicUser } from "@/types";

type FriendshipStatus = "self" | "none" | "pending_out" | "pending_in" | "accepted" | "blocked";

type BrowseResp = {
  users: Array<{ user: PublicUser; friendshipStatus: FriendshipStatus }>;
  note: string;
};

type RequestsResp = {
  made: PublicUser[];
  received: PublicUser[];
};

type MeResp = {
  user: PublicUser;
};

function TinyAvatar(props: { user: PublicUser }) {
  return (
    <div className="size-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-blue-900/65 to-purple-950/65 ring-1 ring-zinc-800">
      {props.user.profilePicUrl ? (
        <img src={props.user.profilePicUrl} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <div className="flex size-full items-center justify-center bg-zinc-900/55 text-[10px] font-bold text-white/90">
          FB
        </div>
      )}
    </div>
  );
}

export function FriendsPage() {
  const nav = useNavigate();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [browse, setBrowse] = useState<BrowseResp | null>(null);
  const [requests, setRequests] = useState<RequestsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUser, setBusyUser] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meResp, browseResp, requestsResp] = await Promise.all([
        apiJson<MeResp>("/api/me"),
        apiJson<BrowseResp>("/api/friends/browse"),
        apiJson<RequestsResp>("/api/friends/requests"),
      ]);
      setMe(meResp.user);
      setBrowse(browseResp);
      setRequests(requestsResp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed loading friends");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function postFriendAction(path: string, username: string) {
    setBusyUser(username);
    setError(null);
    try {
      await apiJson(path, {
        method: "POST",
        body: JSON.stringify({ username }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Friend action failed");
    } finally {
      setBusyUser(null);
    }
  }

  async function removeFriend(username: string, displayName: string) {
    if (!confirm(`Remove ${displayName} as a friend?`)) return;
    await postFriendAction("/api/friends/remove", username);
  }

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    nav("/login");
  }

  function actionFor(row: { user: PublicUser; friendshipStatus: FriendshipStatus }) {
    const disabled = busyUser === row.user.username;
    if (row.friendshipStatus === "none") {
      return (
        <Button size="sm" disabled={disabled} onClick={() => void postFriendAction("/api/friends/request", row.user.username)}>
          Add friend
        </Button>
      );
    }
    if (row.friendshipStatus === "pending_out") {
      return (
        <Button size="sm" variant="secondary" disabled>
          Request sent
        </Button>
      );
    }
    if (row.friendshipStatus === "pending_in") {
      return (
        <div className="flex gap-2">
          <Button size="sm" disabled={disabled} onClick={() => void postFriendAction("/api/friends/accept", row.user.username)}>
            Accept
          </Button>
          <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void postFriendAction("/api/friends/reject", row.user.username)}>
            Reject
          </Button>
        </div>
      );
    }
    if (row.friendshipStatus === "accepted") {
      return (
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void removeFriend(row.user.username, row.user.displayName)}>
          Defriend
        </Button>
      );
    }
    return (
      <Button size="sm" variant="secondary" disabled>
        Unavailable
      </Button>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-5xl items-center gap-3 p-6 text-zinc-300">
        <Loader2 className="size-5 animate-spin" />
        Loading friends…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-white">Friends</div>
          <div className="text-xs text-zinc-500">Browse Users is simple for test users; search can replace it later.</div>
        </div>
        <div className="flex gap-2">
          {me ? (
            <>
              <Button asChild variant="secondary" size="sm">
                <Link to={`/${me.username}`}>My profile</Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void logout()}>
                Logout
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => nav("/login")}>
              Login
            </Button>
          )}
        </div>
      </header>

      {error ? <div className="rounded-md bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader className="space-y-1">
            <div className="text-base font-semibold text-white">Browse Users</div>
            <CardDescription>{browse?.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(browse?.users ?? []).length === 0 ? (
              <div className="text-sm text-zinc-400">No other users yet.</div>
            ) : (
              (browse?.users ?? []).map((row) => (
                <div
                  key={row.user.username}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-900 bg-zinc-950/70 px-3 py-2"
                >
                  <Link to={`/${row.user.username}`} className="flex min-w-0 items-center gap-3 text-zinc-100 hover:text-white">
                    <TinyAvatar user={row.user} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{row.user.displayName}</span>
                      <span className="block truncate text-xs text-zinc-500">@{row.user.username}</span>
                    </span>
                  </Link>
                  {actionFor(row)}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card>
            <CardHeader className="space-y-1">
              <div className="text-base font-semibold text-white">Friend Requests Received</div>
            </CardHeader>
            <CardContent className="space-y-2">
              {(requests?.received ?? []).length === 0 ? (
                <div className="text-sm text-zinc-400">No received requests.</div>
              ) : (
                (requests?.received ?? []).map((u) => (
                  <div key={u.username} className="rounded-lg border border-zinc-900 bg-zinc-950/70 p-3">
                    <div className="mb-2 flex items-center gap-3">
                      <TinyAvatar user={u} />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-100">{u.displayName}</div>
                        <div className="truncate text-xs text-zinc-500">@{u.username}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busyUser === u.username} onClick={() => void postFriendAction("/api/friends/accept", u.username)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyUser === u.username} onClick={() => void postFriendAction("/api/friends/reject", u.username)}>
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-1">
              <div className="text-base font-semibold text-white">Friend Requests Made</div>
            </CardHeader>
            <CardContent className="space-y-2">
              {(requests?.made ?? []).length === 0 ? (
                <div className="text-sm text-zinc-400">No outgoing requests.</div>
              ) : (
                (requests?.made ?? []).map((u) => (
                  <Link
                    key={u.username}
                    to={`/${u.username}`}
                    className="flex items-center gap-3 rounded-lg border border-zinc-900 bg-zinc-950/70 p-3 hover:bg-zinc-950"
                  >
                    <TinyAvatar user={u} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-100">{u.displayName}</span>
                      <span className="block truncate text-xs text-zinc-500">@{u.username} · request sent</span>
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
