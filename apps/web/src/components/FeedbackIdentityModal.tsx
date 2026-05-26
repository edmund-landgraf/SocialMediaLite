import { Loader2 } from "lucide-react";
import { useState } from "react";
import {
  getStubTestUserProfile,
  STUB_TEST_USER_LOGIN_OPTIONS,
  type StubTestUserKind,
} from "@socialmedialite/shared";
import { Button } from "@/components/ui/button";
import { apiJson, apiUrl } from "@/lib/api";
import {
  markFeedbackFacebookPending,
  setFeedbackIdentity,
  type FeedbackIdentity,
} from "@/lib/feedbackIdentity";
import type { PublicUser } from "@/types";

type ActiveChoice = StubTestUserKind | "facebook" | "anonymous" | null;

export function FeedbackIdentityModal(props: {
  open: boolean;
  onComplete: (identity: FeedbackIdentity, user: PublicUser | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [activeChoice, setActiveChoice] = useState<ActiveChoice>(null);
  const [error, setError] = useState<string | null>(null);

  if (!props.open) return null;

  async function chooseStub(kind: StubTestUserKind) {
    setBusy(true);
    setActiveChoice(kind);
    setError(null);
    try {
      const resp = await apiJson<{ user: PublicUser }>("/api/auth/stub-login", {
        method: "POST",
        body: JSON.stringify({ kind }),
      });
      const identity: FeedbackIdentity = {
        mode: "authenticated",
        userId: resp.user.id,
        displayName: resp.user.displayName,
        username: resp.user.username,
      };
      setFeedbackIdentity(identity);
      props.onComplete(identity, resp.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
      setActiveChoice(null);
    }
  }

  async function chooseAnonymous() {
    setBusy(true);
    setActiveChoice("anonymous");
    setError(null);
    try {
      try {
        await apiJson("/api/auth/logout", { method: "POST" });
      } catch {
        // No session to clear.
      }
      const identity: FeedbackIdentity = { mode: "anonymous" };
      setFeedbackIdentity(identity);
      props.onComplete(identity, null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not continue as anonymous");
    } finally {
      setBusy(false);
      setActiveChoice(null);
    }
  }

  function chooseFacebook() {
    setBusy(true);
    setActiveChoice("facebook");
    setError(null);
    markFeedbackFacebookPending();
    window.location.href = apiUrl("/api/auth/facebook/start?returnTo=/feedback");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-login-title"
    >
      <div
        className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="feedback-login-title" className="text-lg font-semibold text-zinc-100">
          Login as
        </h2>
        <p className="mt-1 text-sm text-zinc-400">Choose how you want to participate in feedback.</p>

        <div className="mt-4 space-y-2">
          <Button
            type="button"
            variant="default"
            className="w-full"
            disabled={busy}
            onClick={chooseFacebook}
          >
            {busy && activeChoice === "facebook" ? (
              <>
                <Loader2 className="animate-spin" />
                Redirecting…
              </>
            ) : (
              "Your Facebook"
            )}
          </Button>

          {STUB_TEST_USER_LOGIN_OPTIONS.map((option) => (
            <Button
              key={option.kind}
              type="button"
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => void chooseStub(option.kind)}
            >
              {busy && activeChoice === option.kind ? (
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

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => void chooseAnonymous()}
          >
            {busy && activeChoice === "anonymous" ? (
              <>
                <Loader2 className="animate-spin" />
                Continuing…
              </>
            ) : (
              "Anonymous"
            )}
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md bg-red-950/40 px-3 py-2 text-sm text-red-200">{error}</div>
        ) : null}
      </div>
    </div>
  );
}
