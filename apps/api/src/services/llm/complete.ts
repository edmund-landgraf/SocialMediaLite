import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 120_000;
const LOG_PATH = path.resolve(process.cwd(), "logs", "ai-summary-llm.log");

function trimForLog(value: string, max = 1400): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}

async function writeLlmLog(event: Record<string, unknown>): Promise<void> {
  try {
    const dir = path.dirname(LOG_PATH);
    await mkdir(dir, { recursive: true });
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`;
    await appendFile(LOG_PATH, line, "utf8");
  } catch {
    // Do not fail request flow if logging fails.
  }
}

export class LlmNotConfiguredError extends Error {
  constructor() {
    super(
      "AI summary requires an LLM. Set LLM_PROVIDER=openai-compatible, LLM_BASE_URL (e.g. http://127.0.0.1:11434/v1), and LLM_MODEL in .env — see docs/OLLAMA_VPS_SETUP.md.",
    );
    this.name = "LlmNotConfiguredError";
  }
}

function resolveProvider(): string {
  return (process.env.LLM_PROVIDER ?? "openai-compatible").toLowerCase();
}

export function assertLlmConfigured(): void {
  const provider = resolveProvider();
  if (provider === "stub" || provider === "off" || provider === "none") {
    throw new LlmNotConfiguredError();
  }
}

export async function completeChat(
  messages: { role: "system" | "user"; content: string }[],
): Promise<string> {
  assertLlmConfigured();

  const baseUrl = (process.env.LLM_BASE_URL ?? "http://127.0.0.1:11434/v1").replace(/\/$/, "");
  const apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY ?? "ollama";
  const model = process.env.LLM_MODEL ?? "llama3.2:3b";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();
  await writeLlmLog({
    kind: "llm.request.start",
    provider: resolveProvider(),
    baseUrl,
    model,
    timeoutMs,
    messageCount: messages.length,
    promptChars: messages.reduce((sum, m) => sum + m.content.length, 0),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.65,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      await writeLlmLog({
        kind: "llm.request.http_error",
        provider: resolveProvider(),
        baseUrl,
        model,
        status: res.status,
        elapsedMs: Date.now() - startedAt,
        body: trimForLog(body),
      });
      throw new Error(`LLM request failed (${res.status}): ${body.slice(0, 400)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) {
      await writeLlmLog({
        kind: "llm.request.empty_response",
        provider: resolveProvider(),
        baseUrl,
        model,
        elapsedMs: Date.now() - startedAt,
      });
      throw new Error("LLM returned an empty response");
    }
    await writeLlmLog({
      kind: "llm.request.success",
      provider: resolveProvider(),
      baseUrl,
      model,
      elapsedMs: Date.now() - startedAt,
      outputChars: text.length,
    });
    return text;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      await writeLlmLog({
        kind: "llm.request.timeout",
        provider: resolveProvider(),
        baseUrl,
        model,
        timeoutMs,
        elapsedMs: Date.now() - startedAt,
      });
      throw new Error(`LLM request timed out after ${timeoutMs}ms`);
    }
    await writeLlmLog({
      kind: "llm.request.exception",
      provider: resolveProvider(),
      baseUrl,
      model,
      elapsedMs: Date.now() - startedAt,
      error: e instanceof Error ? trimForLog(e.message) : "Unknown error",
    });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
