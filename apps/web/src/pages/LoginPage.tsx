import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { clearFeedbackIdentity } from "@/lib/feedbackIdentity";
import { apiJson, apiUrl } from "@/lib/api";
import {
  getStubTestUserProfile,
  STUB_TEST_USER_LOGIN_OPTIONS,
  type StubTestUserKind,
} from "@socialmedialite/shared";

type ActiveLoginKind = StubTestUserKind | "facebook" | null;

function loginErrorFromSearchParams(params: URLSearchParams): string | null {
  const reason = params.get("reason")?.trim();
  if (reason) return reason;

  const code = params.get("error");
  if (code === "fb_not_configured") {
    return "Facebook Login is not configured on the server (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).";
  }
  if (code === "fb_state_or_code") {
    return "Facebook login was cancelled or the OAuth callback could not verify session state.";
  }
  if (code === "fb_login_failed") {
    return "Facebook login failed with no additional detail from the server.";
  }
  return null;
}

export function LoginPage() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [activeKind, setActiveKind] = useState<ActiveLoginKind>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const message = loginErrorFromSearchParams(params);
    if (message) setError(message);
    params.delete("error");
    params.delete("reason");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `/login?${next}` : "/login");
  }, []);

  async function stubLogin(kind: StubTestUserKind) {
    const { user } = await apiJson<{ user: { username: string } }>("/api/auth/stub-login", {
      method: "POST",
      body: JSON.stringify({ kind }),
    });
    nav(`/${encodeURIComponent(user.username)}`);
  }

  async function submit(kind: StubTestUserKind) {
    setBusy(true);
    setActiveKind(kind);
    setError(null);
    try {
      await stubLogin(kind);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
      setActiveKind(null);
    }
  }

  function startFacebookLogin() {
    setBusy(true);
    setActiveKind("facebook");
    setError(null);
    window.location.href = apiUrl("/api/auth/facebook/start");
  }

  function openFeedback() {
    clearFeedbackIdentity();
    nav("/feedback", { state: { requireIdentityPick: true } });
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">SocialMediaLite</CardTitle>
            <CardDescription>Phase 1: choose a stub login flow</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button
                type="button"
                variant="default"
                className="w-full gap-3"
                disabled={busy}
                onClick={startFacebookLogin}
              >
                {busy && activeKind === "facebook" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>Login with Facebook</>
                )}
              </Button>
              {STUB_TEST_USER_LOGIN_OPTIONS.map((option) => (
                <Button
                  key={option.kind}
                  type="button"
                  variant="secondary"
                  className="w-full gap-3"
                  disabled={busy}
                  onClick={() => void submit(option.kind)}
                >
                  {busy && activeKind === option.kind ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      {option.label}
                      <span className="text-xs font-normal text-zinc-400">
                        (@{getStubTestUserProfile(option.kind).username})
                      </span>
                    </>
                  )}
                </Button>
              ))}

              <div className="text-[11px] leading-relaxed text-zinc-400">
                Facebook login uses public profile + email only. Timeline import requests{" "}
                <code className="text-zinc-300">user_posts</code> separately when you click Import.
                Stub test users auto-link with Glowbyte.
              </div>

              {error ? (
                <div className="rounded-md bg-red-950/40 px-3 py-2 text-sm leading-relaxed text-red-200">
                  {error}
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Explore</CardTitle>
            <CardDescription>Public pages — no login required</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full">
              <a href="/help/first-time-user.html">How to use (first time)</a>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <a href="/help/setup-server.html">Setup on your server</a>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/blog">Blog</Link>
            </Button>
            <Button type="button" variant="outline" className="w-full" onClick={openFeedback}>
              Feedback / Suggestions
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
