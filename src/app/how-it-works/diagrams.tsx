/**
 * The two diagrams of the explainer (P1), drawn with HTML boxes and decorative arrows. Each is an ordered list, so a
 * screen reader gets the steps in order without the arrows. Plain components (no hooks): the page renders them on the
 * server.
 *
 * - `PipelineDiagram`: Documents → AI extraction → Lookups & rent estimate → Valuation engine → Senior valuer → Report.
 *   One row from xl up; a column with downward arrows below. From xl, a dashed return path shows the Revalue loop
 *   from the valuer back to the engine.
 * - `LearningLoopDiagram`: four steps in a clockwise cycle from md up; a column below.
 */
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cx } from "@/components/ui/cx";
import type { SourceType } from "@/lib/registry/registry";
import { EXAMPLE_NOTE, type SampleFacts } from "./facts";

/**
 * A figure with its unit or range, e.g. "3.0 %", "3.25–3.75 %", "9.60 €/m²", "565 m²", "1–2 min", "€1,300,000",
 * "−6.9 %", "5 MB": kept on one line.
 */
const FIGURE = /([−+]?€?\d+(?:[.,]\d+)*(?:–\d+(?:[.,]\d+)*)?(?: (?:%|€\/m²|m²|min|MB))?)/g;

/** Text whose figures never break across lines (a line break between "3.0" and "%" reads badly). */
export function Figures({ children }: { children: string }) {
  return (
    <>
      {children.split(FIGURE).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="whitespace-nowrap">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

/** A decorative arrow that points right; classes rotate and place it. */
export function Arrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
      className={cx("pointer-events-none shrink-0", className)}
    >
      <path
        d="M3 12h16M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pipeline

type StepTone = "client" | "ai" | "engine" | "valuer" | "report";

type PipelineStep = {
  label: string;
  tone: StepTone;
  /** Who or what does the step: source markers, always glyph + colour + words. */
  actors: { type: SourceType; label: string }[];
  text: string;
  /** The step in the sample deal. */
  sample: string;
};

const BOX: Record<StepTone, string> = {
  client: "border border-line bg-surface",
  ai: "border-2 border-ai-strong bg-surface",
  engine: "border border-line-strong bg-subtle",
  valuer: "border-2 border-valuer-line bg-valuer-weak",
  report: "border border-ink bg-ink text-white",
};

const NUMBER: Record<StepTone, string> = {
  client: "bg-doc-weak text-doc",
  ai: "bg-ai-weak text-ai",
  engine: "bg-rule-weak text-rule",
  valuer: "bg-valuer text-white",
  report: "bg-white text-ink",
};

function pipelineSteps(f: SampleFacts): PipelineStep[] {
  return [
    {
      label: "Documents",
      tone: "client",
      actors: [{ type: "client_document", label: "Client" }],
      text: "The client uploads the property PDFs: tenant list, land register (Grundbuch), energy certificate and more.",
      sample: `${f.documents} PDFs · ${f.pages} pages · ${f.photos} photos`,
    },
    {
      label: "AI extraction",
      tone: "ai",
      actors: [{ type: "ai_estimate", label: "Live AI · Claude" }],
      text: "The AI reads each PDF and returns every value with its page and the exact quote, checked against the PDF.",
      sample: `${f.units} units · ${f.livingArea} from the tenant list`,
    },
    {
      label: "Lookups & rent estimate",
      tone: "ai",
      actors: [
        { type: "public_data", label: "Public data" },
        { type: "ai_estimate", label: "AI estimate" },
      ],
      text: "Land value (BORIS) and cap rate (market report) from public sources; a market rent per unit from comparable listings.",
      sample: `Land ${f.landValue} · cap rate ${f.capRate} · rent ${f.marketRent}`,
    },
    {
      label: "Valuation engine",
      tone: "engine",
      actors: [
        { type: "calculated", label: "Calculated" },
        { type: "regulation", label: "ImmoWertV" },
      ],
      text: "The German income approach (Ertragswertverfahren), cross-checks, and a flag for every judgement call.",
      sample: `${f.marketValue} · ${f.judgementCalls} calls flagged`,
    },
    {
      label: "Senior valuer",
      tone: "valuer",
      actors: [{ type: "valuer", label: "Human in the loop" }],
      text: "Checks only the flagged calls, with their evidence. Accepts each one, or sends a note back to the AI.",
      sample: `${f.judgementCalls} calls to check · about 1–2 min`,
    },
    {
      label: "Report",
      tone: "report",
      actors: [{ type: "valuer", label: "Signed by the valuer" }],
      text: "The client receives a PDF report in which every figure names its source, with the full review log.",
      sample: "PDF · sources · review log",
    },
  ];
}

function PipelineBox({ step, n }: { step: PipelineStep; n: number }) {
  const dark = step.tone === "report";
  return (
    <div
      className={cx(
        "flex flex-1 flex-col gap-2.5 rounded-xl p-4",
        "md:grid md:grid-cols-[13rem_minmax(0,1fr)_13rem] md:items-start md:gap-x-6",
        "xl:flex xl:gap-2.5",
        BOX[step.tone],
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cx(
              "flex size-7 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
              NUMBER[step.tone],
            )}
          >
            {n}
          </span>
          <h3 className="min-w-0 font-display text-[17px] font-semibold leading-[22px]">{step.label}</h3>
        </div>
        <div className="flex flex-wrap gap-1">
          {step.actors.map((a) => (
            <SourceBadge key={a.label} type={a.type} label={a.label} />
          ))}
        </div>
      </div>
      <p className={cx("text-[13px] leading-[19px]", dark ? "text-white/80" : "text-ink-2")}>{step.text}</p>
      <p className="mt-auto text-xs leading-[18px] xl:pt-1">
        <span
          className={cx(
            "block text-[11px] font-semibold uppercase leading-4 tracking-[0.04em]",
            dark ? "text-white/60" : "text-muted",
          )}
        >
          Sample deal
        </span>
        <span className={cx("tnum font-semibold", dark ? "text-white" : "text-ink")}>{step.sample}</span>
      </p>
    </div>
  );
}

/** The six steps; `labelledBy` names the list (the section heading). */
export function PipelineDiagram({ facts, labelledBy }: { facts: SampleFacts; labelledBy: string }) {
  const steps = pipelineSteps(facts);
  return (
    <div className="mt-5">
      <ol aria-labelledby={labelledBy} className="grid gap-8 xl:grid-cols-6">
        {steps.map((step, i) => (
          <li key={step.label} className="relative flex min-w-0 flex-col">
            <PipelineBox step={step} n={i + 1} />
            {i < steps.length - 1 && (
              <Arrow
                className={cx(
                  "absolute left-1/2 top-full -translate-x-1/2 translate-y-1 rotate-90 text-faint",
                  "xl:left-full xl:top-1/2 xl:translate-x-1 xl:-translate-y-1/2 xl:rotate-0",
                )}
              />
            )}
          </li>
        ))}
      </ol>

      {/* From xl: the Revalue return path, from the valuer's box back to the engine's. The callout below says it. */}
      <div aria-hidden="true" className="hidden xl:grid xl:grid-cols-6 xl:gap-x-8">
        <div className="col-span-2 col-start-4">
          <div className="relative mx-[calc((100%-2rem)/4)] h-7 rounded-b-xl border-x-2 border-b-2 border-dashed border-valuer-line">
            <svg
              viewBox="0 0 14 9"
              width="14"
              height="9"
              className="absolute -left-2 -top-px text-valuer"
              focusable="false"
            >
              <path d="M1 8l6-6.5L13 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="mt-1.5 text-center text-xs font-semibold leading-4 text-valuer">
            ↺ Revalue: a note goes back to the AI
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Learning loop

type LoopStep = { title: string; text: string; tone: "ai" | "valuer" | "brand" };

const LOOP_TONE: Record<LoopStep["tone"], string> = {
  ai: "bg-ai-weak text-ai",
  valuer: "bg-valuer text-white",
  brand: "bg-brand text-white",
};

function loopSteps(f: SampleFacts): LoopStep[] {
  return [
    {
      title: "The AI drafts",
      tone: "ai",
      text: `With the best default it has. For ${f.zip} the market report gives no district cap rate, so the AI takes the city-wide median, ${f.capRate}: ${f.marketValue}.`,
    },
    {
      title: "The valuer corrects",
      tone: "valuer",
      text: `With a note: “${EXAMPLE_NOTE}” The AI revises the deal to ${f.revisedValue} (${f.revisedChange}).`,
    },
    {
      title: "The correction is recorded",
      tone: "brand",
      text: "With its context: what the AI proposed, what the valuer chose and why. That is labelled training data.",
    },
    {
      title: "District defaults move",
      tone: "brand",
      text: `When valuers keep making the same correction in ${f.zip}, its default follows them. The next draft there starts closer and needs fewer corrections.`,
    },
  ];
}

/**
 * Grid placement from md up: 1 top left → 2 top right ↓ 3 bottom right ← 4 bottom left ↑ back to 1. The arrows sit in
 * the gaps (gap-x-16, gap-y-12).
 */
const LOOP_PLACE = ["", "", "md:col-start-2 md:row-start-2", "md:col-start-1 md:row-start-2"];

const LOOP_ARROW = [
  // 1 → 2: right, in the column gap.
  "absolute left-1/2 top-full -translate-x-1/2 translate-y-1 rotate-90 md:left-full md:top-1/2 md:translate-x-5 md:-translate-y-1/2 md:rotate-0",
  // 2 ↓ 3: down, in the row gap.
  "absolute left-1/2 top-full -translate-x-1/2 translate-y-1 rotate-90 md:translate-y-3",
  // 3 ← 4: left, in the column gap.
  "absolute left-1/2 top-full -translate-x-1/2 translate-y-1 rotate-90 md:left-auto md:right-full md:top-1/2 md:-translate-x-5 md:-translate-y-1/2 md:rotate-180",
  // 4 ↑ 1: up, in the row gap (from md only; the column ends with a return note instead).
  "absolute hidden md:bottom-full md:left-1/2 md:block md:-translate-x-1/2 md:-translate-y-3 md:-rotate-90",
];

export function LearningLoopDiagram({ facts, labelledBy }: { facts: SampleFacts; labelledBy: string }) {
  const steps = loopSteps(facts);
  return (
    <div className="relative mt-6">
      <ol aria-labelledby={labelledBy} className="grid gap-8 md:grid-cols-2 md:gap-x-16 md:gap-y-12">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className={cx("relative flex min-w-0 gap-3 rounded-xl border border-line bg-surface p-4", LOOP_PLACE[i])}
          >
            <span
              aria-hidden="true"
              className={cx(
                "flex size-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
                LOOP_TONE[step.tone],
              )}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <h3 className="font-semibold leading-5">{step.title}</h3>
              <p className="mt-1 text-[13px] leading-[19px] text-ink-2">{step.text}</p>
            </div>
            <Arrow className={cx("text-faint", LOOP_ARROW[i])} />
          </li>
        ))}
      </ol>
      {/* The hub of the cycle, from md up. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 hidden size-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-page font-display text-2xl text-brand md:flex"
      >
        ↻
      </div>
      <p aria-hidden="true" className="mt-2 text-center text-xs font-semibold text-brand md:hidden">
        ↻ back to 1, for the next deal
      </p>
    </div>
  );
}
