"use client";

/**
 * The react-leaflet parts of `<DealMap>` and `<ComparablesMap>`. Leaflet reads `window` when it is imported, so the
 * wrappers load this module with `next/dynamic` and `ssr: false`; import the wrappers, not this module.
 *
 * Every layer except the comparables is non-interactive, so `path.leaflet-interactive` counts the listings only.
 */
import { Browser, divIcon } from "leaflet";
import { AttributionControl, Circle, CircleMarker, MapContainer, Marker, Polygon, TileLayer, Tooltip } from "react-leaflet";
import type { Feature, FloorCode } from "@/lib/deal/types";
import { rentM2 } from "@/lib/format";
import { adjustedRent, type Comparable } from "@/lib/rent/estimator";
import {
  boundsAround,
  boundsOf,
  centroid,
  distanceMeters,
  isRecentListing,
  paddedOutline,
  schematicZoneOutline,
  type LatLng,
} from "./geo";

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const BRAND = "#0B5D4B";
const PUBLIC = "#0E6F67";
const LISTING = "#344054";

const FLOOR_LABELS: Record<FloorCode, string> = {
  GF: "Ground floor",
  "1F": "1st floor",
  "2F": "2nd floor",
  "3F": "3rd floor",
  "4F": "4th floor",
  attic: "Attic",
};

const FEATURE_LABELS: Record<Feature, string> = {
  balcony: "balcony",
  roof_terrace: "roof terrace",
  renovated_bath: "renovated bath",
  street: "street side",
  courtyard: "courtyard side",
};

function OsmTiles() {
  return (
    <>
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={19} />
      <AttributionControl position="bottomright" prefix={false} />
    </>
  );
}

export interface DealMapLeafletProps {
  lat: number;
  lng: number;
  plot: LatLng[];
  zone?: LatLng[];
}

/** A still mini map: the BORIS zone (dashed), the plot (filled) and a ring around it, with some streets around. */
export function DealMapLeaflet({ lat, lng, plot, zone }: DealMapLeafletProps) {
  const outline = plot.length >= 3 ? plot : null;
  const ringCenter = outline ? centroid(outline) : ([lat, lng] as LatLng);
  const zoneOutline = zone && zone.length >= 3 ? zone : schematicZoneOutline(outline ?? [ringCenter]);
  const ringRadius = outline ? Math.max(...outline.map((p) => distanceMeters(ringCenter, p))) * 1.12 : 15;
  return (
    <MapContainer
      className="censio-map censio-map--mini"
      style={{ height: "100%", width: "100%" }}
      bounds={boundsOf(paddedOutline(zoneOutline, 30))}
      zoomSnap={0.25}
      zoomControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      boxZoom={false}
      keyboard={false}
      attributionControl={false}
    >
      <OsmTiles />
      <Polygon
        positions={zoneOutline}
        interactive={false}
        color={PUBLIC}
        weight={1.2}
        dashArray="4 3"
        fillColor={PUBLIC}
        fillOpacity={0.08}
      />
      {outline && (
        <Polygon positions={outline} interactive={false} color={BRAND} weight={1} fillColor={BRAND} fillOpacity={0.9} />
      )}
      <Circle center={ringCenter} radius={ringRadius} interactive={false} color={BRAND} weight={1.5} fill={false} />
    </MapContainer>
  );
}

const subjectIcon = divIcon({ className: "censio-pin", iconSize: [16, 16], iconAnchor: [8, 8], html: "" });

function monthsAgoText(months: number): string {
  if (months <= 0) return "Listed this month";
  return `Listed ${months} month${months === 1 ? "" : "s"} ago`;
}

function ListingTooltip({ comp, center }: { comp: Comparable; center: LatLng }) {
  const older = !isRecentListing(comp);
  const distance = Math.round(distanceMeters(center, [comp.lat, comp.lng]) / 10) * 10;
  const features = comp.features.map((f) => FEATURE_LABELS[f]).join(", ");
  return (
    <Tooltip className="censio-tip" direction="auto" offset={[8, 0]} opacity={1}>
      <div className="tnum">
        <div className="font-semibold">
          {rentM2(comp.rentPerM2)} · {comp.areaM2} m²
        </div>
        <div>
          {FLOOR_LABELS[comp.floor]}
          {features ? ` · ${features}` : ""} · {distance} m away
        </div>
        <div className="text-muted">
          {monthsAgoText(comp.monthsAgo)}
          {older ? `, index-adjusted to ${rentM2(adjustedRent(comp))}` : ""}
        </div>
      </div>
    </Tooltip>
  );
}

export interface ComparablesMapLeafletProps {
  center: LatLng;
  comps: readonly Comparable[];
  radiusM: number;
  subjectLabel?: string;
}

/**
 * The comparables around the property: solid when recent, hollow when older; the radius dashed. There are no zoom
 * buttons (they would cover the listing tooltips); double-click, pinch and the keyboard (+/−, arrows) still zoom and pan.
 * One-finger dragging is off on touch devices so that the page keeps scrolling.
 */
export function ComparablesMapLeaflet({ center, comps, radiusM, subjectLabel }: ComparablesMapLeafletProps) {
  return (
    <MapContainer
      className="censio-map"
      style={{ height: "100%", width: "100%" }}
      bounds={boundsAround(center, radiusM)}
      boundsOptions={{ padding: [6, 6] }}
      zoomSnap={0.25}
      zoomControl={false}
      scrollWheelZoom={false}
      dragging={!Browser.mobile}
      attributionControl={false}
    >
      <OsmTiles />
      <Circle center={center} radius={radiusM} interactive={false} color={BRAND} weight={1.4} dashArray="5 4" fill={false} />
      {comps.map((comp) => {
        const recent = isRecentListing(comp);
        return (
          <CircleMarker
            key={comp.id}
            center={[comp.lat, comp.lng]}
            radius={5}
            color={LISTING}
            weight={1.5}
            fillColor={recent ? LISTING : "#FFFFFF"}
            fillOpacity={1}
          >
            <ListingTooltip comp={comp} center={center} />
          </CircleMarker>
        );
      })}
      <Marker position={center} icon={subjectIcon} interactive={false} keyboard={false}>
        {subjectLabel ? (
          <Tooltip permanent direction="right" offset={[10, 0]} className="censio-pin-label">
            {subjectLabel}
          </Tooltip>
        ) : null}
      </Marker>
    </MapContainer>
  );
}
