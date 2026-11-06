"use client";

/**
 * C3.1 · Property (spec §5.2): usage type and scope, the address with a map preview (prefilled with the sample), and
 * the basis and valuation date, read-only. The prototype computes the Living whole-building sample only: choosing
 * Commercial, Hotel or a single unit says so, and the request continues with the sample.
 */
import { useState } from "react";
import { DealMap } from "@/components/map/DealMap";
import { samplePlotOutline } from "@/components/map/geo";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SAMPLE_SKELETON } from "@/lib/data/seed";
import type { Deal } from "@/lib/deal/types";
import { num } from "@/lib/format";
import { lookupLandValue } from "@/lib/lookups/boris";
import { useDemoStore, type DemoDraft } from "@/lib/store/demoStore";
import { WizardFooter } from "./WizardParts";

export const SAMPLE_ONLY_NOTE = "Prototype computes the Living whole-building sample only — continue with sample";

const USAGE: { value: Deal["usageType"]; label: string }[] = [
  { value: "living", label: "Living" },
  { value: "commercial", label: "Commercial" },
  { value: "hotel", label: "Hotel" },
];

const SCOPE: { value: Deal["scope"]; label: string }[] = [
  { value: "building", label: "Whole building" },
  { value: "unit", label: "Single unit" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "06 Nov 2026" from an ISO date (as written; no clock). */
function dateLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}` : iso;
}

type AddressField = "street" | "zip" | "city";

function addressProblems(address: DemoDraft["skeleton"]["address"]): Partial<Record<AddressField, string>> {
  const problems: Partial<Record<AddressField, string>> = {};
  if (!address.street.trim()) problems.street = "Enter the street and number.";
  if (!/^\d{5}$/.test(address.zip.trim())) problems.zip = "Enter a German ZIP code (5 digits).";
  if (!address.city.trim()) problems.city = "Enter the city.";
  return problems;
}

const fieldClass = "mt-1 block min-h-11 w-full rounded-lg border bg-surface px-3 text-sm text-ink";

function Choice<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-xs font-semibold uppercase leading-4 tracking-[0.04em] text-muted">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 font-semibold has-checked:border-brand has-checked:bg-brand-weak has-checked:text-brand"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="size-4 accent-[#0B5D4B]"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PropertyStep({ draft, onNext }: { draft: DemoDraft; onNext: () => void }) {
  const { skeleton } = draft;
  const [showProblems, setShowProblems] = useState(false);
  const problems = addressProblems(skeleton.address);
  const sampleOnly = skeleton.usageType !== "living" || skeleton.scope !== "building";
  const land = lookupLandValue(skeleton.address.zip);
  const { lat, lng } = skeleton.address;
  const isSampleAddress =
    skeleton.address.street.trim() === SAMPLE_SKELETON.address.street &&
    skeleton.address.zip.trim() === SAMPLE_SKELETON.address.zip;

  const patchSkeleton = (patch: Partial<DemoDraft["skeleton"]>) => {
    const current = useDemoStore.getState().draft;
    if (current) useDemoStore.getState().updateDraft({ skeleton: { ...current.skeleton, ...patch } });
  };
  const patchAddress = (field: AddressField, value: string) => {
    const current = useDemoStore.getState().draft;
    if (current) patchSkeleton({ address: { ...current.skeleton.address, [field]: value } });
  };

  const next = () => {
    if (Object.keys(problems).length > 0) {
      setShowProblems(true);
      return;
    }
    // Trim the address, and continue with the sample when another usage or scope was chosen.
    const a = skeleton.address;
    patchSkeleton({
      usageType: "living",
      scope: "building",
      address: { ...a, street: a.street.trim(), zip: a.zip.trim(), city: a.city.trim() },
    });
    onNext();
  };

  const field = (name: AddressField, label: string, autoComplete: string, extra?: string) => {
    const problem = showProblems ? problems[name] : undefined;
    return (
      <label className={`block min-w-0 ${extra ?? ""}`}>
        <span className="text-xs font-semibold leading-4 text-ink-2">{label}</span>
        <input
          value={skeleton.address[name]}
          onChange={(e) => patchAddress(name, e.target.value)}
          autoComplete={autoComplete}
          inputMode={name === "zip" ? "numeric" : undefined}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `address-${name}-problem` : undefined}
          className={`${fieldClass} ${problem ? "border-pen" : "border-line-strong"}`}
        />
        {problem && (
          <span id={`address-${name}-problem`} className="mt-1 block text-xs text-pen">
            {problem}
          </span>
        )}
      </label>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap gap-x-8 gap-y-6 p-4 sm:p-5">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-5">
          <div className="text-ink-2">
            <span className="font-semibold text-ink">Demo Capital GmbH</span> · buy-side · requests a market value for
            the property below.
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Choice
              legend="Usage type"
              name="usage"
              options={USAGE}
              value={skeleton.usageType}
              onChange={(usageType) => patchSkeleton({ usageType })}
            />
            <Choice
              legend="Scope"
              name="scope"
              options={SCOPE}
              value={skeleton.scope}
              onChange={(scope) => patchSkeleton({ scope })}
            />
          </div>
          {sampleOnly && (
            <p className="flex items-start gap-2 rounded-lg bg-ai-weak px-3 py-2 text-[13px] leading-[19px] text-ai">
              <span aria-hidden="true" className="font-bold">
                !
              </span>
              <span>{SAMPLE_ONLY_NOTE}</span>
            </p>
          )}

          <fieldset className="min-w-0 max-w-[600px]">
            <legend className="text-xs font-semibold uppercase leading-4 tracking-[0.04em] text-muted">Address</legend>
            <div className="mt-2 grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-3 gap-y-3">
              {field("street", "Street and number", "address-line1", "col-span-2")}
              {field("zip", "ZIP code", "postal-code")}
              {field("city", "City", "address-level2")}
            </div>
          </fieldset>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-lg bg-subtle px-3 py-3 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs font-semibold leading-4 text-muted">Basis</dt>
              <dd className="mt-0.5">Market value (§ 194 BauGB)</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold leading-4 text-muted">Valuation date</dt>
              <dd className="mt-0.5">{dateLabel(skeleton.valuationDate)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold leading-4 text-muted">Scope of work</dt>
              <dd className="mt-0.5">Desktop valuation, no internal inspection</dd>
            </div>
          </dl>
        </div>

        <figure className="m-0 min-w-0 flex-[1_1_280px]">
          <DealMap
            lat={lat}
            lng={lng}
            plot={samplePlotOutline(lat, lng)}
            zoneLabel={
              land.zone === "n/a" ? "No sample land value for this ZIP" : `zone ${land.zone} · ${num(land.valuePerM2)} €/m²`
            }
            height={240}
            label={`Map preview of ${skeleton.address.street}, ${skeleton.address.zip} ${skeleton.address.city}`}
          />
          <figcaption className="mt-1.5 text-xs leading-[18px] text-muted">
            {isSampleAddress
              ? "Map pin approximate · sample. Plot and BORIS land-value zone are schematic."
              : "This prototype has no address lookup: the map shows the sample location (approximate · sample)."}
          </figcaption>
        </figure>
      </Card>

      <WizardFooter
        problems={showProblems && Object.keys(problems).length > 0 ? ["Check the address."] : []}
        hint={sampleOnly ? "The request continues with the Living whole-building sample." : null}
      >
        <Button variant="primary" onClick={next}>
          {sampleOnly ? "Continue with sample" : "Next"}
          <span aria-hidden="true">→</span>
        </Button>
      </WizardFooter>
    </div>
  );
}
