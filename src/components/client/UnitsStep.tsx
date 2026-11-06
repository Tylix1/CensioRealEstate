"use client";

/**
 * C3.3 · Units (spec §5.2): the units the AI created from the tenant list, in an editable table. The client can
 * correct floor, area, rooms, rent per month, vacancy, lease start and features; every edit is marked "Changed by
 * client" (the field goes into `unit.clientEdited`, which the figure registry reads). **Add unit manually** covers
 * units the tenant list lacks, e.g. a vacant one. Each unit has a photo slot.
 *
 * Numbers accept a decimal point or a German decimal comma. A field commits each valid value as it is typed, so a
 * reload never loses an edit; an invalid entry is shown as such and reverts when the field is left.
 */
import { useEffect, useMemo, useState } from "react";
import { create } from "zustand";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { cx } from "@/components/ui/cx";
import type { EditableUnitField, Feature, FloorCode, Unit } from "@/lib/deal/types";
import { eur, num } from "@/lib/format";
import { useDemoStore, type DemoDraft } from "@/lib/store/demoStore";
import {
  FEATURE_OPTIONS,
  FLOOR_OPTIONS,
  editUnit,
  formatArea,
  monthlyRent,
  newManualUnit,
  parseNumber,
  reconcileUnits,
  restoreUnit,
  unitName,
  unitProblems,
  unitsFromTenantList,
  unitsSummary,
  type UnitPatch,
} from "./model";
import { PhotoThumb } from "./PhotoThumb";
import { addUnitPhotos, removePhoto } from "./uploads";
import { StatusNote, WizardFooter } from "./WizardParts";

/** Whether the units were re-created on the way into the step (a note says so until the step is left). */
const useRecreated = create<{ recreated: boolean }>(() => ({ recreated: false }));

/** Brings the draft's units up to date with its tenant list (see `reconcileUnits`). */
export function prepareUnits(): void {
  const draft = useDemoStore.getState().draft;
  if (!draft) return;
  const { units, recreated } = reconcileUnits(draft);
  if (units !== draft.units) useDemoStore.getState().updateDraft({ units });
  if (recreated) useRecreated.setState({ recreated: true });
}

const inputClass =
  "block min-h-11 w-full rounded-lg border px-2.5 text-right text-[13px] tnum text-ink disabled:cursor-not-allowed disabled:bg-subtle disabled:text-faint";

function fieldTone(edited: boolean, invalid: boolean): string {
  if (invalid) return "border-pen bg-surface";
  return edited ? "border-doc bg-doc-weak" : "border-line-strong bg-surface";
}

function NumberField({
  label,
  value,
  onCommit,
  format,
  accept,
  allowEmpty = false,
  disabled = false,
  placeholder,
  edited = false,
  rangeHint,
  onBlur,
  autoFocus,
}: {
  label: string;
  value: number | null;
  onCommit: (value: number | null) => void;
  format: (value: number) => string;
  /** Whether a typed number is acceptable (range, whole years, …). */
  accept: (value: number) => boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
  placeholder?: string;
  edited?: boolean;
  /** Shown while the entry is invalid, e.g. "1–2,000 m²". */
  rangeHint: string;
  onBlur?: () => void;
  autoFocus?: boolean;
}) {
  const shown = value === null || (!allowEmpty && value === 0) ? "" : format(value);
  const [text, setText] = useState<string | null>(null);
  const parsed = text === null ? null : parseNumber(text);
  const invalid =
    text !== null && (parsed === null ? !allowEmpty && text.trim() !== "" : Number.isNaN(parsed) || !accept(parsed));

  return (
    <div className="min-w-0">
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={text ?? shown}
        placeholder={placeholder}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        onFocus={() => setText(shown)}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const n = parseNumber(next);
          if (n === null) {
            if (allowEmpty) onCommit(null);
          } else if (!Number.isNaN(n) && accept(n)) {
            onCommit(n);
          }
        }}
        onBlur={() => {
          setText(null);
          onBlur?.();
        }}
        className={cx(inputClass, fieldTone(edited, invalid))}
      />
      {invalid && <span className="mt-0.5 block text-right text-[11px] leading-4 text-pen">{rangeHint}</span>}
    </div>
  );
}

/** A field's caption on small screens, where the units table becomes one card per unit (the inputs carry the names). */
function Caption({ children }: { children: string }) {
  return (
    <span
      aria-hidden="true"
      className="mb-1 block text-[11px] font-semibold uppercase leading-4 tracking-[0.04em] text-muted md:hidden"
    >
      {children}
    </span>
  );
}

const twoDecimals = (v: number) => v.toFixed(2);
const plain = (v: number) => String(Math.round(v * 100) / 100);

function UnitRows({
  unit,
  original,
  photos,
  valuationYear,
  onPatch,
  onRestore,
  onRemove,
  onAddPhotos,
}: {
  unit: Unit;
  original: Unit | undefined;
  photos: DemoDraft["photos"];
  valuationYear: number;
  onPatch: (patch: UnitPatch) => void;
  onRestore: () => void;
  onRemove: () => void;
  onAddPhotos: (files: File[]) => void;
}) {
  const name = unitName(unit);
  const manual = unit.origin === "manual";
  const edited = (field: EditableUnitField) => unit.clientEdited.includes(field);
  const [letting, setLetting] = useState(false);
  const vacant = unit.inPlaceRentPerM2 === null && !letting;
  const unitPhotos = photos.filter((p) => p.unitId === unit.id);
  const canLetFromList = !manual && original !== undefined && original.inPlaceRentPerM2 !== null;

  return (
    <tbody className="border-t border-line first:border-t-0 max-md:block">
      <tr className="align-top max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:px-3 max-md:pt-3">
        <th
          scope="row"
          className="min-w-0 bg-surface px-3 py-2 text-left font-normal max-md:col-span-2 max-md:p-0 md:sticky md:left-0 md:z-[1] md:w-[250px]"
        >
          {manual ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-ink-2">{name}</span>
              <input
                id={`unit-${unit.id}-label`}
                aria-label={`${name}: label`}
                value={unit.label}
                placeholder="Label, e.g. 4F left"
                onChange={(e) => onPatch({ field: "label", value: e.target.value })}
                className="block min-h-11 w-full rounded-lg border border-line-strong bg-surface px-2.5 text-[13px]"
              />
              <SourceBadge type="client_input" label="Added by hand" className="self-start" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 md:flex-col md:items-start md:pt-2.5">
              <span className="font-semibold text-ink">
                {unit.id.replace(/^u/, "")} · {unit.label}
              </span>
              {unit.clientEdited.length > 0 && <SourceBadge type="client_input" />}
            </div>
          )}
        </th>
        <td className="px-2 py-2 max-md:p-0">
          <Caption>Floor</Caption>
          <select
            aria-label={`${name}: floor`}
            value={unit.floor}
            onChange={(e) => onPatch({ field: "floor", value: e.target.value as FloorCode })}
            className={cx(
              "block min-h-11 w-full rounded-lg border px-2 text-[13px] text-ink",
              fieldTone(edited("floor"), false),
            )}
          >
            {FLOOR_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </td>
        <td className="px-2 py-2 max-md:p-0">
          <Caption>Area m²</Caption>
          <NumberField
            label={`${name}: area m²`}
            value={unit.areaM2}
            format={plain}
            accept={(v) => v >= 1 && v <= 2000}
            rangeHint="1–2,000 m²"
            edited={edited("areaM2")}
            onCommit={(v) => v !== null && onPatch({ field: "areaM2", value: v })}
          />
        </td>
        <td className="px-2 py-2 max-md:p-0">
          <Caption>Rooms</Caption>
          <NumberField
            label={`${name}: rooms`}
            value={unit.rooms}
            format={plain}
            accept={(v) => v >= 0.5 && v <= 50}
            rangeHint="0.5–50"
            edited={edited("rooms")}
            onCommit={(v) => v !== null && onPatch({ field: "rooms", value: v })}
          />
        </td>
        <td className="px-2 py-2 max-md:p-0">
          <Caption>Rent €/month</Caption>
          <NumberField
            key={vacant ? "vacant" : "let"}
            label={`${name}: rent € per month`}
            value={vacant ? null : monthlyRent(unit)}
            format={twoDecimals}
            accept={(v) => v >= 0 && v <= 100_000}
            rangeHint="0–100,000 €"
            disabled={vacant || !(unit.areaM2 > 0)}
            placeholder={vacant ? "Vacant" : !(unit.areaM2 > 0) ? "Area first" : "€ / month"}
            edited={edited("inPlaceRentPerM2")}
            autoFocus={letting}
            onCommit={(v) => {
              if (v === null) return;
              onPatch({ field: "rent", value: v });
              setLetting(false);
            }}
            onBlur={() => setLetting(false)}
          />
          {letting && (
            <span className="mt-0.5 block text-right text-[11px] leading-4 text-ai">
              {unit.areaM2 > 0 ? "Enter the rent" : "Enter the area, then the rent"}
            </span>
          )}
        </td>
        <td className="px-2 py-2 max-md:p-0">
          <Caption>Vacancy</Caption>
          <label className="flex min-h-11 items-center gap-2 text-[13px] md:justify-center">
            <input
              type="checkbox"
              aria-label={`${name}: vacant`}
              checked={vacant}
              onChange={(e) => {
                if (e.target.checked) {
                  setLetting(false);
                  onPatch({ field: "vacant", value: true });
                } else if (canLetFromList) {
                  onPatch({ field: "vacant", value: false });
                } else {
                  setLetting(true);
                }
              }}
              className="size-4 accent-[#1849A9]"
            />
            <span aria-hidden="true" className="md:sr-only">
              Vacant
            </span>
          </label>
        </td>
        <td className="px-2 py-2 max-md:p-0">
          <Caption>Lease since</Caption>
          <NumberField
            key={vacant ? "vacant" : "let"}
            label={`${name}: lease since`}
            value={vacant ? null : unit.leaseSinceYear}
            format={String}
            accept={(v) => Number.isInteger(v) && v >= 1900 && v <= valuationYear}
            allowEmpty
            rangeHint={`A year, 1900–${valuationYear}`}
            disabled={vacant}
            placeholder={vacant ? "—" : "Year"}
            edited={edited("leaseSinceYear")}
            onCommit={(v) => onPatch({ field: "leaseSinceYear", value: v })}
          />
        </td>
        <td className="px-3 py-2 text-right max-md:col-span-2 max-md:p-0 max-md:text-left max-md:empty:hidden">
          {manual ? (
            <Button variant="ghost" onClick={onRemove} className="max-md:-ml-3.5">
              Remove<span className="sr-only"> {name}</span>
            </Button>
          ) : (
            unit.clientEdited.length > 0 &&
            original && (
              <Button
                variant="ghost"
                onClick={onRestore}
                title="Back to the values in the tenant list"
                className="max-md:-ml-3.5"
              >
                Restore<span className="sr-only"> {name} from the tenant list</span>
              </Button>
            )
          )}
        </td>
      </tr>
      <tr className="max-md:block">
        <td colSpan={8} className="px-3 pb-3 max-md:block max-md:pt-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <fieldset className="min-w-0">
              <legend className="sr-only">Features of {name}</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                <span aria-hidden="true" className="mr-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                  Features
                </span>
                {FEATURE_OPTIONS.map((f) => (
                  <label
                    key={f.value}
                    className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-surface px-3 text-[13px] text-ink-2 has-checked:border-doc has-checked:bg-doc-weak has-checked:text-doc"
                  >
                    <input
                      type="checkbox"
                      aria-label={`${name}: ${f.label.toLowerCase()}`}
                      checked={unit.features.includes(f.value)}
                      onChange={(e) => {
                        const features: Feature[] = e.target.checked
                          ? [...unit.features, f.value]
                          : unit.features.filter((x) => x !== f.value);
                        onPatch({ field: "features", value: features });
                      }}
                      className="size-3.5 accent-[#1849A9]"
                    />
                    <span aria-hidden="true">{f.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span aria-hidden="true" className="mr-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
                Photos
              </span>
              {unitPhotos.map((p) => (
                <span key={p.id} className="flex items-center">
                  <PhotoThumb photoId={p.id} alt={`${name}: ${p.fileName}`} size={44} />
                  <button
                    type="button"
                    onClick={() => removePhoto(p.id)}
                    aria-label={`Remove photo ${p.fileName}`}
                    className="flex size-11 items-center justify-center rounded-lg text-lg text-ink-2 hover:bg-subtle hover:text-ink"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </span>
              ))}
              <input
                id={`unit-${unit.id}-photo`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="peer sr-only"
                onChange={(e) => {
                  onAddPhotos(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
              <label
                htmlFor={`unit-${unit.id}-photo`}
                className="flex min-h-11 cursor-pointer items-center gap-1 rounded-lg border border-dashed border-line-strong px-3 text-[13px] font-semibold text-ink-2 hover:border-doc hover:text-doc peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand"
              >
                <span aria-hidden="true">+</span> Add photo<span className="sr-only"> for {name}</span>
              </label>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

export function UnitsStep({ draft, onBack, onNext }: { draft: DemoDraft; onBack: () => void; onNext: () => void }) {
  const recreated = useRecreated((s) => s.recreated);
  const [showProblems, setShowProblems] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [focusUnit, setFocusUnit] = useState<string | null>(null);

  // Normally done on the way in (Next on the documents step); this covers a reload or an older saved draft.
  useEffect(() => {
    prepareUnits();
    return () => useRecreated.setState({ recreated: false });
  }, []);

  useEffect(() => {
    if (focusUnit) document.getElementById(`unit-${focusUnit}-label`)?.focus();
  }, [focusUnit]);

  const { skeleton, documents, extractions, photos } = draft;
  const originals = useMemo(
    () => new Map(unitsFromTenantList({ skeleton, documents, extractions, photos }).map((u) => [u.id, u])),
    [skeleton, documents, extractions, photos],
  );
  const units = draft.units ?? [];
  const extractedCount = units.filter((u) => u.origin === "extracted").length;
  const tenantListRead = documents.some((d) => d.status === "done" && extractions[d.id]?.result.tenantList);
  const summary = unitsSummary(units);
  const problems = showProblems ? unitProblems(units) : [];
  const valuationYear = Number.parseInt(skeleton.valuationDate.slice(0, 4), 10) || 2026;

  const setUnits = (update: (units: Unit[]) => Unit[]) => {
    const current = useDemoStore.getState().draft;
    if (current) useDemoStore.getState().updateDraft({ units: update(current.units ?? []) });
  };
  const patchUnit = (id: string, patch: UnitPatch) =>
    setUnits((list) => list.map((u) => (u.id === id ? editUnit(u, patch, u.origin === "extracted" ? originals.get(id) : undefined) : u)));

  const addManualUnit = () => {
    const current = useDemoStore.getState().draft;
    const unit = newManualUnit(current?.units ?? []);
    setUnits((list) => [...list, unit]);
    setFocusUnit(unit.id);
  };

  const removeUnit = (id: string) => {
    const current = useDemoStore.getState().draft;
    if (!current) return;
    useDemoStore.getState().updateDraft({
      units: (current.units ?? []).filter((u) => u.id !== id),
      // Its photos stay with the request, as photos of the building.
      photos: current.photos.map((p) => (p.unitId === id ? { ...p, unitId: null } : p)),
    });
  };

  const next = () => {
    if (unitProblems(useDemoStore.getState().draft?.units ?? []).length > 0) {
      setShowProblems(true);
      return;
    }
    onNext();
  };

  const intro = !tenantListRead
    ? "No tenant list was read, so the AI could not create the units. Add them by hand below."
    : extractedCount === 0
      ? "The AI found no units in your tenant list. Add them by hand below."
      : `The AI created ${extractedCount} ${extractedCount === 1 ? "unit" : "units"} from your tenant list.`;

  return (
    <div className="flex flex-col gap-4">
      <Card as="section" aria-labelledby="units-table-title" className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 py-3.5">
          <div className="min-w-0 flex-[999_1_420px]">
            <p id="units-table-title" className="text-base font-semibold">
              {intro}
            </p>
            <p className="mt-0.5 text-xs leading-[18px] text-muted">
              {units.length === 0 ? (
                "Add each unit with its floor, area, rooms and net cold rent per month; tick Vacant for an empty one."
              ) : (
                <>
                  Check them against your records. What you change is marked <q>Changed by client</q> and shown to the
                  senior valuer. Rents are net cold rents per month; the AI estimates the market rents later.
                </>
              )}
            </p>
          </div>
          <Button onClick={addManualUnit}>
            <span aria-hidden="true">+</span> Add unit manually
          </Button>
        </div>
        {recreated && (
          <p className="mx-4 mb-3 rounded-lg bg-rule-weak px-3 py-2 text-[13px] text-ink-2">
            The tenant list changed, so the AI created its units again. Units you added by hand are kept.
          </p>
        )}
        <StatusNote message={notice} tone="warn" onDismiss={() => setNotice(null)} boxClassName="mx-4 mb-3" />

        {units.length > 0 && (
          <div className="relative border-t border-line md:overflow-x-auto">
            <table className="w-full border-collapse max-md:block md:min-w-[960px]">
              <thead className="max-md:hidden">
                <tr className="bg-subtle text-left text-xs font-semibold leading-4 text-muted">
                  <th scope="col" className="sticky left-0 z-[1] w-[250px] bg-subtle px-3 py-2">
                    Unit
                  </th>
                  <th scope="col" className="w-[124px] px-2 py-2">
                    Floor
                  </th>
                  <th scope="col" className="w-[96px] px-2 py-2 text-right">
                    m²
                  </th>
                  <th scope="col" className="w-[84px] px-2 py-2 text-right">
                    Rooms
                  </th>
                  <th scope="col" className="w-[128px] px-2 py-2 text-right">
                    Rent €/month
                  </th>
                  <th scope="col" className="w-[76px] px-2 py-2 text-center">
                    Vacant
                  </th>
                  <th scope="col" className="w-[104px] px-2 py-2 text-right">
                    Lease since
                  </th>
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              {units.map((unit) => (
                <UnitRows
                  key={unit.id}
                  unit={unit}
                  original={originals.get(unit.id)}
                  photos={photos}
                  valuationYear={valuationYear}
                  onPatch={(patch) => patchUnit(unit.id, patch)}
                  onRestore={() => {
                    const original = originals.get(unit.id);
                    if (original) setUnits((list) => list.map((u) => (u.id === unit.id ? restoreUnit(u, original) : u)));
                  }}
                  onRemove={() => removeUnit(unit.id)}
                  onAddPhotos={(files) => setNotice(addUnitPhotos(unit.id, files))}
                />
              ))}
              <tfoot className="max-md:block">
                <tr className="border-t border-line bg-page text-[13px] font-bold tnum max-md:flex max-md:flex-wrap max-md:gap-x-4 max-md:px-3 max-md:py-2.5">
                  <th scope="row" className="bg-page px-3 py-2.5 text-left max-md:p-0 md:sticky md:left-0 md:z-[1]">
                    Total · {summary.count} {summary.count === 1 ? "unit" : "units"}
                  </th>
                  <td className="px-2 py-2.5 max-md:hidden" />
                  <td className="px-2 py-2.5 text-right max-md:p-0">{formatArea(summary.areaM2)} m²</td>
                  <td className="px-2 py-2.5 max-md:hidden" />
                  <td className="px-2 py-2.5 text-right max-md:p-0">
                    {eur(summary.rentPerMonth, { decimals: 2 })}
                    <span className="font-normal text-ink-2 md:sr-only"> per month</span>
                  </td>
                  <td className="px-2 py-2.5 text-center font-normal text-ink-2 max-md:p-0 max-md:empty:hidden">
                    {summary.vacant > 0 ? `${num(summary.vacant)} vacant` : null}
                  </td>
                  <td className="px-2 py-2.5 max-md:hidden" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <WizardFooter onBack={onBack} problems={problems}>
        <Button variant="primary" onClick={next}>
          Next<span aria-hidden="true">→</span>
        </Button>
      </WizardFooter>
    </div>
  );
}
