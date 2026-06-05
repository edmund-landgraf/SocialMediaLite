import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

/**
 * Real-time IM shell — opened when Go live is enabled and session starts.
 * Stub: not wired; archive-on-close will POST /api/messages/live/sessions/:id/end.
 * See docs/plan/go-live-im.plan.md
 */
export function LiveChatModal(props: {
  open: boolean;
  friendDisplayName: string;
  sessionId: string | null;
  onClose: () => void;
}) {
  if (!props.open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Live chat"
    >
      <Card className="flex max-h-[90vh] w-full max-w-lg flex-col" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <div className="text-lg font-semibold text-white">Live chat</div>
            <CardDescription>
              With {props.friendDisplayName} — real-time transport not implemented yet.
            </CardDescription>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={props.onClose}>
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-sm text-zinc-500">
          <Loader2 className="size-6 animate-spin text-zinc-600" />
          <p className="text-center">
            Session stub
            {props.sessionId ? ` (${props.sessionId.slice(0, 8)}…)` : ""}. On close, transcript will archive into
            threaded messages.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
