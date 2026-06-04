import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const VIDEO_PLAYER_LOG_PATH = path.resolve(process.cwd(), "logs", "video-player.log");

function trimForLog(value: string, max = 1400): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

export type VideoPlayerLogEvent = Record<string, unknown>;

export async function writeVideoPlayerLog(event: VideoPlayerLogEvent): Promise<void> {
  try {
    await mkdir(path.dirname(VIDEO_PLAYER_LOG_PATH), { recursive: true });
    const sanitized: VideoPlayerLogEvent = { ...event };
    if (typeof sanitized.message === "string") {
      sanitized.message = trimForLog(sanitized.message);
    }
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...sanitized })}\n`;
    await appendFile(VIDEO_PLAYER_LOG_PATH, line, "utf8");
  } catch {
    // Do not fail request flow if logging fails.
  }
}
