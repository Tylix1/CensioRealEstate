/**
 * P1 · How Censio works (spec §5.2): the explainer for the class and the promo video. It shows
 * - the pipeline: Documents → AI extraction → Lookups & rent estimate → Valuation engine → Senior valuer → Report;
 * - what the AI does and what the valuer does;
 * - the learning loop: valuer corrections become training data and calibrate district defaults;
 * - why it scales, trust and accountability, and the roadmap.
 *
 * A Server Component without saved data: it is prerendered. Every figure it quotes comes from the app's own pipeline
 * run on the seeded sample deal, or from the routes' own limits (./facts.ts); comparisons that rest on an assumption
 * say so.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppBar } from "@/components/ui/AppBar";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cx } from "@/components/ui/cx";
import { SOURCE_TYPES } from "@/lib/registry/registry";
import { LearningLoopDiagram, PipelineDiagram } from "./diagrams";
import { limitFacts, sampleFacts, type LimitFacts, type SampleFacts } from "./facts";

export const metadata: Metadata = {
  title: "How Censio works — Censio RE (prototype)",
  description:
    "The pipeline from documents to a signed report: what the AI does, what the senior valuer does, the learning loop and why it scales. Sample data.",
};

const SECTIONS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "roles", label: "AI and valuer" },
  { id: "learning-loop", label: "Learning loop" },
  { id: "scale", label: "Why it scales" },
  { id: "trust", label: "Trust" },
  { id: "roadmap", label: "Roadmap" },
] as const;

function SectionHeading({ id, title, lead }: { id: string; title: string; lead?: ReactNode }) {
  return (
    <div className="max-w-[760px]">
      <h2 id={id} className="font-display text-[26px] font-semibold leading-8 tracking-[-0.01em]">
        {title}
      </h2>
      {lead && <p className="mt-2 text-[15px] leading-[22px] text-ink-2">{lead}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Pipeline

function PipelineSection({ facts }: { facts: SampleFacts }) {
  return (
    <section id="pipeline" aria-labelledby="pipeline-title" className="mt-10 scroll-mt-4">
      <SectionHeading
        id="pipeline-title"
        title="The pipeline"
        lead={`From the client's documents to a signed report. The sample deal ${facts.dealId} runs through every step.`}
      />
      <PipelineDiagram facts={facts} labelledBy="pipeline-title" />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-valuer-line bg-surface p-4">
          <h3 className="flex items-center gap-2 font-semibold text-valuer">
            <span aria-hidden="true">↺</span>
            Revalue: work goes back with a note
          </h3>
          <p className="mt-1 text-[13px] leading-[19px] text-ink-2">
            The valuer can send any call back in plain English, like handing work back to a junior. The AI turns the
            note into changes, the engine recomputes, and a new version shows what changed, with an undo.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4">
          <h3 className="flex items-center gap-2 font-semibold">
            <span aria-hidden="true" className="text-ai">
              ≈
            </span>
            The AI reads; code calculates
          </h3>
          <p className="mt-1 text-[13px] leading-[19px] text-ink-2">
            The language model is used where documents and notes must be understood. Lookups, rent estimate, valuation
            and flags are deterministic code: the same inputs always give the same value, and every step can be
            audited.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// What the AI does / what the valuer does

const AI_DOES = [
  "Reads every document and returns each value with its page and the exact quote.",
  "Turns what is missing or unclear into a check: a missing document or an unsure field is flagged, not guessed.",
  "Looks up the land value (BORIS) and the cap rate (the local valuation committee's market report).",
  "Estimates the market rent of every unit from comparable listings.",
  "Computes the value, runs the cross-checks and drafts the report.",
  "Flags its judgement calls, biggest € impact first, each with why it was flagged and what would change its mind.",
  "Revises the valuation when the valuer sends a note, and lists exactly what changed.",
];

const VALUER_DOES = [
  "Reviews only the flagged judgement calls, not the whole file.",
  "Opens the evidence behind each call: the highlighted line in the PDF, the lookup row, the comparables on a map.",
  "Accepts a call, or writes a note in plain English, like handing work back to a junior. The AI revises.",
  "Spot-checks one of the automatically verified figures.",
  "Signs the report and is accountable for the value. Nothing reaches the client unsigned.",
];

function RoleCard({
  tone,
  title,
  role,
  items,
}: {
  tone: "ai" | "valuer";
  title: string;
  role: string;
  items: readonly string[];
}) {
  const ai = tone === "ai";
  return (
    <Card as="article" aria-labelledby={`${tone}-does`} className="overflow-hidden">
      <div className={cx("h-1", ai ? "bg-ai-strong" : "bg-valuer")} />
      <div className="p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span
            aria-hidden="true"
            className={cx(
              "flex size-9 shrink-0 items-center justify-center rounded-full font-display font-bold",
              ai ? "bg-ai-weak text-lg text-ai" : "bg-valuer text-sm text-white",
            )}
          >
            {ai ? "≈" : "KV"}
          </span>
          <div className="min-w-0">
            <h3 id={`${tone}-does`} className="font-display text-xl font-semibold leading-7">
              {title}
            </h3>
            <p className={cx("text-xs font-semibold uppercase leading-4 tracking-[0.04em]", ai ? "text-ai" : "text-valuer")}>
              {role}
            </p>
          </div>
        </div>
        <ul className="mt-4 flex flex-col gap-2.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[14px] leading-5">
              <span
                aria-hidden="true"
                className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", ai ? "bg-ai-strong" : "bg-valuer")}
              />
              <span className="min-w-0 text-ink-2">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function RolesSection() {
  return (
    <section id="roles" aria-labelledby="roles-title" className="mt-14 scroll-mt-4">
      <SectionHeading
        id="roles-title"
        title="The AI prepares, the valuer decides"
        lead="The AI does the reading, the lookups and the arithmetic. The human checks what needs judgement, and stays accountable."
      />
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <RoleCard tone="ai" title="What the AI does" role="The preparer" items={AI_DOES} />
        <RoleCard tone="valuer" title="What the valuer does" role="The signatory of record" items={VALUER_DOES} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Learning loop

function LearningLoopSection({ facts }: { facts: SampleFacts }) {
  return (
    <section id="learning-loop" aria-labelledby="loop-title" className="mt-14 scroll-mt-4">
      <SectionHeading id="loop-title" title="The learning loop" />
      <Card className="mt-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[760px] font-display text-xl font-semibold leading-7 tracking-[-0.01em]">
            Every valuer correction becomes training data and calibrates district defaults.
          </p>
          <Pill tone="sample">Product concept</Pill>
        </div>
        <LearningLoopDiagram facts={facts} labelledBy="loop-title" />
        <p className="mt-5 max-w-[760px] text-xs leading-[18px] text-muted">
          In this prototype every correction is already recorded in the review log: the note, the old and the new value,
          and who changed it. Training on these records and calibrating the defaults belong to the product; the
          prototype does not retrain.
        </p>
      </Card>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Why it scales

function TimeRow({
  label,
  value,
  note,
  bar,
}: {
  label: string;
  value: string;
  note: string;
  bar: "manual" | "censio";
}) {
  return (
    <div>
      <dt className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{label}</span>
      </dt>
      <dd className="mt-1.5">
        <div className="flex items-center gap-3">
          <div aria-hidden="true" className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-page">
            <div
              className={cx(
                "h-full rounded-full",
                bar === "manual"
                  ? "w-full bg-[repeating-linear-gradient(135deg,#98a2b3_0_3px,#d0d5dd_3px_6px)]"
                  : "w-[1%] min-w-1.5 bg-brand",
              )}
            />
          </div>
          <span className="tnum shrink-0 font-display text-lg font-semibold leading-6">{value}</span>
        </div>
        <p className="mt-1 text-xs leading-[18px] text-muted">{note}</p>
      </dd>
    </div>
  );
}

function ScaleSection({ facts }: { facts: SampleFacts }) {
  const reasons = [
    {
      title: "Exceptions, not the whole file",
      text: `In the sample deal the valuer checks ${facts.judgementCalls} judgement calls. ${facts.verifiedNumbers} numbers and ${facts.crossChecks} cross-checks are verified automatically.`,
    },
    {
      title: "Biggest € impact first",
      text: "Each call shows how far it could move the value, all on one scale, so attention goes where the money is.",
    },
    {
      title: "Time follows the calls, not the pages",
      text: "The queue estimates each deal's review time from its open calls, so the valuer can plan a day of reviews.",
    },
    {
      title: "Sending back costs a sentence",
      text: "A note replaces a rework: the AI revises, the engine recomputes, and the changes are listed against the previous version.",
    },
  ];
  return (
    <section id="scale" aria-labelledby="scale-title" className="mt-14 scroll-mt-4">
      <SectionHeading
        id="scale-title"
        title="Why it scales"
        lead="The valuer's time goes into the few calls that need judgement, not into reading and typing. One senior valuer can review a whole queue of deals."
      />
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card as="article" aria-labelledby="time-title" className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="time-title" className="font-display text-lg font-semibold leading-6">
              Senior valuer&apos;s time per deal
            </h3>
            <Pill tone="sample">Illustrative</Pill>
          </div>
          <dl className="mt-4 flex flex-col gap-5">
            <TimeRow
              label="Manual desktop report"
              value="a few hours"
              note="Assumption: one person reads every document, types the figures, builds the calculation and writes the report."
              bar="manual"
            />
            <TimeRow
              label="Censio: review the flagged calls"
              value="~1–2 min"
              note={`The prototype's estimate for its sample queue; the sample deal has ${facts.judgementCalls} calls.`}
              bar="censio"
            />
          </dl>
          <p className="mt-5 border-t border-line pt-3 text-xs leading-[18px] text-ink-2">
            <strong className="font-semibold text-ink">Illustrative arithmetic:</strong> at about 2 minutes a review,
            one valuer-hour covers about 30 deals. The manual time is an assumption, not a measurement.
          </p>
        </Card>
        <ul className="grid gap-4 sm:grid-cols-2">
          {reasons.map((r, i) => (
            <li key={r.title} className="flex gap-3 rounded-xl border border-line bg-surface p-4">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-weak font-display text-sm font-bold text-brand"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold leading-5">{r.title}</h3>
                <p className="mt-1 text-[13px] leading-[19px] text-ink-2">{r.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Trust and accountability

function TrustCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      <h3 className="font-semibold leading-5">{title}</h3>
      <div className="mt-1.5 text-[13px] leading-[19px] text-ink-2">{children}</div>
    </li>
  );
}

function TrustSection({ limits }: { limits: LimitFacts }) {
  return (
    <section id="trust" aria-labelledby="trust-title" className="mt-14 scroll-mt-4">
      <SectionHeading
        id="trust-title"
        title="Trust & accountability"
        lead="The AI is the preparer; the senior valuer is the signatory of record. Every step leaves a trace."
      />
      <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TrustCard title="The valuer signs">
          Nothing reaches the client before the senior valuer signs. The sign-off sheet lists every AI judgement call
          with its status: accepted, changed by the valuer (with the note), or accepted at sign-off without opening.
        </TrustCard>
        <TrustCard title="Every figure traced to its source">
          <p>
            Each number carries a marker with a glyph, a colour and words. Figures read from a document keep their page
            and verbatim quote, highlighted in the PDF.
          </p>
          <ul aria-label="Source markers" className="mt-2.5 flex flex-wrap gap-1.5">
            {SOURCE_TYPES.map((type) => (
              <li key={type}>
                <SourceBadge type={type} />
              </li>
            ))}
          </ul>
        </TrustCard>
        <TrustCard title="Guardrails on the AI">
          The server checks every quote against the PDF&apos;s text; a value it cannot confirm reads “AI unsure — please
          confirm”. A note can move judgement calls only within set ranges (cap rate {limits.capRateNoteRange}), never
          sourced facts such as areas, in-place rents or the land value. The AI never invents a source.
        </TrustCard>
        <TrustCard title="A complete review log">
          Every version is kept, undone ones included, with the note and what changed. The PDF report prints the log
          next to the sources: document, page and quote.
        </TrustCard>
        <TrustCard title="Usage limits">
          Live AI runs only for links with the demo&apos;s access code, and a monthly spend limit on the API key is the
          hard cap. Per visitor and hour: {limits.batchesPerHour} document batches and {limits.notesPerHour} notes. Up to{" "}
          {limits.filesPerDeal} PDFs per deal, {limits.pagesPerPdf} pages and {limits.mbPerPdf} MB each; notes up to{" "}
          {limits.noteChars} characters. Without Live AI, Demo mode uses recorded AI results and a rule-based note
          parser.
        </TrustCard>
        <TrustCard title="Sample data, clearly marked">
          All deals, documents and people are fictitious, and every screen says “Sample data”. The sample PDFs carry
          “MUSTER / SAMPLE”; land values, the market report and the rental listings are bundled sample tables.
        </TrustCard>
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Roadmap

const ROADMAP: { title: string; german?: string; text: string }[] = [
  {
    title: "Comparison approach",
    german: "Vergleichswertverfahren",
    text: "Value from comparable sales: the usual method for condominiums and building land.",
  },
  {
    title: "Cost approach",
    german: "Sachwertverfahren",
    text: "Value from building costs and land: for owner-occupied houses, where rents do not set the price.",
  },
  {
    title: "Commercial",
    text: "Offices and retail, with their own lease terms, operating costs and risks.",
  },
  {
    title: "Hotel",
    text: "Valued on the operator's lease or on what the hotel earns.",
  },
  {
    title: "Condominiums",
    german: "Wohnungseigentum",
    text: "Single units: a Wohnungsgrundbuch (unit land register) per unit, the Teilungserklärung (declaration of division) and the owners' costs.",
  },
];

function RoadmapSection() {
  return (
    <section id="roadmap" aria-labelledby="roadmap-title" className="mt-14 scroll-mt-4">
      <SectionHeading
        id="roadmap-title"
        title="Roadmap"
        lead="The prototype computes one case. The same pipeline, with the valuer in the loop, extends to more methods and property types."
      />
      <div className="mt-5 flex flex-col gap-4 xl:flex-row">
        <Card className="border-brand bg-brand-weak p-4 xl:w-[260px] xl:shrink-0">
          <Pill tone="ok" size="sm" className="bg-surface">
            Today
          </Pill>
          <h3 className="mt-2 font-semibold leading-5">
            In the prototype
          </h3>
          <p className="mt-1.5 text-[13px] leading-[19px] text-ink-2">
            Living, whole building, income approach (Ertragswertverfahren). Commercial, Hotel and single units can be
            selected; the prototype then continues with the Living sample.
          </p>
        </Card>
        <ul aria-labelledby="roadmap-title" className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {ROADMAP.map((item) => (
            <li key={item.title} className="flex flex-col rounded-xl border border-dashed border-line-strong bg-surface p-4">
              <Pill tone="neutral" size="sm" className="self-start">
                Next
              </Pill>
              <h3 className="mt-2 font-semibold leading-5">{item.title}</h3>
              {item.german && <p className="text-xs italic leading-[18px] text-muted">{item.german}</p>}
              <p className="mt-1.5 text-[13px] leading-[19px] text-ink-2">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Page

export default function HowItWorksPage() {
  const facts = sampleFacts();
  const limits = limitFacts();

  return (
    <>
      <AppBar />
      <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-8 sm:px-6 lg:pt-12">
        <div className="max-w-[760px]">
          <Pill tone="brand">Explainer · AI-native property valuation</Pill>
          <h1 className="mt-4 font-display text-[32px] font-semibold leading-10 tracking-[-0.02em] sm:text-[40px] sm:leading-[48px]">
            How Censio works
          </h1>
          <p className="mt-4 text-base leading-6 text-ink-2">
            Censio values residential buildings in Germany. The AI does the preparation a junior would do: it reads the
            property documents, looks up public data, estimates the market rents and computes the value. A senior valuer
            checks only the judgement calls the AI flags, and signs.
          </p>
        </div>

        <nav aria-label="On this page" className="mt-6">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-ink-2 hover:border-line-strong hover:text-ink"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <PipelineSection facts={facts} />
        <RolesSection />
        <LearningLoopSection facts={facts} />
        <ScaleSection facts={facts} />
        <TrustSection limits={limits} />
        <RoadmapSection />

        <section aria-labelledby="try-title" className="mt-14">
          <Card className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
            <div className="min-w-0 max-w-[560px]">
              <h2 id="try-title" className="font-display text-[22px] font-semibold leading-7 tracking-[-0.01em]">
                Try it yourself
              </h2>
              <p className="mt-1 text-ink-2">
                Request a valuation with the sample documents, or open the sample deal in the valuer&apos;s queue.
                Everything runs on sample data.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/client" variant="primary">
                Try it as the client
              </ButtonLink>
              <ButtonLink href="/valuer" variant="secondary">
                Try it as the senior valuer
              </ButtonLink>
            </div>
          </Card>
        </section>
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-4 text-xs leading-[18px] text-muted sm:px-6">
          <span className="font-semibold text-ink-2">Sample data — prototype</span>
          <span>All deals, documents and people are fictitious. Not a valuation report.</span>
        </div>
      </footer>
    </>
  );
}
