"use client";

/**
 * `<ComparablesMap center comps radiusM />`: the rental comparables around the property on OSM tiles, as
 * `CircleMarker`s that are filled for listings of the last 12 months and hollow for older (index-adjusted) ones, with
 * the search radius dashed and the property as a brand square. Hovering or tapping a listing shows its rent, size,
 * floor, age and distance. A legend with glyphs, words and counts sits below the map.
 *
 * Leaflet is loaded on the client only (`next/dynamic`, `ssr: false`); the grey backdrop stands in while tiles load or
 * when they cannot be reached.
 */
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import "./maps.css";
import { num } from "@/lib/format";
import type { Comparable } from "@/lib/rent/estimator";
import { isRecentListing, type LatLng } from "./geo";

export interface ComparablesMapProps {
  /** The property, `[lat, lng]`. */
  center: LatLng;
  comps: readonly Comparable[];
  /** Search radius in metres (default 1000). */
  radiusM?: number;
  /** Height of the map in px (default 280); the map takes the width of its container. */
  height?: number;
  /** Label next to the property marker, e.g. "Musterstraße 12". */
  subjectLabel?: string;
  /** Show the legend below the map (default true). */
  legend?: boolean;
  className?: string;
}

const ComparablesMapLeaflet = dynamic(() => import("./LeafletMaps").then((m) => m.ComparablesMapLeaflet), {
  ssr: false,
  loading: () => null,
});

function radiusText(radiusM: number): string {
  return radiusM >= 1000 ? `${num(radiusM / 1000, radiusM % 1000 === 0 ? 0 : 1)} km` : `${num(radiusM)} m`;
}

function Glyph({ kind }: { kind: "recent" | "older" | "subject" | "radius" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0">
      {kind === "recent" && <circle cx="7" cy="7" r="4.5" fill="#344054" stroke="#344054" strokeWidth="1.5" />}
      {kind === "older" && <circle cx="7" cy="7" r="4.5" fill="#FFFFFF" stroke="#344054" strokeWidth="1.5" />}
      {kind === "subject" && <rect x="2" y="2" width="10" height="10" rx="2" fill="#0B5D4B" />}
      {kind === "radius" && (
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="#0B5D4B" strokeWidth="1.4" strokeDasharray="3 2" />
      )}
    </svg>
  );
}

export function ComparablesMap({
  center,
  comps,
  radiusM = 1000,
  height = 280,
  subjectLabel,
  legend = true,
  className,
}: ComparablesMapProps) {
  const recent = comps.filter(isRecentListing).length;
  const older = comps.length - recent;
  const radius = radiusText(radiusM);
  return (
    <div data-testid="comparables-map" className={`min-w-0 ${className ?? ""}`}>
      <div
        role="group"
        aria-label={`Map of ${comps.length} comparable rental listings within ${radius} of ${subjectLabel ?? "the property"}`}
        className="relative isolate overflow-hidden rounded-lg bg-[#EEF2F6]"
        style={{ height }}
      >
        <ComparablesMapLeaflet
          key={`${center[0]},${center[1]},${radiusM}`}
          center={center}
          comps={comps}
          radiusM={radiusM}
          subjectLabel={subjectLabel}
        />
      </div>
      {legend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
          <li className="flex items-center gap-1.5">
            <Glyph kind="recent" />
            Listed in the last 12 months ({recent})
          </li>
          <li className="flex items-center gap-1.5">
            <Glyph kind="older" />
            Older, index-adjusted ({older})
          </li>
          <li className="flex items-center gap-1.5">
            <Glyph kind="subject" />
            {subjectLabel ?? "The property"}
          </li>
          <li className="flex items-center gap-1.5">
            <Glyph kind="radius" />
            {radius} radius
          </li>
        </ul>
      )}
    </div>
  );
}

export default ComparablesMap;
