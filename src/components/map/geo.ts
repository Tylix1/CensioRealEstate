/**
 * Small geometry helpers for the Leaflet maps. Pure, so they can be imported anywhere (server, tests, store code).
 * Distances use a local flat-earth approximation, which is exact enough within a few kilometres.
 */

export type LatLng = [number, number];

/**
 * Comparables listed within this many months are drawn solid; older ones are hollow (the rent estimator
 * index-adjusts listings older than 12 months).
 */
export const RECENT_MONTHS = 12;

export function isRecentListing(listing: { monthsAgo: number }): boolean {
  return listing.monthsAgo <= RECENT_MONTHS;
}

const METERS_PER_DEGREE_LAT = 111_320;

function metersPerDegreeLng(lat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

/** The point `east` and `north` metres away from `origin`. */
export function offsetMeters(origin: LatLng, east: number, north: number): LatLng {
  return [origin[0] + north / METERS_PER_DEGREE_LAT, origin[1] + east / metersPerDegreeLng(origin[0])];
}

/** South-west and north-east corners of the square that encloses a circle of `radiusM` around `center`. */
export function boundsAround(center: LatLng, radiusM: number): [LatLng, LatLng] {
  return [offsetMeters(center, -radiusM, -radiusM), offsetMeters(center, radiusM, radiusM)];
}

/** South-west and north-east corners of the points' bounding box. */
export function boundsOf(points: readonly LatLng[]): [LatLng, LatLng] {
  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/** Mean of the corners: good enough as the centre of a small plot. */
export function centroid(points: readonly LatLng[]): LatLng {
  const n = points.length;
  return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
}

/** The bounding box of `points`, widened by `marginM` metres on every side, as a closed outline. */
export function paddedOutline(points: readonly LatLng[], marginM: number): LatLng[] {
  const [sw, ne] = boundsOf(points);
  const [s, w] = offsetMeters(sw, -marginM, -marginM);
  const [n, e] = offsetMeters(ne, marginM, marginM);
  return [
    [n, w],
    [n, e],
    [s, e],
    [s, w],
  ];
}

/**
 * A schematic outline of the sample plot (Flurstück 123/4, 480 m²) around the map pin: about 20 m of street frontage
 * by 24 m depth, slightly turned like the street grid in the mockup. The sample has no cadastral geometry.
 */
export function samplePlotOutline(lat: number, lng: number): LatLng[] {
  const origin: LatLng = [lat, lng];
  return [
    offsetMeters(origin, -10.4, 11.6),
    offsetMeters(origin, 9.6, 12.4),
    offsetMeters(origin, 10.4, -11.6),
    offsetMeters(origin, -9.6, -12.4),
  ];
}

/**
 * A schematic land-value zone around a plot, shaped like the mockup's: a block about 100 m wide and 50 m deep with the
 * plot near its east side, slightly turned like the street grid. The sample has no BORIS geometry.
 */
export function schematicZoneOutline(plot: readonly LatLng[]): LatLng[] {
  const center = centroid(plot);
  return [
    offsetMeters(center, -68, 14),
    offsetMeters(center, 34, 21),
    offsetMeters(center, 36, -23),
    offsetMeters(center, -64, -29),
  ];
}

/** Straight-line distance in metres. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const north = (b[0] - a[0]) * METERS_PER_DEGREE_LAT;
  const east = (b[1] - a[1]) * metersPerDegreeLng((a[0] + b[0]) / 2);
  return Math.hypot(north, east);
}
