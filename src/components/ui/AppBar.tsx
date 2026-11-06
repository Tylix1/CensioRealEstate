import Link from "next/link";
import { SampleDataPill } from "./Pill";
import { cx } from "./cx";

/**
 * The product's app bar, as in the mockup: wordmark, optional nav, the "Sample data" pill that every screen carries,
 * and the signed-in persona. A plain component (no hooks), so server and client pages can both render it.
 */
export type AppBarPersona = "client" | "valuer";

export type AppBarNavItem = {
  label: string;
  href: string;
  /** The current section: underlined and marked aria-current. */
  active?: boolean;
  /** A count bubble after the label, e.g. the deals waiting in the review queue. */
  count?: number;
};

const PERSONAS: Record<AppBarPersona, { initials: string; name: string; role: string; home: string; avatar: string }> = {
  client: {
    initials: "DC",
    name: "Demo Capital GmbH",
    role: "Client · buy-side",
    home: "/client",
    avatar: "bg-brand-weak text-brand",
  },
  valuer: {
    initials: "KV",
    name: "K. Vogel",
    role: "Senior Valuer",
    home: "/valuer",
    avatar: "bg-valuer-weak text-valuer",
  },
};

/** The Censio mark: a green tile with a "C" and a mint dot. Decorative. */
export function CensioMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
      <rect x="0" y="0" width="28" height="28" rx="7" fill="#0B5D4B" />
      <path d="M19.4 9.4a6.6 6.6 0 1 0 0 9.2" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="19.6" cy="14" r="1.9" fill="#7FD1B9" />
    </svg>
  );
}

export type AppBarProps = {
  /** Who is signed in; none on the sign-in page. */
  persona?: AppBarPersona;
  nav?: AppBarNavItem[];
};

export function AppBar({ persona, nav = [] }: AppBarProps) {
  const who = persona ? PERSONAS[persona] : null;
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-7 gap-y-1 px-4 py-1 sm:px-6">
        <Link href={who?.home ?? "/"} className="flex min-h-11 items-center gap-2.5 text-ink">
          <CensioMark />
          <span className="font-display text-[19px] font-bold tracking-[-0.01em]">Censio</span>
          <span className="rounded bg-brand-weak px-1.5 py-px text-[11px] font-semibold leading-4 text-brand">RE</span>
        </Link>
        {nav.length > 0 && (
          <nav aria-label="Main" className="flex flex-wrap gap-x-5 font-medium">
            {nav.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cx(
                  "inline-flex min-h-11 items-center border-b-2",
                  item.active ? "border-brand text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {item.label}
                {item.count !== undefined && (
                  <span className="ml-1 rounded-full bg-brand px-[7px] py-px text-[11px] font-semibold leading-4 text-white">
                    {item.count}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
        <div className="grow" />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <SampleDataPill />
          {who && (
            <div className="flex min-h-11 items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cx("flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold", who.avatar)}
              >
                {who.initials}
              </span>
              <div className="leading-4">
                <div className="font-semibold">{who.name}</div>
                <div className="text-xs text-muted">{who.role}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
