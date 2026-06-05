import { useEffect, useState } from "react";
import { apiJson } from "@/lib/api";
import type { LiveChatPresenceResponse } from "@socialmedialite/shared";

const PRESENCE_STUB: LiveChatPresenceResponse = {
  username: "",
  online: false,
  lastSeenAt: null,
  canGoLive: false,
};

/**
 * Poll friend presence for Go live eligibility.
 * Stub: API always returns canGoLive false until heartbeat + real-time transport ship.
 */
export function useFriendPresence(friendUsername: string | null | undefined) {
  const [presence, setPresence] = useState<LiveChatPresenceResponse>(PRESENCE_STUB);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!friendUsername) {
      setPresence(PRESENCE_STUB);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await apiJson<LiveChatPresenceResponse>(
          `/api/messages/live/presence/${encodeURIComponent(friendUsername)}`,
        );
        if (!cancelled) setPresence(data);
      } catch {
        if (!cancelled) setPresence({ ...PRESENCE_STUB, username: friendUsername });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [friendUsername]);

  return { presence, loading };
}

/** Start live session — throws until WebSocket/SSE phase is implemented. */
export async function startLiveChatSession(input: {
  recipientUsername: string;
  threadId?: string;
}): Promise<void> {
  await apiJson("/api/messages/live/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
