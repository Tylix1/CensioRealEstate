"use client";

/**
 * The valuation report on the C5 page (spec §5.6): the same report model as the PDF, sections 1–9, as HTML. Real
 * headings and tables; wide tables scroll sideways on a phone.
 */
import { Fragment, type ReactNode } from "react";
import { Pill, type PillTone } from "@/components/ui/Pill";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cx } from "@/components/ui/cx";
import { useStoredImageUrl } from "@/components/valuer/useStoredFile";
import { REPORT_SECTIONS, type CallStatus, type ReportModel } from "@/lib/report/buildReport";

const STATUS: Record<CallStatus, { label: string; tone: PillTone; edge: string }> = {
  "changed by valuer": { label: "Changed by valuer", tone: "valuer", edge: "border-l-valuer" },
  accepted: { label: "Accepted", tone: "ok", edge: "border-l-ok" },
  "accepted at sign-off": { label: "Accepted at sign-off", tone: "ok", edge: "border-l-ok" },
  "accepted at sign-off without opening": {
    label: "Accepted at sign-off without opening",
    tone: "ai",
    edge: "border-l-ai-strong",
  },
  open: { label: "Open", tone: "ai", edge: "border-l-ai-strong" },
};

const OVERLINE = "text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted";
// Not upper case: the units (m², €/m²) must keep their case.
const TH = "px-3 py-2 text-left text-xs font-semibold leading-4 text-muted";
const TD = "px-3 py-2 align-top";
/** The header row of a list laid out as a table from md up. */
const LIST_HEAD = "hidden gap-x-4 bg-subtle px-3 py-2 text-xs font-semibold leading-4 text-muted md:grid";

/** A numbered section of the report, `n` 2–9 as in the PDF. */
function Section({ n, children, className }: { n: number; children: ReactNode; className?: string }) {
  const id = `report-section-${n}`;
  return (
    <section aria-labelledby={id} className={cx("border-t border-line px-4 py-5 sm:px-6", className)}>
      <h3 id={id} className="flex items-baseline gap-2.5 font-display text-lg font-semibold leading-7">
        <span className="text-brand">{n}</span>
        {REPORT_SECTIONS[n - 2]}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CoverPhoto({ photo }: { photo: NonNullable<ReportModel["cover"]["photo"]> }) {
  const url = useStoredImageUrl(photo.id, photo.fileName);
  // The client's own photo is not stored in this browser (e.g. after clearing site data): no photo.
  if (url === null) return null;
  return (
    <div className="relative aspect-[3/2] w-full self-start overflow-hidden rounded-lg border border-line bg-[#EEF2F6] md:w-[300px] md:shrink-0">
      {url ? (
        // A sample file or a blob URL from IndexedDB: next/image cannot optimise the latter.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Facade of the property" className="size-full object-cover" />
      ) : (
        <span role="img" aria-label="Facade photo (loading)" className="block size-full" />
      )}
    </div>
  );
}

function Cover({ model }: { model: ReportModel }) {
  const c = model.cover;
  const facts: [string, string][] = [
    ["Client", c.client],
    ["Deal ID", c.dealId],
    ["Valuation date", c.valuationDate],
    ["Version", c.versionLabel],
    ["Basis", c.basis],
    ["Scope", c.scope],
  ];
  return (
    <div className="px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-5 md:flex-row">
        {c.photo && <CoverPhoto photo={c.photo} />}
        <div className="min-w-0 flex-1">
          <div className={cx(OVERLINE, "text-brand")}>{c.title}</div>
          <h2 className="mt-1 font-display text-[22px] font-semibold leading-7">{c.address}</h2>
          <p className="mt-1 text-ink-2">{c.facts.join(" · ")}</p>
          <div className="mt-3 rounded-lg bg-brand-weak px-4 py-3">
            <div className={cx(OVERLINE, "text-brand")}>Market value as of {c.valuationDate}</div>
            <div className="tnum font-display text-[34px] font-semibold leading-[42px] tracking-[-0.02em]">
              {c.valueText}
            </div>
            <div className="tnum text-ink-2">{c.valueDetail}</div>
            <div className={cx("mt-1.5 font-semibold", model.draft ? "text-ai" : "text-ok")}>{c.signature}</div>
          </div>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0 border-b border-page pb-2">
            <dt className="text-xs leading-[18px] text-muted">{label}</dt>
            <dd className="min-w-0">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function PropertySection({ model }: { model: ReportModel }) {
  return (
    <Section n={3}>
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[200px_minmax(0,1fr)]">
        {model.property.facts.map((f) => (
          <Fragment key={f.label}>
            <dt className="pt-1.5 text-muted sm:border-b sm:border-page sm:pb-1.5">{f.label}</dt>
            <dd className="border-b border-page pb-1.5 sm:pt-1.5">{f.value}</dd>
          </Fragment>
        ))}
      </dl>
      <h4 className="mt-5 font-semibold">Documents the client provided</h4>
      <ul className="mt-2 flex flex-col gap-2">
        {model.property.documents.map((d) => (
          <li key={d.id} className="grid gap-x-4 gap-y-1 rounded-lg border border-line p-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="min-w-0">
              <div className="font-semibold">{d.title}</div>
              <div className="break-words text-xs leading-[18px] text-muted">
                {d.fileName} · {d.pages} {d.pages === 1 ? "page" : "pages"}
              </div>
            </div>
            <div className="min-w-0">
              <span className="sr-only">What the AI read: </span>
              {d.read}
            </div>
            <div className={cx("min-w-0", d.effect === "no value effect" ? "text-muted" : "text-ink-2")}>
              <span className="text-xs font-semibold text-muted">Effect on the value: </span>
              {d.effect}
            </div>
          </li>
        ))}
      </ul>
      {model.property.missing.map((line) => (
        <p key={line} className="mt-2 text-ai">
          {line}
        </p>
      ))}
    </Section>
  );
}

function UnitsSection({ model }: { model: ReportModel }) {
  const t = model.units.total;
  const num = "whitespace-nowrap px-3 py-2 text-right align-top";
  return (
    <Section n={4}>
      <p className="mb-2 text-xs leading-[18px] text-muted md:hidden">Scroll the table sideways to see every column.</p>
      {/* A scrollable region must be reachable by keyboard. */}
      <div role="region" aria-label="Units table" tabIndex={0} className="overflow-x-auto rounded-lg border border-line">
        <table className="tnum w-full min-w-[820px] border-collapse text-[13px]">
          <caption className="sr-only">Units with in-place and market rents and their share of the value</caption>
          <thead className="bg-subtle">
            <tr>
              <th scope="col" className={TH}>#</th>
              <th scope="col" className={TH}>Unit</th>
              <th scope="col" className={TH}>Floor</th>
              <th scope="col" className={cx(TH, "text-right")}>m²</th>
              <th scope="col" className={cx(TH, "text-right")}>Rooms</th>
              <th scope="col" className={cx(TH, "text-right")}>In-place €/m²</th>
              <th scope="col" className={cx(TH, "text-right")}>In-place €/mo</th>
              <th scope="col" className={cx(TH, "text-right")}>Market €/m²</th>
              <th scope="col" className={cx(TH, "text-right")}>Market €/mo</th>
              <th scope="col" className={cx(TH, "text-right")}>Gap</th>
              <th scope="col" className={cx(TH, "text-right")}>Lease since</th>
              <th scope="col" className={cx(TH, "text-right")}>Value share</th>
            </tr>
          </thead>
          <tbody>
            {model.units.rows.map((r) => (
              <tr key={r.n} className="border-t border-page">
                <td className={TD}>{r.n}</td>
                <th scope="row" className={cx(TD, "text-left font-semibold")}>
                  {r.name}
                  {r.notes.length > 0 && (
                    <span className="block text-xs font-normal leading-4 text-muted">{r.notes.join(" · ")}</span>
                  )}
                </th>
                <td className={TD}>{r.floor}</td>
                <td className={num}>{r.area}</td>
                <td className={num}>{r.rooms}</td>
                <td className={num}>{r.inPlacePerM2}</td>
                <td className={num}>{r.inPlacePerMonth}</td>
                <td className={cx(num, r.valuerRent && "font-semibold text-valuer")}>{r.marketPerM2}</td>
                <td className={num}>{r.marketPerMonth}</td>
                <td className={num}>{r.gap}</td>
                <td className={num}>{r.leaseSince}</td>
                <td className={cx(num, "font-semibold")}>{r.valueText}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink-2 font-semibold">
              <td className={TD} />
              <th scope="row" className={cx(TD, "text-left")}>
                Total
              </th>
              <td className={TD} />
              <td className={num}>{t.area}</td>
              <td className={num} />
              <td className={num}>{t.inPlacePerM2}</td>
              <td className={num}>{t.inPlacePerMonth}</td>
              <td className={num}>{t.marketPerM2}</td>
              <td className={num}>{t.marketPerMonth}</td>
              <td className={num}>{t.gap}</td>
              <td className={num} />
              <td className={num}>{t.valueText}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-2 text-xs leading-[18px] text-muted">
        Net cold rents. Market rents are the AI&apos;s per-unit estimates unless set by the valuer. {model.units.note}
      </p>
    </Section>
  );
}

function CalculationSection({ model }: { model: ReportModel }) {
  return (
    <Section n={5}>
      <p className="text-ink-2">
        Income approach (Ertragswert), general method of § 28 ImmoWertV. Amounts per year; each line names its source.
      </p>
      {/* A list that reads as a table from md up: item, how it follows, source, amount. On a phone each line stacks. */}
      <div className="mt-3 overflow-hidden rounded-lg border border-line text-[13px] leading-[19px]">
        <div aria-hidden="true" className={cx(LIST_HEAD, CALC_COLUMNS)}>
          <span>Item</span>
          <span>How it follows</span>
          <span>Source</span>
          <span className="text-right">Amount</span>
        </div>
        <ol aria-label="How the market value is calculated">
          {model.calculation.map((row) => (
            <li
              key={row.key}
              className={cx(
                "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-page px-3 py-2 md:items-start",
                CALC_COLUMNS,
                row.emphasis === "subtotal" && "bg-subtle",
                row.emphasis === "total" && "border-t-2 border-t-ink bg-brand-weak",
              )}
            >
              <div className={cx("min-w-0", row.emphasis && "font-semibold")}>
                {row.label}
                {row.term && <span className="block text-xs font-normal italic leading-4 text-muted">{row.term}</span>}
              </div>
              <div
                className={cx(
                  "tnum whitespace-nowrap text-right md:order-4",
                  row.emphasis === "total" ? "font-display text-base font-semibold" : row.emphasis && "font-semibold",
                )}
              >
                {row.amount}
              </div>
              <div className="col-span-2 min-w-0 text-ink-2 md:order-2 md:col-span-1">{row.formula}</div>
              <div className="col-span-2 md:order-3 md:col-span-1">
                <SourceBadge type={row.sourceType} label={row.source} className="whitespace-nowrap" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

const CALC_COLUMNS = "md:grid-cols-[minmax(0,26%)_minmax(0,1fr)_150px_120px]";
const FIGURE_COLUMNS = "md:grid-cols-[minmax(0,22%)_minmax(0,15%)_150px_minmax(0,1fr)]";

function CallsSection({ model }: { model: ReportModel }) {
  return (
    <Section n={6}>
      <h4 className="font-semibold">Assumptions</h4>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2 marker:text-brand">
        {model.assumptions.map((a) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
      <h4 className="mt-5 font-semibold">AI judgement calls ({model.calls.length})</h4>
      <p className="mt-1 text-ink-2">
        Each call the AI could not settle from the documents alone, with its status: accepted, changed by valuer (with
        the note), or accepted at sign-off without opening.
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        {model.calls.map((call) => {
          const status = STATUS[call.status];
          return (
            <li key={call.id} className={cx("rounded-lg border border-l-4 border-line p-3.5", status.edge)}>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
                <div className="min-w-0">
                  <h5 className="font-semibold">
                    {call.n} · {call.title}
                  </h5>
                  <div className="text-xs leading-[18px] text-muted">AI · {call.confidence} confidence</div>
                </div>
                <Pill tone={status.tone} className="whitespace-normal">
                  {status.label}
                </Pill>
              </div>
              <p className="mt-1.5">{call.summary}</p>
              <dl className="mt-1.5 grid gap-y-1 text-[13px] leading-[19px] text-ink-2">
                <div>
                  <dt className="inline font-semibold">Why flagged: </dt>
                  <dd className="inline">{call.whyFlagged}</dd>
                </div>
                {call.changeMind && (
                  <div>
                    <dt className="inline font-semibold">What would change the AI&apos;s mind: </dt>
                    <dd className="inline">{call.changeMind}</dd>
                  </div>
                )}
                {call.support && (
                  <div>
                    <dt className="inline font-semibold">Support: </dt>
                    <dd className="inline">{call.support}</dd>
                  </div>
                )}
                {call.effect && (
                  <div>
                    <dt className="inline font-semibold">Value effect over the plausible range: </dt>
                    <dd className="inline">{call.effect}</dd>
                  </div>
                )}
              </dl>
              <p className={cx("mt-1.5 font-semibold", call.status === "changed by valuer" ? "text-valuer" : call.status === "accepted" || call.status === "accepted at sign-off" ? "text-ok" : "text-ai")}>
                {call.statusDetail}
              </p>
              {call.notes.map((note) => (
                <p key={note} className="mt-1 italic text-valuer">
                  Valuer&apos;s note: “{note}”
                </p>
              ))}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function SourcesSection({ model }: { model: ReportModel }) {
  return (
    <Section n={7}>
      <p className="text-ink-2">
        Client documents with the page and the verbatim passage each figure was read from, then the source of every
        other figure.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {model.sources.documents.map((doc) => (
          <div key={doc.id} className="rounded-lg border border-line p-3">
            <div>
              <span className="font-semibold">{doc.title}</span>
              <span className="break-words text-muted">
                {" "}
                · {doc.fileName} · {doc.pages} {doc.pages === 1 ? "page" : "pages"} · {doc.effect}
              </span>
            </div>
            {doc.citations.length === 0 ? (
              <p className="mt-1 text-xs text-muted">No passage cited.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {doc.citations.map((c, i) => (
                  <li key={`${c.what}-${i}`} className="grid gap-x-4 sm:grid-cols-[250px_minmax(0,1fr)]">
                    <span className="text-ink-2">
                      p. {c.page} · {c.what}
                    </span>
                    <span className="min-w-0">
                      <q className="italic" lang="de">
                        {c.quote}
                      </q>
                      {c.translation && <span className="block text-xs leading-[18px] text-muted">{c.translation}</span>}
                      {!c.verified && (
                        <span className="block text-xs leading-[18px] text-ai">Not found in the document&apos;s text layer</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <h4 className="mt-5 font-semibold">Figures and their sources</h4>
      {/* A list that reads as a table from md up: figure, value, source, where it comes from. */}
      <div className="mt-2 overflow-hidden rounded-lg border border-line text-[13px] leading-[19px]">
        <div aria-hidden="true" className={cx(LIST_HEAD, FIGURE_COLUMNS)}>
          <span>Figure</span>
          <span>Value</span>
          <span>Source</span>
          <span>Where it comes from</span>
        </div>
        <ul aria-label="Every figure that is not calculated, with its source">
          {model.sources.data.map((row) => (
            <li
              key={row.label}
              className={cx(
                "grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-page px-3 py-2 md:items-start",
                FIGURE_COLUMNS,
              )}
            >
              <div className="min-w-0 font-semibold md:font-normal">{row.label}</div>
              <div className="tnum text-right md:text-left">{row.value}</div>
              <div className="col-span-2 md:col-span-1">
                <SourceBadge type={row.sourceType} label={row.source} className="whitespace-nowrap" />
              </div>
              <div className="col-span-2 min-w-0 text-ink-2 md:col-span-1">{row.detail}</div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function ReviewLogSection({ model }: { model: ReportModel }) {
  return (
    <Section n={8}>
      <p className="text-ink-2">Every version of the valuation, including undone ones. Times are UTC.</p>
      <ol className="mt-2">
        {model.reviewLog.map((row) => (
          <li
            key={row.n}
            className={cx("flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-page py-2.5 first:border-t-0", row.undone && "text-muted")}
          >
            <div className="min-w-0 flex-[999_1_320px]">
              <div className={cx("font-semibold break-words", row.current && "text-brand")}>
                {row.label}
                {row.current && <span className="font-normal text-ink-2"> · in this report</span>}
              </div>
              <div className="text-xs leading-[18px] text-muted">
                {row.at} · {row.who}
                {row.readBy && ` · ${row.readBy}`}
              </div>
              {row.changes.map((change) => (
                <div key={change}>{change}</div>
              ))}
              {row.detail && (
                <div className="mt-0.5 text-xs leading-[18px] text-ink-2">{row.n === 1 ? row.detail : `AI note: ${row.detail}`}</div>
              )}
            </div>
            <div className={cx("tnum font-semibold", row.undone && "line-through")}>{row.valueText}</div>
          </li>
        ))}
      </ol>
      {model.signOff ? (
        <div className="mt-3 rounded-lg border border-ok bg-public-weak px-4 py-3">
          <div className="font-semibold">
            Signed by {model.signOff.signer}, {model.signOff.role.toLowerCase()} · version {model.signOff.version} ·{" "}
            {model.signOff.at}
          </div>
          <p className="mt-0.5 text-ink-2">
            {model.signOff.acceptedWithoutOpening.length > 0
              ? `Calls accepted at sign-off without opening: ${model.signOff.acceptedWithoutOpening.join("; ")}.`
              : "Every judgement call was reviewed before signing."}
          </p>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-ai-strong bg-ai-weak px-4 py-3">
          <div className="font-semibold text-ai">Draft — not signed</div>
          <p className="mt-0.5 text-ink-2">The senior valuer has not signed this version yet.</p>
        </div>
      )}
    </Section>
  );
}

/** The report as a page: sections 1–9 of the PDF. */
export function ReportView({ model, className }: { model: ReportModel; className?: string }) {
  return (
    <article aria-label="Valuation report" className={cx("overflow-hidden rounded-xl border border-line bg-surface", className)}>
      <Cover model={model} />
      <Section n={2}>
        <div className="flex flex-col gap-2">
          {model.summary.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </Section>
      <PropertySection model={model} />
      <UnitsSection model={model} />
      <CalculationSection model={model} />
      <CallsSection model={model} />
      <SourcesSection model={model} />
      <ReviewLogSection model={model} />
      <Section n={9}>
        <div className="rounded-lg bg-subtle px-4 py-3">
          <p className="font-semibold">{model.disclaimer}</p>
          <p className="mt-1 text-ink-2">
            Censio RE is a clickable prototype. The deal, the client, the documents, the photos and the lookup tables are
            fictitious sample data, and the senior valuer is a demo persona. Nobody should rely on this report.
          </p>
        </div>
      </Section>
    </article>
  );
}
