/**
 * src/lib/location/geo.ts — one place for "where is the user".
 *
 * PRIVACY POSITION (decided, not incidental): a coordinate is PII, and this
 * app never stores the user's. A fix is read from the device, used in the tab
 * that asked for it, cached for a few minutes in sessionStorage so the same
 * screen does not re-prompt, and discarded when the tab closes. Nothing here
 * writes to Supabase. Rule 2 keeps PII in profile_private; this keeps it off
 * the server altogether, which is the stronger guarantee and costs us only the
 * ability to remember a location across devices.
 *
 * Quest pins are the opposite case and deliberately so: a shop's coordinates
 * are business data the owner publishes on purpose, and they live on the quest
 * row in the clear.
 */

export interface GeoFix {
  latitude: number;
  longitude: number;
  /** Radius of 68% confidence, in metres, as the device reports it. */
  accuracy: number;
  /** Epoch ms when the device took the reading. */
  timestamp: number;
}

export type GeoErrorKind = "unsupported" | "denied" | "unavailable" | "timeout";

export class GeoError extends Error {
  readonly kind: GeoErrorKind;
  constructor(kind: GeoErrorKind, message: string) {
    super(message);
    this.name = "GeoError";
    this.kind = kind;
  }
}

/** Wording shown to the user. Each case needs a different next action. */
const MESSAGES: Record<GeoErrorKind, string> = {
  unsupported: "This browser can't share your location.",
  denied: "Location permission is blocked. Allow it in your browser settings to use this.",
  unavailable: "Your location is unavailable right now — check that location is on.",
  timeout: "Finding your location took too long. Try again somewhere with a clearer signal.",
};

export function geoErrorMessage(err: unknown): string {
  if (err instanceof GeoError) return MESSAGES[err.kind];
  return "Couldn't get your location.";
}

/**
 * One fix, as a promise.
 *
 * `enableHighAccuracy` is off by default: sorting a list by distance does not
 * need GPS-grade precision, and asking for it spins the radio and costs
 * seconds. The distance tracker turns it on, because there it is the point.
 */
export function getCurrentPosition(
  options: PositionOptions = { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 }
): Promise<GeoFix> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.reject(new GeoError("unsupported", MESSAGES.unsupported));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        }),
      (error) => {
        const kind: GeoErrorKind =
          error.code === error.PERMISSION_DENIED
            ? "denied"
            : error.code === error.POSITION_UNAVAILABLE
              ? "unavailable"
              : "timeout";
        reject(new GeoError(kind, MESSAGES[kind]));
      },
      options
    );
  });
}

/* ── Session cache ───────────────────────────────────────────────────────── */

const CACHE_KEY = "strivup:geo";
/** A person does not move far in five minutes, and a stale pin is worse than none. */
const CACHE_TTL_MS = 5 * 60_000;

/**
 * sessionStorage, not localStorage: the fix dies with the tab. Every read and
 * write is wrapped because storage throws outright in some private-browsing
 * modes, and a blocked cache must degrade to "ask again", never to a crash.
 */
export function readCachedFix(): GeoFix | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const fix = JSON.parse(raw) as GeoFix;
    if (typeof fix?.latitude !== "number" || typeof fix?.longitude !== "number") return null;
    if (Date.now() - fix.timestamp > CACHE_TTL_MS) return null;
    return fix;
  } catch {
    return null;
  }
}

export function writeCachedFix(fix: GeoFix): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(fix));
  } catch {
    /* Storage unavailable — the caller still has its fix. */
  }
}

/** Forgets the cached fix. Called when the user revokes permission. */
export function clearCachedFix(): void {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* Nothing to do. */
  }
}

/** A cached fix when one is fresh, otherwise a new reading. */
export async function getFixCached(options?: PositionOptions): Promise<GeoFix> {
  const cached = readCachedFix();
  if (cached) return cached;
  const fix = await getCurrentPosition(options);
  writeCachedFix(fix);
  return fix;
}

/* ── Maths ───────────────────────────────────────────────────────────────── */

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in METRES. Metres everywhere; format at the edge. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Human distance. Rounded to 50 m below a kilometre, because a device fix is
 * routinely 20–50 m out and "137 m away" claims a precision we do not have.
 */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters < 100) return "under 100 m away";
  if (meters < 1000) return `${Math.round(meters / 50) * 50} m away`;
  if (meters < 10_000) return `${(meters / 1000).toFixed(1)} km away`;
  return `${Math.round(meters / 1000)} km away`;
}

/** True for a coordinate pair that could exist on Earth. */
export function isValidCoordinate(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180 &&
    // Null Island. A real pin never lands exactly here, but a form that
    // defaulted two empty strings to 0 does — which is the bug that put
    // unpinned quests at the top of Near Me.
    !(lat === 0 && lon === 0)
  );
}
