/**
 * GET /api/mode?code=…: whether requests carrying this access code run with Live AI (spec §6.4). The demo bar's
 * badge reads it to show "Live AI" or "Demo mode".
 *
 * Reading the request URL makes the handler run per request; it is never prerendered with Cache Components.
 */
import { liveAccess, type LiveReason } from "@/lib/server/anthropic";

export type ModeResponse = { live: boolean; reason: LiveReason };

export function GET(request: Request): Response {
  const code = new URL(request.url).searchParams.get("code");
  return Response.json(liveAccess(code) satisfies ModeResponse, { headers: { "Cache-Control": "no-store" } });
}
