import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";

type SummarySection = { title: string; body: string };

type PreviewResponse = {
  narrative: string;
  sections: SummarySection[];
};

export function AiSummaryModal(props: {
  open: boolean;
  username: string;
  onClose: () => void;
  onPosted: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState("");
  const [sections, setSections] = useState<SummarySection[]>([]);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNarrative("");
    setSections([]);
    try {
      const data = await apiJson<PreviewResponse>("/api/me/ai-summary/preview", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setNarrative(data.narrative);
      setSections(
        data.sections?.length
          ? data.sections
          : [{ title: "Summary", body: data.narrative }],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate summary");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!props.open) return;
    void loadPreview();
  }, [props.open, loadPreview]);

  async function postToProfile() {
    if (!narrative.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const postText = `✨ AI Summary\n\n${narrative.trim()}`;
      await apiJson(`/api/users/${encodeURIComponent(props.username)}/posts`, {
        method: "POST",
        body: JSON.stringify({ type: "TEXT", text: postText }),
      });
      await props.onPosted();
      props.onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post summary");
    } finally {
      setPosting(false);
    }
  }

  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-summary-title"
      onClick={() => {
        if (!loading && !posting) props.onClose();
      }}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-zinc-800 bg-zinc-900/50 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-violet-950/80 p-2 ring-1 ring-violet-800/50">
              <Sparkles className="size-5 text-violet-300" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">Profile</p>
              <h2 id="ai-summary-title" className="mt-0.5 text-xl font-semibold tracking-tight text-white">
                AI Summary
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-400">
                A snapshot of your activity on this site. Nothing is saved until you post it to your profile.
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
          {loading ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-zinc-400">
              <Loader2 className="size-8 animate-spin text-violet-400" />
              Generating your summary…
            </div>
          ) : error && !narrative ? (
            <div className="space-y-4 py-6">
              <p className="text-sm text-red-200">{error}</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void loadPreview()}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto pb-2 [-webkit-overflow-scrolling:touch]">
              <div className="flex min-w-min gap-4 pr-2">
                {sections.map((section) => (
                  <article
                    key={section.title}
                    className="w-[min(88vw,320px)] shrink-0 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
                  >
                    <h3 className="text-sm font-semibold text-violet-200">{section.title}</h3>
                    <p className="mt-3 whitespace-pre-wrap text-[14px] leading-7 text-zinc-300">
                      {section.body || "—"}
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && narrative ? (
          <div className="border-t border-red-900/40 bg-red-950/30 px-5 py-2 text-sm text-red-200">{error}</div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-800 bg-zinc-900/40 px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={loading || posting}
            onClick={props.onClose}
          >
            Exit
          </Button>
          <Button
            type="button"
            disabled={loading || posting || !narrative.trim()}
            onClick={() => void postToProfile()}
          >
            {posting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Posting…
              </>
            ) : (
              "Post to profile"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
