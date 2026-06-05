import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

const GO_LIVE_DISABLED_REASON =
  "Go live (coming soon) — both friends must be online on the app at the same time";

export function GoLiveButton(props: {
  canGoLive: boolean;
  disabled?: boolean;
  size?: "sm" | "default";
  variant?: "default" | "secondary" | "outline";
  onGoLive?: () => void;
}) {
  const enabled = props.canGoLive && !props.disabled;

  return (
    <Button
      type="button"
      size={props.size ?? "sm"}
      variant={props.variant ?? "outline"}
      disabled={!enabled}
      title={enabled ? "Start a live chat" : GO_LIVE_DISABLED_REASON}
      onClick={() => {
        if (enabled) props.onGoLive?.();
      }}
    >
      <Radio className="size-4" aria-hidden />
      Go live
    </Button>
  );
}
