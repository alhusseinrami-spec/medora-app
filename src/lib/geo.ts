// Distances on the ground, for visit verification and route ordering.
export type Point = { lat: number; lng: number };

export function distanceM(a: Point, b: Point): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// A check-in counts as verified when the rep stood within this many metres of the client,
// and the phone's fix was at least this accurate.
export const VERIFY_RADIUS_M = 150;
export const MAX_ACCURACY_M = 100;

// Greedy nearest-next ordering from a start point. Good enough for a day's route of a few dozen stops.
export function nearestRoute<T extends { lat: number | null; lng: number | null }>(start: Point, stops: T[]): T[] {
  const located = stops.filter((s): s is T & Point => s.lat != null && s.lng != null);
  const rest = stops.filter((s) => s.lat == null || s.lng == null);
  const out: T[] = [];
  let here = start;
  const left = [...located];
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceM(here, left[i]) < distanceM(here, left[best])) best = i;
    const [next] = left.splice(best, 1);
    out.push(next);
    here = next;
  }
  return [...out, ...rest];
}

export const fmtDistance = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`);
