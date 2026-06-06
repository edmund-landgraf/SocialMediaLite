import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiJson, formatApiError } from "@/lib/api";
import type { PublicUser } from "@/types";

type MeResp = {
  user: PublicUser;
};

export function SettingsPage() {
  const nav = useNavigate();
  const [me, setMe] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmUsername, setConfirmUsername] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiJson<MeResp>("/api/me");
      setMe(res.user);
    } catch (e) {
      setError(formatApiError(e, "Could not load account"));
      nav("/login");
    } finally {
      setLoading(false);
    }
  }, [nav]);

  useEffect(() => {
    void load();
  }, [load]);

  const usernameMatches =
    me != null && confirmUsername.trim().toLowerCase() === me.username.toLowerCase();
  const canDelete = acknowledged && usernameMatches && !busy;

  async function deleteAccount() {
    if (!me || !canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await apiJson("/api/me/account", {
        method: "DELETE",
        body: JSON.stringify({ confirmUsername: confirmUsername.trim() }),
      });
      nav("/login", { replace: true });
    } catch (e) {
      setError(formatApiError(e, "Could not delete account"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-3 p-6 text-zinc-300">
        <Loader2 className="size-5 animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-24">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold text-white">Settings</div>
          <CardDescription>Account controls for {me?.displayName ?? "your account"}.</CardDescription>
        </div>
        <div className="flex gap-2">
          {me ? (
            <Button asChild variant="secondary" size="sm">
              <Link to={`/${me.username}`}>My profile</Link>
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link to="/friends">Friends</Link>
          </Button>
        </div>
      </header>

      {error ? <div className="rounded-md bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div> : null}

      <Card className="border-red-950/50">
        <CardHeader>
          <div className="text-lg font-semibold text-red-200">Delete account</div>
          <CardDescription>
            Permanently removes your account and everything you own on SocialMediaLite. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-red-900/60 bg-red-950/20 px-3 py-3 text-sm leading-relaxed text-red-100/90">
            <p className="font-semibold text-red-100">Warning — the following will be deleted:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-red-100/85">
              <li>Your profile, banner, and login access</li>
              <li>Every post on your wall and every post you authored</li>
              <li>Reactions, friendships, messages, and message folders</li>
              <li>Feedback you submitted</li>
              <li>Public syndication links for your posts</li>
            </ul>
            <p className="mt-3 text-red-100/85">
              Comments you left on other people&apos;s posts will stay in place as{" "}
              <span className="font-mono text-xs">(deleted user - deleted comment)</span> so replies underneath
              still make sense.
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-300">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-zinc-600 bg-zinc-900"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>I understand this is permanent and cannot be reversed.</span>
          </label>

          <div className="space-y-2">
            <label className="block text-sm text-zinc-400" htmlFor="confirm-username">
              Type your username <span className="font-semibold text-zinc-200">{me?.username}</span> to confirm
            </label>
            <Input
              id="confirm-username"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              placeholder={me?.username ?? "username"}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <Button variant="destructive" disabled={!canDelete} onClick={() => void deleteAccount()}>
            {busy ? "Deleting account…" : "Delete my account permanently"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
