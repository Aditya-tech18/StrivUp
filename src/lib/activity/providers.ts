/**
 * src/lib/activity/providers.ts — activity provider abstraction (SERVER ONLY).
 *
 * This file must never be imported into a client component: it reads client
 * secrets from the environment.
 *
 * WHY THIS ABSTRACTION EXISTS
 * ---------------------------
 * A browser cannot count steps in the background. DeviceMotion only fires
 * while the page is visible, service workers cannot touch motion sensors, and
 * there is no web API for HealthKit or Health Connect. The way every real
 * fitness app gets "background" steps is that the phone's motion coprocessor
 * accumulates them continuously and the app reads the total afterwards.
 *
 * So STRIVUP does the same thing: the provider accumulates, we pull. Every
 * provider — an OAuth service today, a native HealthKit bridge later —
 * implements this one interface and returns NormalizedActivity[]. Nothing
 * downstream of `fetchActivity` knows or cares which it was.
 *
 * To add a native bridge later: implement ActivityProvider with
 * `kind: "native"`, have the wrapper POST its readings to /api/activity/sync,
 * and register it below. No change to the schema, the progress engine, or any
 * UI is required.
 */

import type {
  ActivityProviderId,
  ActivitySource,
  ActivityType,
  NormalizedActivity,
} from "./types";

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  externalUserId: string | null;
  scopes: string[];
}

export interface FetchWindow {
  /** Inclusive start date, YYYY-MM-DD in the user's timezone. */
  from: string;
  /** Inclusive end date, YYYY-MM-DD in the user's timezone. */
  to: string;
  timezone: string;
}

export interface ActivityProvider {
  id: ActivityProviderId;
  label: string;
  source: ActivitySource;
  /** One line shown on the connect card. */
  description: string;
  /** "oauth" pulls from a web API; "native" is pushed by a device bridge. */
  kind: "oauth" | "native";
  supports: ActivityType[];
  /** True when the env vars this provider needs are actually present. */
  isConfigured(): boolean;
  buildAuthUrl(state: string, redirectUri: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  fetchActivity(accessToken: string, window: FetchWindow): Promise<NormalizedActivity[]>;
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

function basicAuth(id: string, secret: string): string {
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

/** Midnight-to-midnight bounds for a local date, as ISO instants. */
function dayBounds(date: string): { start: string; end: string } {
  return {
    start: new Date(`${date}T00:00:00.000Z`).toISOString(),
    end: new Date(`${date}T23:59:59.999Z`).toISOString(),
  };
}

async function jsonOrThrow(res: Response, what: string): Promise<unknown> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${what} failed: ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

/* ── Fitbit ──────────────────────────────────────────────────────────────────
 *
 * Fitbit is the primary provider: it exposes a daily step total per date,
 * which maps exactly onto a "5,000 steps today" quest task. The watch or phone
 * counts in the background; we read the total.
 */

const fitbit: ActivityProvider = {
  id: "fitbit",
  label: "Fitbit",
  source: "FITBIT",
  description: "Daily step totals from your Fitbit device or phone app.",
  kind: "oauth",
  supports: ["steps", "walking", "running", "distance", "duration"],

  isConfigured: () => Boolean(env("FITBIT_CLIENT_ID") && env("FITBIT_CLIENT_SECRET")),

  buildAuthUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: env("FITBIT_CLIENT_ID")!,
      response_type: "code",
      scope: "activity profile",
      redirect_uri: redirectUri,
      state,
    });
    return `https://www.fitbit.com/oauth2/authorize?${p.toString()}`;
  },

  async exchangeCode(code, redirectUri) {
    const res = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(env("FITBIT_CLIENT_ID")!, env("FITBIT_CLIENT_SECRET")!)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const j = (await jsonOrThrow(res, "Fitbit token exchange")) as Record<string, unknown>;
    return {
      accessToken: String(j.access_token),
      refreshToken: j.refresh_token ? String(j.refresh_token) : null,
      expiresAt: j.expires_in
        ? new Date(Date.now() + Number(j.expires_in) * 1000).toISOString()
        : null,
      externalUserId: j.user_id ? String(j.user_id) : null,
      scopes: String(j.scope ?? "").split(" ").filter(Boolean),
    };
  },

  async refresh(refreshToken) {
    const res = await fetch("https://api.fitbit.com/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth(env("FITBIT_CLIENT_ID")!, env("FITBIT_CLIENT_SECRET")!)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const j = (await jsonOrThrow(res, "Fitbit token refresh")) as Record<string, unknown>;
    return {
      accessToken: String(j.access_token),
      refreshToken: j.refresh_token ? String(j.refresh_token) : refreshToken,
      expiresAt: j.expires_in
        ? new Date(Date.now() + Number(j.expires_in) * 1000).toISOString()
        : null,
      externalUserId: j.user_id ? String(j.user_id) : null,
      scopes: String(j.scope ?? "").split(" ").filter(Boolean),
    };
  },

  async fetchActivity(accessToken, window) {
    const res = await fetch(
      `https://api.fitbit.com/1/user/-/activities/steps/date/${window.from}/${window.to}.json`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const j = (await jsonOrThrow(res, "Fitbit steps fetch")) as {
      "activities-steps"?: { dateTime: string; value: string }[];
    };

    return (j["activities-steps"] ?? []).map((d) => {
      const bounds = dayBounds(d.dateTime);
      return {
        /* Stable across every resync of the same day — this is what makes
           ingestion idempotent (spec §28). */
        dedupe_key: `steps:${d.dateTime}`,
        external_id: null,
        activity_type: "steps" as ActivityType,
        granularity: "daily" as const,
        local_date: d.dateTime,
        started_at: bounds.start,
        ended_at: bounds.end,
        steps: Number.parseInt(d.value, 10) || 0,
        distance_m: 0,
        duration_s: 0,
        calories: 0,
        raw: d,
      };
    });
  },
};

/* ── Strava ──────────────────────────────────────────────────────────────────
 *
 * Strava has no daily step total — it has discrete recorded activities. It is
 * therefore the distance/duration provider, and demonstrates that the
 * abstraction is not secretly step-shaped.
 */

const strava: ActivityProvider = {
  id: "strava",
  label: "Strava",
  source: "STRAVA",
  description: "Runs, rides and walks you record with Strava.",
  kind: "oauth",
  supports: ["running", "cycling", "walking", "distance", "duration"],

  isConfigured: () => Boolean(env("STRAVA_CLIENT_ID") && env("STRAVA_CLIENT_SECRET")),

  buildAuthUrl(state, redirectUri) {
    const p = new URLSearchParams({
      client_id: env("STRAVA_CLIENT_ID")!,
      response_type: "code",
      redirect_uri: redirectUri,
      approval_prompt: "auto",
      scope: "activity:read",
      state,
    });
    return `https://www.strava.com/oauth/authorize?${p.toString()}`;
  },

  async exchangeCode(code) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("STRAVA_CLIENT_ID")!,
        client_secret: env("STRAVA_CLIENT_SECRET")!,
        code,
        grant_type: "authorization_code",
      }),
    });
    const j = (await jsonOrThrow(res, "Strava token exchange")) as Record<string, unknown>;
    const athlete = j.athlete as { id?: number } | undefined;
    return {
      accessToken: String(j.access_token),
      refreshToken: j.refresh_token ? String(j.refresh_token) : null,
      expiresAt: j.expires_at ? new Date(Number(j.expires_at) * 1000).toISOString() : null,
      externalUserId: athlete?.id ? String(athlete.id) : null,
      scopes: ["activity:read"],
    };
  },

  async refresh(refreshToken) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("STRAVA_CLIENT_ID")!,
        client_secret: env("STRAVA_CLIENT_SECRET")!,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const j = (await jsonOrThrow(res, "Strava token refresh")) as Record<string, unknown>;
    return {
      accessToken: String(j.access_token),
      refreshToken: j.refresh_token ? String(j.refresh_token) : refreshToken,
      expiresAt: j.expires_at ? new Date(Number(j.expires_at) * 1000).toISOString() : null,
      externalUserId: null,
      scopes: ["activity:read"],
    };
  },

  async fetchActivity(accessToken, window) {
    const after = Math.floor(new Date(`${window.from}T00:00:00Z`).getTime() / 1000);
    const before = Math.floor(new Date(`${window.to}T23:59:59Z`).getTime() / 1000);
    const res = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const list = (await jsonOrThrow(res, "Strava activity fetch")) as {
      id: number;
      type: string;
      start_date: string;
      elapsed_time: number;
      moving_time: number;
      distance: number;
      calories?: number;
    }[];

    const typeMap: Record<string, ActivityType> = {
      Run: "running",
      Walk: "walking",
      Hike: "walking",
      Ride: "cycling",
      VirtualRide: "cycling",
    };

    return list.map((a) => {
      const started = new Date(a.start_date);
      const ended = new Date(started.getTime() + (a.elapsed_time ?? 0) * 1000);
      return {
        dedupe_key: `strava:${a.id}`,
        external_id: String(a.id),
        activity_type: typeMap[a.type] ?? ("workout" as ActivityType),
        granularity: "session" as const,
        local_date: started.toISOString().slice(0, 10),
        started_at: started.toISOString(),
        ended_at: ended.toISOString(),
        steps: 0,
        distance_m: Math.round(a.distance ?? 0),
        duration_s: a.moving_time ?? a.elapsed_time ?? 0,
        calories: a.calories ?? 0,
        raw: a,
      };
    });
  },
};

/* ── Registry ────────────────────────────────────────────────────────────── */

const REGISTRY: Record<string, ActivityProvider> = {
  fitbit,
  strava,
};

export function getProvider(id: string): ActivityProvider | null {
  return REGISTRY[id] ?? null;
}

/** Every provider whose credentials are actually present in this deployment. */
export function configuredProviders(): ActivityProvider[] {
  return Object.values(REGISTRY).filter((p) => p.isConfigured());
}

/** All providers, configured or not — the settings page greys out the rest. */
export function allProviders(): ActivityProvider[] {
  return Object.values(REGISTRY);
}

export function redirectUriFor(providerId: string, origin: string): string {
  return `${origin}/api/activity/callback/${providerId}`;
}
