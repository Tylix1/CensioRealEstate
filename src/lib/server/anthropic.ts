/**
 * Live AI access for the server routes (spec §6.4, plan Global Constraints).
 *
 * Live AI runs only when the deployment sets both ANTHROPIC_API_KEY and DEMO_ACCESS_CODE and the request carries the
 * matching access code (the founders' `?code=…` link). Everything else is Demo mode: committed fixtures for the
 * sample PDFs and the rule-based note parser. The monthly spend limit of the prototype's API key in the Anthropic
 * Console is the hard cap; the access code and the rate limits are a courtesy layer on top of it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createHash, timingSafeEqual } from "node:crypto";

export const MODEL = "claude-opus-5-5";

/**
 * Opt-in server-side refusal fallback for `client.beta.messages.parse`: when the model declines for policy reasons,
 * the API re-runs the same request on Anthropic's recommended fallback model inside the same call. A response whose
 * `stop_reason` is still "refusal" means the whole chain declined.
 */
export const REFUSAL_FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

/** Per-attempt timeout, below the routes' 60 s `maxDuration`. */
const REQUEST_TIMEOUT_MS = 55_000;

/** Why the app is (not) in Live AI mode, as `GET /api/mode` reports it. */
export type LiveReason = "ok" | "no_key" | "no_code" | "bad_code";

/** True when the deployment is set up for Live AI: an API key and an access code to hand out. */
export function liveAiConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY && !!process.env.DEMO_ACCESS_CODE;
}

/** Whether `code` equals DEMO_ACCESS_CODE (compared in constant time; surrounding whitespace is ignored). */
export function accessCodeValid(code: string | null): boolean {
  const expected = process.env.DEMO_ACCESS_CODE?.trim();
  const given = code?.trim();
  if (!expected || !given) return false;
  const digest = (text: string) => createHash("sha256").update(text, "utf8").digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/** The mode a request with this access code gets: Live AI only with a configured deployment and the matching code. */
export function liveAccess(code: string | null): { live: boolean; reason: LiveReason } {
  if (!liveAiConfigured()) return { live: false, reason: "no_key" };
  if (!code?.trim()) return { live: false, reason: "no_code" };
  if (!accessCodeValid(code)) return { live: false, reason: "bad_code" };
  return { live: true, reason: "ok" };
}

let client: Anthropic | null = null;

/**
 * The shared Claude client, created on first use. It reads ANTHROPIC_API_KEY from the environment, so call it only
 * once Live AI is allowed. One retry covers a quick transient failure (e.g. an overloaded response); callers pass an
 * AbortSignal to bound the whole call, retries included, by their route's time budget.
 */
export function getClient(): Anthropic {
  client ??= new Anthropic({ maxRetries: 1, timeout: REQUEST_TIMEOUT_MS });
  return client;
}
