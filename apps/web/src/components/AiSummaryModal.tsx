import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/api";

export type AiSummaryMode = "real" | "comedy";

type SummarySection = { title: string; body: string };

function isAiTakeSection(title: string): boolean {
  return title.trim().toLowerCase() === "ai's take";
}

type PreviewResponse = {
  mode: AiSummaryMode;
  narrative: string;
  sections: SummarySection[];
};

export function AiSummaryModal(props: {
  open: boolean;
  username: string;
  onClose: () => void;
  onPosted: () => void | Promise<void>;
}) {
  const [activeMode, setActiveMode] = useState<AiSummaryMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState("");
  const [sections, setSections] = useState<SummarySection[]>([]);
  const [resultMode, setResultMode] = useState<AiSummaryMode | null>(null);

  const loadPreview = useCallback(async (selectedMode: AiSummaryMode) => {
    setLoading(true);
    setError(null);
    setNarrative("");
    setSections([]);
    setResultMode(null);
    try {
      const data = await apiJson<PreviewResponse>("/api/me/ai-summary/preview", {
        method: "POST",
        body: JSON.stringify({ mode: selectedMode }),
      });
      setResultMode(data.mode);
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
    if (props.open) return;
    setActiveMode(null);
    setLoading(false);
    setPosting(false);
    setError(null);
    setNarrative("");
    setSections([]);
    setResultMode(null);
  }, [props.open]);

  function startMode(next: AiSummaryMode) {
    if (loading || posting) return;
    setActiveMode(next);
    void loadPreview(next);
  }

  async function postToProfile() {
    if (!narrative.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const header =
        resultMode === "comedy" ? "✨ AI Summary — Comedy" : "✨ AI Summary";
      const postText = `${header}\n\n${narrative.trim()}`;
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

  const comedyResult = resultMode === "comedy";

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
                Choose <span className="text-zinc-300">Real</span> or <span className="text-zinc-300">Comedy</span>{" "}
                to generate. Nothing runs until you pick. Nothing is saved until you post.
              </p>
              <div
                className="mt-3 inline-flex rounded-lg border border-zinc-700 bg-zinc-900/80 p-0.5"
                role="group"
                aria-label="Summary style"
              >
                <button
                  type="button"
                  disabled={loading || posting}
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activeMode === "real"
                      ? "bg-violet-900/80 text-violet-100"
                      : "text-zinc-400 hover:text-zinc-200",
                  ].join(" ")}
                  onClick={() => startMode("real")}
                >
                  Real
                </button>
                <button
                  type="button"
                  disabled={loading || posting}
                  className={[
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                    activeMode === "comedy"
                      ? "bg-amber-900/70 text-amber-100"
                      : "text-zinc-400 hover:text-zinc-200",
                  ].join(" ")}
                  onClick={() => startMode("comedy")}
                >
                  Comedy
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
          {loading && activeMode ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-zinc-400">
              <Loader2
                className={[
                  "size-8 animate-spin",
                  activeMode === "comedy" ? "text-amber-400" : "text-violet-400",
                ].join(" ")}
              />
              {activeMode === "comedy" ? "Writing the comedy roast…" : "Writing your summary…"}
            </div>
          ) : error && !narrative ? (
            <div className="space-y-4 py-6">
              <p className="text-sm text-red-200">{error}</p>
              {activeMode ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => startMode(activeMode)}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : !narrative ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-sm text-zinc-400">Pick Real or Comedy above to start.</p>
              <p className="text-xs text-zinc-600">Or Exit to close without generating.</p>
            </div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto pb-2 [-webkit-overflow-scrolling:touch]">
              <div className="flex min-w-min gap-4 pr-2">
                {sections.map((section) => {
                  const aiTake = comedyResult || isAiTakeSection(section.title);
                  return (
                    <article
                      key={section.title}
                      className={[
                        "shrink-0 rounded-lg border p-4",
                        comedyResult ? "w-[min(92vw,520px)]" : "w-[min(88vw,320px)]",
                        aiTake
                          ? "border-amber-800/60 bg-gradient-to-b from-amber-950/40 to-zinc-900/60"
                          : "border-zinc-800 bg-zinc-900/60",
                      ].join(" ")}
                    >
                      <h3
                        className={[
                          "text-sm font-semibold",
                          aiTake ? "text-amber-200" : "text-violet-200",
                        ].join(" ")}
                      >
                        {section.title}
                      </h3>
                      {aiTake ? (
                        <p className="mt-1 text-[10px] font-medium uppercase tracking-wider text-amber-600/90">
                          {comedyResult ? "3–5 paragraphs · tangents OK" : "Satirical · dry wit"}
                        </p>
                      ) : null}
                      <p
                        className={[
                          "mt-3 whitespace-pre-wrap text-[14px] leading-7",
                          aiTake ? "text-amber-50/90" : "text-zinc-300",
                        ].join(" ")}
                      >
                        {section.body || "—"}
                      </p>
                    </article>
                  );
                })}
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
