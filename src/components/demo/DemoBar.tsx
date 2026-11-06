"use client";

/**
 * The demo bar (spec §5.1): a slim dark strip above every screen, outside the product UI. It holds
 * - the role switch ("View as: Client / Senior Valuer"), which navigates to /client or /valuer;
 * - the Live AI / Demo mode badge, read from GET /api/mode?code=<stored access code> (spec §6.4);
 * - "Orientation", which reopens the orientation overlay;
 * - "How it works", a link to the class explainer (/how-it-works), marked as the current page there;
 * - Reset demo, which restores the seeded state, clears IndexedDB and goes to the sign-in page.
 *
 * URL flags, on any page: `?code=XYZ` stores the access code (then drops it from the address bar), and
 * `?recording=1` / `?recording=0` hide or show the demo chrome for the tab session (see ./recording.ts).
 *
 * Hydration: the role and the access code are saved data, so they are read only once `useDemoHydrated()` is true.
 * Where the URL already says the role (/client…, /valuer…), the switch shows it from the first render and the saved
 * role follows it. `usePathname` and `useSearchParams` sit inside Suspense boundaries: with Cache Components they
 * suspend while prerendering routes with unknown params (the deal pages) and any search params.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { ModeResponse } from "@/app/api/mode/route";
import { cx } from "@/components/ui/cx";
import { useDemoHydrated, useDemoStore } from "@/lib/store/demoStore";
import { openOrientation } from "./OrientationOverlay";
import { setRecordingMode, useRecordingMode } from "./recordingMode";

type Role = "client" | "valuer";

const ROLES: { role: Role; label: string; home: string }[] = [
  { role: "client", label: "Client", home: "/client" },
  { role: "valuer", label: "Senior Valuer", home: "/valuer" },
];

/** The role a path belongs to: the client's and the valuer's screens live under /client and /valuer. */
function areaOf(pathname: string | null): Role | null {
  if (!pathname) return null;
  if (pathname === "/client" || pathname.startsWith("/client/")) return "client";
  if (pathname === "/valuer" || pathname.startsWith("/valuer/")) return "valuer";
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// URL flags

function UrlFlags() {
  const params = useSearchParams();
  const code = params.get("code");
  const recording = params.get("recording");

  useEffect(() => {
    if (code === null) return;
    useDemoStore.getState().setAccessCode(code);
    // Keep the code out of the address bar, and so out of screen recordings and copied links, once it is stored.
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [code]);

  useEffect(() => {
    // The inline <head> script already applied the flag on a full page load; this covers client-side navigations.
    if (recording === "1") setRecordingMode(true);
    else if (recording === "0") setRecordingMode(false);
  }, [recording]);

  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Live AI / Demo mode badge

type ModeState = { live: boolean; reason: ModeResponse["reason"] | "unreachable" };

const MODE_EXPLANATION: Record<ModeState["reason"], string> = {
  ok: "Claude reads uploaded documents and Revalue notes live",
  no_key: "no AI key on this deployment: the sample documents use recorded results, notes the rule-based parser",
  no_code: "open the demo link with your access code (?code=…) to use Live AI",
  bad_code: "the access code was not accepted",
  unreachable: "the server could not be reached to check",
};

function ModeBadge() {
  const hydrated = useDemoHydrated();
  const accessCode = useDemoStore((s) => s.accessCode);
  // The answer is kept with the code it was asked for, so a new code shows "Checking…" until its answer arrives.
  const [answer, setAnswer] = useState<{ code: string | null; mode: ModeState } | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    fetch(`/api/mode?code=${encodeURIComponent(accessCode ?? "")}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<ModeResponse>;
      })
      .then((mode) => setAnswer({ code: accessCode, mode }))
      .catch(() => {
        if (!controller.signal.aborted) setAnswer({ code: accessCode, mode: { live: false, reason: "unreachable" } });
      });
    return () => controller.abort();
  }, [hydrated, accessCode]);

  const mode = hydrated && answer && answer.code === accessCode ? answer.mode : null;
  const label = mode === null ? "Checking AI…" : mode.live ? "Live AI" : "Demo mode";
  const explanation = mode === null ? undefined : MODE_EXPLANATION[mode.reason];

  return (
    <span
      role="status"
      title={explanation ? `${label}: ${explanation}` : undefined}
      className={cx(
        "inline-flex min-w-[104px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold leading-4",
        mode?.live ? "bg-brand-accent/20 text-brand-accent" : "bg-white/10 text-white/90",
      )}
    >
      <span
        aria-hidden="true"
        className={cx("size-2 rounded-full", mode === null ? "bg-white/40" : mode.live ? "bg-brand-accent" : "bg-ai-light")}
      />
      {label}
      {explanation && <span className="sr-only"> ({explanation})</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// The bar

function DemoBarView({ area, onExplainer = false }: { area: Role | null; onExplainer?: boolean }) {
  const router = useRouter();
  const hydrated = useDemoHydrated();
  const storedRole = useDemoStore((s) => s.role);
  const recording = useRecordingMode();
  const [resetting, setResetting] = useState(false);
  const role = area ?? (hydrated ? storedRole : null);

  if (recording) return null;

  const switchTo = (next: (typeof ROLES)[number]) => {
    useDemoStore.getState().setRole(next.role);
    router.push(next.home);
  };

  const resetDemo = async () => {
    setResetting(true);
    try {
      await useDemoStore.getState().reset();
    } finally {
      setResetting(false);
    }
    router.push("/");
  };

  return (
    // The focus ring of globals.css is unlayered, so Tailwind outline utilities cannot recolour it; it reads
    // --color-brand, which this dark strip sets to the light mint accent for contrast.
    <section
      aria-label="Demo controls"
      className="bg-ink text-white [--color-brand:var(--color-brand-accent)] [html[data-recording]_&]:hidden"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 px-4 text-xs sm:gap-x-5 sm:px-6">
        <span className="hidden text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-white/60 sm:inline">
          Demo
        </span>

        <div role="group" aria-label="View as" className="flex items-center">
          <span aria-hidden="true" className="mr-1 text-white/60">
            View as
          </span>
          {ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              aria-pressed={role === r.role}
              onClick={() => switchTo(r)}
              className="group flex min-h-11 items-center px-0.5"
            >
              <span
                className={cx(
                  "rounded-md px-2.5 py-1.5 font-semibold leading-4",
                  role === r.role ? "bg-white text-ink" : "text-white/80 group-hover:bg-white/10 group-hover:text-white",
                )}
              >
                {r.label}
              </span>
            </button>
          ))}
        </div>

        <ModeBadge />

        <button
          type="button"
          onClick={openOrientation}
          className="flex min-h-11 items-center gap-1.5 px-0.5 font-semibold text-white/80 hover:text-white"
        >
          <span
            aria-hidden="true"
            className="flex size-4 items-center justify-center rounded-full border border-current text-[10px] leading-none"
          >
            i
          </span>
          Orientation
        </button>

        <Link
          href="/how-it-works"
          aria-current={onExplainer ? "page" : undefined}
          className="flex min-h-11 items-center px-0.5 font-semibold text-white/80 underline-offset-4 hover:text-white aria-[current=page]:text-white aria-[current=page]:underline"
        >
          How it works
        </Link>

        <div className="grow" />

        <button
          type="button"
          onClick={resetDemo}
          disabled={resetting}
          className="group flex min-h-11 items-center px-0.5 disabled:cursor-wait"
        >
          <span className="flex items-center gap-1.5 rounded-md border border-white/25 px-2.5 py-1.5 font-semibold leading-4 text-white/90 group-hover:border-white/50 group-hover:text-white">
            <span aria-hidden="true">↺</span>
            Reset demo
          </span>
        </button>
      </div>
    </section>
  );
}

function DemoBarAtPath() {
  const pathname = usePathname();
  const area = areaOf(pathname);
  const hydrated = useDemoHydrated();

  // Keep the saved role in step with the screens in view, e.g. after opening a /valuer link directly.
  useEffect(() => {
    if (!hydrated || !area) return;
    const { role, setRole } = useDemoStore.getState();
    if (role !== area) setRole(area);
  }, [hydrated, area]);

  return <DemoBarView area={area} onExplainer={pathname === "/how-it-works"} />;
}

export function DemoBar() {
  return (
    <>
      <Suspense fallback={null}>
        <UrlFlags />
      </Suspense>
      <Suspense fallback={<DemoBarView area={null} />}>
        <DemoBarAtPath />
      </Suspense>
    </>
  );
}
