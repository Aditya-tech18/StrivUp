"use client";

/**
 * /dev/location-preview — dev-only harness for the location pieces, which
 * otherwise only render behind auth or need a real phone to exercise.
 *
 * The table is the part that matters: it runs the distance maths against
 * coordinates whose real separation is known, so a wrong earth radius or a
 * degrees/radians slip is visible at a glance rather than discovered as a
 * quest list in the wrong order.
 */

import { useState } from "react";
import { notFound } from "next/navigation";
import { LocationPinPicker } from "@/components/features/quest/LocationPinPicker";
import { formatDistance, haversineMeters, isValidCoordinate } from "@/lib/location/geo";
import { GeoDistanceTracker, formatWalked } from "@/lib/activity/geoDistance";

/**
 * Pushes a scripted sequence of fixes through a real GeoDistanceTracker by
 * standing in for watchPosition, so the accuracy gate, the stationary-drift
 * floor and the jump ceiling are exercised as shipped rather than reimplemented
 * here. Each fix is [latOffset_m, lonOffset_m, accuracy_m, secondsLater].
 */
async function runTrackerCase(
  fixes: [number, number, number, number][]
): Promise<number> {
  const BASE_LAT = 28.4506;
  const BASE_LON = 77.5847;
  const M_PER_DEG = 111_320;

  const original = navigator.geolocation.watchPosition;
  /* Held in an object rather than a plain `let`: TypeScript narrows a local
     assigned only inside a callback to `never` at the call site below. */
  const captured: { handler: PositionCallback | null } = { handler: null };
  navigator.geolocation.watchPosition = ((ok: PositionCallback) => {
    captured.handler = ok;
    return 1;
  }) as typeof navigator.geolocation.watchPosition;

  const tracker = new GeoDistanceTracker();
  tracker.start();

  let clock = Date.now();
  for (const [northM, eastM, accuracy, seconds] of fixes) {
    clock += seconds * 1000;
    captured.handler?.({
      coords: {
        latitude: BASE_LAT + northM / M_PER_DEG,
        longitude: BASE_LON + eastM / (M_PER_DEG * Math.cos((BASE_LAT * Math.PI) / 180)),
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: clock,
      toJSON: () => ({}),
    } as GeolocationPosition);
  }

  const meters = tracker.sessionMeters;
  navigator.geolocation.watchPosition = original;
  return meters;
}

/** [label, fixes, expected metres, tolerance] */
const TRACKER_CASES: [string, [number, number, number, number][], number, number][] = [
  [
    "Walking 4 × 20 m north",
    [
      [0, 0, 8, 0],
      [20, 0, 8, 15],
      [40, 0, 8, 15],
      [60, 0, 8, 15],
      [80, 0, 8, 15],
    ],
    80,
    2,
  ],
  [
    "Phone on a table (drift under 8 m)",
    [
      [0, 0, 7, 0],
      [3, 2, 7, 10],
      [-2, 4, 7, 10],
      [1, -3, 7, 10],
      [-4, 1, 7, 10],
    ],
    0,
    0.01,
  ],
  [
    "Poor fixes ignored entirely",
    [
      [0, 0, 80, 0],
      [50, 0, 90, 15],
      [100, 0, 120, 15],
    ],
    0,
    0.01,
  ],
  [
    "Tower handover jump of 400 m discarded",
    [
      [0, 0, 8, 0],
      [20, 0, 8, 15],
      [420, 0, 8, 15],
      [440, 0, 8, 15],
    ],
    40,
    2,
  ],
  [
    "Car at 90 km/h rejected as not on foot",
    [
      [0, 0, 8, 0],
      [125, 0, 8, 5],
      [250, 0, 8, 5],
    ],
    0,
    0.01,
  ],
];

/** [label, lat1, lon1, lat2, lon2, expected metres (±1%)] */
const DISTANCE_CASES: [string, number, number, number, number, number][] = [
  ["Same point", 28.4744, 77.504, 28.4744, 77.504, 0],
  ["100 m north", 28.4744, 77.504, 28.47530, 77.504, 100],
  ["1 km north", 28.4744, 77.504, 28.48340, 77.504, 1000],
  ["Bennett Univ → Pari Chowk (approx)", 28.4506, 77.5847, 28.4698, 77.5074, 7850],
  ["Delhi → Mumbai", 28.6139, 77.209, 19.076, 72.8777, 1_148_000],
  ["Equator 1° of longitude", 0, 0.5, 0, 1.5, 111_320],
];

const FORMAT_CASES = [0, 45, 99, 137, 460, 950, 1000, 1420, 9900, 10_400, 87_000];

const COORD_CASES: [string, number, number][] = [
  ["Greater Noida", 28.4744, 77.504],
  ["Null Island (empty form)", 0, 0],
  ["Latitude out of range", 91, 77],
  ["Longitude out of range", 28, 181],
  ["NaN (unparsed field)", NaN, NaN],
  ["South-west hemisphere", -33.8688, -70.6693],
];

export default function LocationPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [trackerResults, setTrackerResults] = useState<
    { label: string; expected: number; measured: number; ok: boolean }[]
  >([]);

  async function runTrackerChecks() {
    const results = [];
    for (const [label, fixes, expected, tolerance] of TRACKER_CASES) {
      const measured = await runTrackerCase(fixes);
      results.push({
        label,
        expected,
        measured,
        ok: Math.abs(measured - expected) <= tolerance,
      });
    }
    setTrackerResults(results);
  }

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-headline-lg text-on-surface">Location pieces</h1>

        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <LocationPinPicker
            latitude={latitude}
            longitude={longitude}
            onChange={({ latitude: la, longitude: lo }) => {
              setLatitude(la);
              setLongitude(lo);
            }}
          />
          <p className="mt-3 text-label-sm text-on-surface-variant" data-testid="pin-value">
            lat={latitude || "(empty)"} lon={longitude || "(empty)"}
          </p>
        </section>

        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h2 className="mb-3 text-body-lg font-bold text-on-surface">Distance check</h2>
          <table className="w-full text-left text-label-sm">
            <thead>
              <tr className="text-on-surface-variant">
                <th className="pb-2">Case</th>
                <th className="pb-2">Expected</th>
                <th className="pb-2">Measured</th>
                <th className="pb-2">Δ</th>
              </tr>
            </thead>
            <tbody data-testid="distance-table">
              {DISTANCE_CASES.map(([label, aLat, aLon, bLat, bLon, expected]) => {
                const measured = haversineMeters(aLat, aLon, bLat, bLon);
                const off = expected === 0 ? measured : Math.abs(measured - expected) / expected;
                const ok = expected === 0 ? measured < 0.5 : off < 0.01;
                return (
                  <tr key={label} className="border-t border-outline-variant">
                    <td className="py-1.5 pr-3 text-on-surface">{label}</td>
                    <td className="py-1.5 pr-3 text-on-surface-variant">
                      {Math.round(expected).toLocaleString("en-IN")} m
                    </td>
                    <td className="py-1.5 pr-3 text-on-surface-variant">
                      {Math.round(measured).toLocaleString("en-IN")} m
                    </td>
                    <td className={`py-1.5 ${ok ? "text-success" : "text-error"}`}>
                      {ok ? "ok" : `${(off * 100).toFixed(1)}% off`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h2 className="mb-3 text-body-lg font-bold text-on-surface">Wording</h2>
          <ul className="space-y-1 text-label-sm" data-testid="format-list">
            {FORMAT_CASES.map((m) => (
              <li key={m} className="text-on-surface-variant">
                <span className="text-on-surface">{m} m</span> → &ldquo;{formatDistance(m)}&rdquo;
                {" · tracker: "}
                {formatWalked(m)}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h2 className="mb-3 text-body-lg font-bold text-on-surface">GPS tracker filters</h2>
          <button
            type="button"
            onClick={runTrackerChecks}
            className="mb-3 rounded-xl bg-secondary px-3 py-2 text-body-md font-semibold text-on-secondary"
          >
            Run tracker checks
          </button>
          <ul className="space-y-1 text-label-sm" data-testid="tracker-list">
            {trackerResults.map((r) => (
              <li key={r.label} className="text-on-surface-variant">
                <span className={r.ok ? "text-success" : "text-error"}>
                  {r.ok ? "ok" : "FAIL"}
                </span>{" "}
                — {r.label}: expected {r.expected} m, got {r.measured.toFixed(1)} m
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
          <h2 className="mb-3 text-body-lg font-bold text-on-surface">Coordinate validity</h2>
          <ul className="space-y-1 text-label-sm" data-testid="coord-list">
            {COORD_CASES.map(([label, lat, lon]) => {
              const valid = isValidCoordinate(lat, lon);
              return (
                <li key={label} className="text-on-surface-variant">
                  <span className={valid ? "text-success" : "text-error"}>
                    {valid ? "valid" : "rejected"}
                  </span>{" "}
                  — {label}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
