"use client";

/**
 * The valuer's review queue (spec §5.2 V1, §5.4 item 2): the deals in review from the store first, then the static
 * sample rows of the seed (not clickable, tooltip "Sample row"), then a count of further sample deals.
 *
 * - `QueueRail`: the narrow rail on the left of the review screen (mockup "Your queue"); it stacks above the content on
 *   narrow screens.
 * - `QueueList`: the same queue as the main list of V1.
 * - `ValuerAppBar`: the app bar with "Review queue (n)".
 *
 * Rows of the store show the calls still open and an estimated review time from them; the rest of the numbers are
 * sample data. The queue is saved data: until the store has hydrated, the lists show placeholder rows and the app bar
 * no count.
 */
import Link from "next/link";
import { useMemo } from "react";
import { AppBar } from "@/components/ui/AppBar";
import { Card } from "@/components/ui/Card";
import { cx } from "@/components/ui/cx";
import { QUEUE_ROWS } from "@/lib/data/seed";
import {
  currentPipeline,
  flagReviewStatuses,
  useDemoHydrated,
  useDemoStore,
  type StoredDeal,
} from "@/lib/store/demoStore";
import { countLabel, dateLabel, queueType, reviewTimeLabel } from "./review";

export type QueueEntry = {
  id: string;
  /** "Leipzig · Multi-family" */
  place: string;
  /** Calls still to review (store deals) or the sample row's count. */
  checks: number;
  reviewSeconds: number;
  /** Store deals open their review; sample rows are static. */
  href: string | null;
  /** Store deals only: the address and request date for the V1 list. */
  address?: string;
  requested?: string;
};

export type QueueSummary = {
  entries: QueueEntry[];
  /** All deals in the queue, including the sample deals that are not listed. */
  total: number;
  minutes: number;
  /** Sample deals beyond the listed rows ("+ 8 more deals"). */
  more: number;
  signedOffToday: number;
  sentBackToday: number;
};

/** Sample deals further down the queue, beyond the listed rows: their number and review time. */
const MORE_SAMPLE_DEALS = { count: 8, reviewSeconds: 21 * 60 + 20 };
/** The sample "Today" figures before anything is signed or revalued in the demo. */
const TODAY = { signedOff: 9, sentBack: 1, medianReview: "1:41" };

/** About 20 s to read a deal plus 17.5 s per call, to the next 10 s: 4 calls take ~1:30, none ~0:20. */
function reviewSecondsFor(checks: number): number {
  return Math.round((20 + 17.5 * checks) / 10) * 10;
}

/** "~4:10" → 250. */
function parseReviewTime(label: string): number {
  const match = /(\d+):(\d{2})/.exec(label);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function entryFor(stored: StoredDeal): QueueEntry {
  const { deal } = stored;
  const statuses = flagReviewStatuses(stored, currentPipeline(stored));
  const open = Object.values(statuses).filter((s) => s === "open").length;
  return {
    id: deal.id,
    place: `${deal.address.city} · ${queueType(deal)}`,
    checks: open,
    reviewSeconds: reviewSecondsFor(open),
    href: `/valuer/deals/${encodeURIComponent(deal.id)}`,
    address: `${deal.address.street}, ${deal.address.zip} ${deal.address.city}`,
    requested: `Requested ${dateLabel(deal.requestedAt)} by ${deal.clientName}`,
  };
}

/** The queue from the stored deals: deals in review (oldest request first), then the sample rows. */
export function queueSummary(deals: Record<string, StoredDeal>): QueueSummary {
  const stored = Object.values(deals);
  const inReview = stored
    .filter((d) => d.deal.status === "in_review")
    .sort((a, b) => a.deal.requestedAt.localeCompare(b.deal.requestedAt))
    .map(entryFor);
  const samples: QueueEntry[] = QUEUE_ROWS.map((row) => ({
    id: row.id,
    place: `${row.city} · ${row.type}`,
    checks: row.checks,
    reviewSeconds: parseReviewTime(row.estReview),
    href: null,
  }));
  const entries = [...inReview, ...samples];
  const seconds = entries.reduce((sum, e) => sum + e.reviewSeconds, 0) + MORE_SAMPLE_DEALS.reviewSeconds;
  return {
    entries,
    total: entries.length + MORE_SAMPLE_DEALS.count,
    minutes: Math.round(seconds / 60),
    more: MORE_SAMPLE_DEALS.count,
    signedOffToday: TODAY.signedOff + stored.filter((d) => d.deal.status === "approved").length,
    sentBackToday: TODAY.sentBack + stored.filter((d) => d.history.versions.length > 1).length,
  };
}

export function useQueue(): QueueSummary {
  const deals = useDemoStore((s) => s.deals);
  return useMemo(() => queueSummary(deals), [deals]);
}

/** The app bar of the valuer screens, with the size of the queue once the saved state is in place. */
export function ValuerAppBar() {
  const hydrated = useDemoHydrated();
  const { total } = useQueue();
  return (
    <AppBar
      persona="valuer"
      nav={[{ label: "Review queue", href: "/valuer", active: true, count: hydrated ? total : undefined }]}
    />
  );
}

function PlaceholderRows({ rows }: { rows: number }) {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="border-b border-page px-4 py-2.5">
          <div className="h-[34px] animate-pulse rounded-md bg-page" />
        </div>
      ))}
    </div>
  );
}

function ChecksAndTime({ entry }: { entry: QueueEntry }) {
  return (
    <div className="shrink-0 whitespace-nowrap text-right text-xs leading-4">
      <div className={cx("font-semibold", entry.checks > 0 ? "text-ai" : "text-public")}>
        {countLabel(entry.checks, "check")}
      </div>
      <div className="text-ink-2">
        <span className="sr-only">estimated review time </span>
        {reviewTimeLabel(entry.reviewSeconds)}
      </div>
    </div>
  );
}

function TodayFooter({ queue, className }: { queue: QueueSummary; className?: string }) {
  return (
    <div className={cx("border-t border-line bg-subtle px-4 py-3 text-xs leading-[18px] text-ink-2", className)}>
      <div className="font-semibold text-ink">Today</div>
      <div>
        {queue.signedOffToday} signed off · {queue.sentBackToday} sent back to AI
      </div>
      <div>Median review time {TODAY.medianReview}</div>
    </div>
  );
}

function queueHeadline(queue: QueueSummary): string {
  return `${countLabel(queue.total, "deal")} · about ${queue.minutes} min of review`;
}

/** The narrow rail of the review screen (mockup "Your queue"); `activeId` is the deal on screen. */
export function QueueRail({ activeId, className }: { activeId?: string; className?: string }) {
  const queue = useQueue();
  return (
    <Card as="aside" aria-label="Review queue" className={cx("overflow-hidden", className)}>
      <div className="border-b border-line px-4 py-3.5">
        <div className="font-semibold">Your queue</div>
        <div className="text-xs text-muted">{queueHeadline(queue)}</div>
      </div>
      <ul aria-label="Deals in your queue">
        {queue.entries.map((entry) => {
          const active = entry.id === activeId;
          const body = (
            <>
              <div className="min-w-0">
                <div className="font-mono text-[11px] leading-4 text-ink-2">{entry.id}</div>
                <div className={cx("text-[13px] leading-5", active ? "font-semibold" : "font-medium")}>
                  {entry.place}
                </div>
              </div>
              <ChecksAndTime entry={entry} />
            </>
          );
          const rowClass = cx(
            "flex min-h-11 justify-between gap-2 border-b px-4 py-2.5",
            active ? "border-line bg-brand-weak" : "border-page",
          );
          return (
            <li key={entry.id} title={entry.href ? undefined : "Sample row"}>
              {entry.href ? (
                <Link
                  href={entry.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(rowClass, "text-ink no-underline hover:bg-subtle", active && "hover:bg-brand-weak")}
                >
                  {body}
                </Link>
              ) : (
                <div className={rowClass}>
                  {body}
                  <span className="sr-only">(sample row)</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="px-4 py-2.5 text-xs text-muted">+ {countLabel(queue.more, "more deal")}</div>
      <TodayFooter queue={queue} />
    </Card>
  );
}

/** V1's list: the same queue with addresses for the deals in review. */
export function QueueList({ className }: { className?: string }) {
  const hydrated = useDemoHydrated();
  const queue = useQueue();
  return (
    <Card as="section" aria-labelledby="queue-title" aria-busy={!hydrated} className={cx("overflow-hidden", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-4 py-3.5">
        <h2 id="queue-title" className="text-base font-semibold">
          Your queue
        </h2>
        {hydrated && <span className="text-xs text-muted">{queueHeadline(queue)}</span>}
      </div>
      {!hydrated ? (
        <PlaceholderRows rows={queue.entries.length} />
      ) : (
      <ul aria-label="Deals in your queue">
        {queue.entries.map((entry) =>
          entry.href ? (
            <li key={entry.id} className="border-b border-page">
              <Link
                href={entry.href}
                className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3.5 text-ink no-underline hover:bg-subtle"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 text-xs leading-[18px] text-muted">
                    <span className="font-mono text-[11px] text-ink-2">{entry.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>{entry.requested}</span>
                  </div>
                  <div className="font-semibold">{entry.address}</div>
                  <div className="text-xs leading-[18px] text-ink-2">{entry.place} · AI draft ready for your review</div>
                </div>
                <div className="flex items-center gap-4">
                  <ChecksAndTime entry={entry} />
                  <span className="inline-flex min-h-11 items-center rounded-lg bg-brand px-3.5 text-sm font-semibold text-white">
                    Open review
                  </span>
                </div>
              </Link>
            </li>
          ) : (
            <li
              key={entry.id}
              title="Sample row"
              className="flex min-h-11 items-center justify-between gap-x-6 border-b border-page px-4 py-2.5 text-ink-2"
            >
              <div className="min-w-0">
                <div className="font-mono text-[11px] leading-4">{entry.id}</div>
                <div className="font-medium text-ink">{entry.place}</div>
              </div>
              <span className="sr-only">(sample row)</span>
              <ChecksAndTime entry={entry} />
            </li>
          ),
        )}
      </ul>
      )}
      <div className="px-4 py-2.5 text-xs text-muted">+ {countLabel(queue.more, "more deal")}</div>
      {hydrated && <TodayFooter queue={queue} />}
    </Card>
  );
}
