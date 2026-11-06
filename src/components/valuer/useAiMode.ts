"use client";

/**
 * Whether Revalue notes run with Live AI or in Demo mode (spec §6.4), for the review screen: Demo mode offers example
 * notes to click. Without an access code the answer is Demo mode at once (Live AI needs the code); with one, GET
 * /api/mode says whether the deployment accepts it. null while that is being checked, and until the saved access code
 * is known.
 */
import { useEffect, useState } from "react";
import type { ModeResponse } from "@/app/api/mode/route";
import { useDemoHydrated, useDemoStore } from "@/lib/store/demoStore";

export type AiMode = "live" | "demo";

export function useAiMode(): AiMode | null {
  const hydrated = useDemoHydrated();
  const accessCode = useDemoStore((s) => s.accessCode);
  // The answer is kept with the code it was asked for, so a new code reads as unknown until its answer arrives.
  const [answer, setAnswer] = useState<{ code: string; mode: AiMode } | null>(null);

  useEffect(() => {
    if (!hydrated || accessCode === null) return;
    const controller = new AbortController();
    fetch(`/api/mode?code=${encodeURIComponent(accessCode)}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ModeResponse>;
      })
      .then((mode) => setAnswer({ code: accessCode, mode: mode.live ? "live" : "demo" }))
      .catch(() => {
        // An unreachable server cannot run Live AI either.
        if (!controller.signal.aborted) setAnswer({ code: accessCode, mode: "demo" });
      });
    return () => controller.abort();
  }, [hydrated, accessCode]);

  if (!hydrated) return null;
  if (accessCode === null) return "demo";
  return answer?.code === accessCode ? answer.mode : null;
}
