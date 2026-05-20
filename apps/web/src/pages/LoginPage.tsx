import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiJson, apiUrl } from "@/lib/api";

export function LoginPage() {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [activeKind, setActiveKind] = useState<"facebook" | "test_user" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error");
    if (!code) return;
    if (code === "fb_not_configured") {
      setError("Facebook Login is not configured on the server.");
      return;
    }
    if (code === "fb_state_or_code") {
      setError("Facebook login was cancelled or had an invalid state.");
      return;
    }
    if (code === "fb_login_failed") {
      setError("Facebook login failed. Please try again.");
      return;
    }
  }, []);

  async function stubLogin(kind: "test_user") {
    await apiJson<{ user: { username: string } }>("/api/auth/stub-login", {
      method: "POST",
      body: JSON.stringify({ kind }),
    });
    nav("/testuser");
  }

  async function submit(kind: "test_user") {
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

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-md">
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
              <Button
                type="button"
                variant="secondary"
                className="w-full gap-3"
                disabled={busy}
                onClick={() => void submit("test_user")}
              >
                {busy && activeKind === "test_user" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>Login with test user</>
                )}
              </Button>

              <div className="text-[11px] leading-relaxed text-zinc-400">
                Facebook login uses public profile scope only (name + profile picture). Test user auto-links with Glowbyte.
              </div>

              {error ? <div className="rounded-md bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
