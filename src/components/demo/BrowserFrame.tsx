"use client";

/**
 * The browser frame of a video take (see ./frame.ts): a toolbar with window buttons, navigation arrows and an address
 * field that shows this page's real host and path. It is decoration, so it is hidden from assistive technology and
 * takes no clicks. It is always rendered and CSS shows it only under `html[data-frame]`.
 *
 * It sticks to the top like a browser's own toolbar. Modal dialogs open in the top layer above it; globals.css keeps
 * their backdrop and box below the toolbar while the frame is on.
 *
 * `usePathname` sits inside a Suspense boundary: with Cache Components it suspends while prerendering routes with
 * unknown params (the deal pages). The host is only known in the browser, so the server renders the field empty.
 */
import { usePathname } from "next/navigation";
import { Suspense, useSyncExternalStore } from "react";

const subscribeNever = () => () => {};

/** The address without scheme and query, as a browser shows it: the take's flags (?recording=1&frame=1) stay out. */
function useHost(): string {
  return useSyncExternalStore(
    subscribeNever,
    () => window.location.host,
    () => "",
  );
}

function Address({ pathname }: { pathname: string | null }) {
  const host = useHost();
  const path = pathname && pathname !== "/" ? pathname : "";
  return (
    <span className="truncate">
      <span className="text-ink">{host}</span>
      <span className="text-muted">{path}</span>
    </span>
  );
}

function AddressAtPath() {
  return <Address pathname={usePathname()} />;
}

function Arrow({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function BrowserFrame() {
  return (
    <div
      aria-hidden="true"
      data-browser-frame=""
      className="pointer-events-none sticky top-0 z-50 hidden h-11 select-none items-center gap-4 border-b border-line-strong bg-[#e9ecf0] px-4 [html[data-frame]_&]:flex"
    >
      <div className="flex w-40 shrink-0 items-center gap-5">
        <span className="flex items-center gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex items-center gap-3 text-ink-2">
          <Arrow d="M10 3 5 8l5 5" />
          <span className="text-faint">
            <Arrow d="m6 3 5 5-5 5" />
          </span>
        </span>
      </div>

      <div className="mx-auto flex h-7 w-full max-w-[640px] min-w-0 items-center justify-center gap-1.5 rounded-lg bg-surface px-3 text-[13px] leading-5 shadow-[0_0_0_1px_var(--color-line)]">
        <svg viewBox="0 0 16 16" className="size-3 shrink-0 text-muted" fill="currentColor">
          <path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5A1.5 1.5 0 0 1 13.5 8.5v4A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-4A1.5 1.5 0 0 1 4 7h.5Zm1.5 0h4V5a2 2 0 0 0-4 0v2Z" />
        </svg>
        <Suspense fallback={<Address pathname={null} />}>
          <AddressAtPath />
        </Suspense>
      </div>

      <div className="flex w-40 shrink-0 items-center justify-end gap-3 text-ink-2">
        <Arrow d="M13 8a5 5 0 1 1-1.6-3.7M13 3v2.5h-2.5" />
        <Arrow d="M8 3.5v9M3.5 8h9" />
      </div>
    </div>
  );
}
