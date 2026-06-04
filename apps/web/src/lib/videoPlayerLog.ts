import { apiFetch } from "@/lib/api";

export type VideoPlayerKind =
  | "native"
  | "hybrid-native"
  | "iframe"
  | "hybrid-iframe"
  | "soundcloud"
  | "mixcloud"
  | "audio";

export type VideoPlayerErrorReport = {
  playerKind: VideoPlayerKind;
  message: string;
  pageUrl?: string;
  embedUrl?: string;
  mediaErrorCode?: number;
  networkState?: number;
  readyState?: number;
};

export function mediaErrorLabel(code: number | undefined): string {
  switch (code) {
    case MediaError.MEDIA_ERR_ABORTED:
      return "MEDIA_ERR_ABORTED";
    case MediaError.MEDIA_ERR_NETWORK:
      return "MEDIA_ERR_NETWORK";
    case MediaError.MEDIA_ERR_DECODE:
      return "MEDIA_ERR_DECODE";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "MEDIA_ERR_SRC_NOT_SUPPORTED";
    default:
      return code != null ? `MEDIA_ERR_${code}` : "MEDIA_ERR_UNKNOWN";
  }
}

/** Fire-and-forget: persists to API `logs/video-player.log`. */
export function reportVideoPlayerError(report: VideoPlayerErrorReport): void {
  void apiFetch("/api/link-preview/video-player-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  }).catch(() => {
    // Logging must not affect playback UI.
  });
}
