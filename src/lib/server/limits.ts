/**
 * Usage limits of the live AI routes (spec §6.4, plan Global Constraints), held in memory per server instance: a
 * best-effort courtesy layer on serverless, where each instance counts on its own. The API key's monthly spend limit
 * in the Anthropic Console is the hard cap.
 */

export type RateBucket = "extract" | "revalue";

/** The extraction route reads one PDF per call; a deal's batch is counted as this many files. */
export const FILES_PER_BATCH = 5;
/** Size, page and note limits per request. */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_PAGES = 10;
export const MAX_FILES_PER_DEAL = 8;
export const MAX_NOTE_CHARS = 1000;

const WINDOW_MS = 60 * 60 * 1000;

/** Calls allowed per IP and rolling hour: 3 extraction batches (of 5 files each) and 15 revalue notes. */
export const RATE_LIMITS: Record<RateBucket, number> = {
  extract: 3 * FILES_PER_BATCH,
  revalue: 15,
};

/** `${bucket}:${ip}` → times of the allowed calls in the current window. */
const calls = new Map<string, number[]>();
/** Above this many tracked keys, keys without a call in the window are dropped. */
const SWEEP_AT = 5000;

/**
 * Counts one call of `ip` against `bucket` if the rolling-hour limit allows it. A refused call is not counted;
 * `retryAfterSec` is then the time until the oldest counted call leaves the window.
 */
export function checkRate(ip: string, bucket: RateBucket, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const key = `${bucket}:${ip}`;
  const recent = (calls.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= RATE_LIMITS[bucket]) {
    calls.set(key, recent);
    const retryAfterSec = Math.max(1, Math.ceil((Math.min(...recent) + WINDOW_MS - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  recent.push(now);
  calls.set(key, recent);
  if (calls.size > SWEEP_AT) sweep(now);
  return { ok: true, retryAfterSec: 0 };
}

function sweep(now: number): void {
  for (const [key, times] of calls) {
    if (times.every((t) => now - t >= WINDOW_MS)) calls.delete(key);
  }
}

/** The caller's IP as the platform reports it (first `x-forwarded-for` entry), or "unknown". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}
