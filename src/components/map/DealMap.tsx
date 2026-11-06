"use client";

/**
 * `<DealMap lat lng plot zoneLabel />`: a still mini map of the property with OSM tiles, the plot outline, a schematic
 * BORIS zone around it and the zone label (e.g. "zone 0412 · 520 €/m²"). Leaflet is loaded on the client only
 * (`next/dynamic`, `ssr: false`); the grey backdrop stands in while tiles load or when they cannot be reached.
 *
 * The sample has no cadastral geometry: pass `samplePlotOutline(lat, lng)` from `./geo` as `plot`.
 */
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";
import "./maps.css";
import type { LatLng } from "./geo";

export interface DealMapProps {
  lat: number;
  lng: number;
  /** Plot outline, `[lat, lng]` corners. */
  plot: LatLng[];
  /** Zone label drawn on the map, e.g. "zone 0412 · 520 €/m²". */
  zoneLabel: string;
  /** BORIS zone outline; defaults to `schematicZoneOutline(plot)`. */
  zone?: LatLng[];
  /** Height in px (default 120); the map takes the width of its container. */
  height?: number;
  /** Accessible name of the map. */
  label?: string;
  className?: string;
}

const DealMapLeaflet = dynamic(() => import("./LeafletMaps").then((m) => m.DealMapLeaflet), {
  ssr: false,
  loading: () => null,
});

export function DealMap({ lat, lng, plot, zoneLabel, zone, height = 120, label, className }: DealMapProps) {
  const geometryKey = JSON.stringify([lat, lng, plot, zone ?? null]);
  return (
    <div
      data-testid="deal-map"
      role="group"
      aria-label={label ?? `Map: the plot outline inside the land-value zone (${zoneLabel})`}
      className={`relative isolate overflow-hidden rounded-lg bg-[#EEF2F6] ${className ?? ""}`}
      style={{ height }}
    >
      <DealMapLeaflet key={geometryKey} lat={lat} lng={lng} plot={plot} zone={zone} />
      <span className="pointer-events-none absolute left-1.5 top-1.5 z-[1000] rounded bg-white/85 px-1 text-[10px] font-semibold leading-4 text-public">
        {zoneLabel}
      </span>
    </div>
  );
}

export default DealMap;
