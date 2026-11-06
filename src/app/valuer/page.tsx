"use client";

/**
 * V1 · Review queue (spec §5.2): the senior valuer's deals, the ones in review from the store first (they open the
 * review), then the static sample rows of the queue. Each row shows the calls to check and an estimated review time.
 */
import { Card } from "@/components/ui/Card";
import { QueueList, ValuerAppBar } from "@/components/valuer/QueueRail";

const HOW_A_REVIEW_RUNS = [
  {
    title: "The AI prepared the valuation",
    text: "It read the client's documents, looked up public data, estimated the rents and traced every figure to its source.",
  },
  {
    title: "You check its judgement calls",
    text: "Only the calls with real room for judgement are flagged, biggest € impact first, each with its evidence.",
  },
  {
    title: "You decide and sign",
    text: "Accept a call, or send the AI a note to revalue. You sign the report; the AI is the preparer.",
  },
];

export default function ReviewQueuePage() {
  return (
    <>
      <ValuerAppBar />
      <main className="mx-auto max-w-[1440px] px-4 pb-12 pt-5 sm:px-6">
        <div className="min-w-0">
          <div className="text-xs leading-[18px] text-muted">K. Vogel · Senior Valuer</div>
          <h1 className="font-display text-[26px] font-semibold leading-8 tracking-[-0.01em]">Review queue</h1>
        </div>
        <div className="mt-5 flex flex-wrap items-start gap-5">
          <QueueList className="min-w-0 flex-[999_1_600px]" />
          <Card as="aside" aria-labelledby="how-review-title" className="min-w-0 flex-[1_1_280px] p-4">
            <h2 id="how-review-title" className="text-base font-semibold">
              How a review runs
            </h2>
            <ol className="mt-3 flex flex-col gap-3">
              {HOW_A_REVIEW_RUNS.map((step, i) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-valuer-weak text-xs font-bold text-valuer">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold">{step.title}</div>
                    <div className="text-xs leading-[18px] text-ink-2">{step.text}</div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </main>
    </>
  );
}
