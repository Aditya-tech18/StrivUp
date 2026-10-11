"use client";

import { useState } from "react";
import { Crosshair, Loader2, MapPin, X } from "lucide-react";
import {
  GeoError,
  geoErrorMessage,
  getCurrentPosition,
  isValidCoordinate,
} from "@/lib/location/geo";

/**
 * LocationPinPicker — gives a quest its map pin.
 *
 * WHY THIS EXISTS. The pin was two `<input type="number">` fields labelled
 * "Latitude" and "Longitude", with the hint "Enter decimal coordinates (e.g.
 * 40.7829)". Nobody running a shop knows their coordinates to four decimal
 * places, and the live data showed it: every quest in the database has a
 * location_name and not one has a pin. Near Me therefore had nothing to sort
 * and said so in a banner — the feature looked broken when it was only
 * starved.
 *
 * So the primary action is "Use my current location", which is exact when the
 * quest is created at the venue, and that is the common case for a shop
 * offering a deal. The manual fields stay for the rest: a pin copied from a
 * maps app, or a correction.
 *
 * The accuracy reading is shown rather than hidden. A ±2 km network fix and a
 * ±8 m GPS fix are both "your location", and only one of them is worth saving
 * as a shopfront.
 */

/** Beyond this the fix is a cell-tower estimate, not a building. */
const POOR_ACCURACY_M = 100;

export function LocationPinPicker({
  latitude,
  longitude,
  onChange,
}: {
  /** Raw field text, so a half-typed coordinate is never destroyed. */
  latitude: string;
  longitude: string;
  onChange: (next: { latitude: string; longitude: string }) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const lat = parseFloat(latitude);
  const lon = parseFloat(longitude);
  const hasPin = isValidCoordinate(lat, lon);

  async function useCurrentLocation() {
    setLocating(true);
    setError(null);
    try {
      /* High accuracy here, unlike the Near Me sort: this value is written to
         the database once and every participant navigates to it afterwards,
         so it is worth the extra seconds and the radio. It is also read
         fresh — maximumAge 0 — because a cached fix from another screen may
         predate the walk to the counter. */
      const fix = await getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
      });
      /* Six decimals is a shade over 10 cm. More is noise dressed as data. */
      onChange({
        latitude: fix.latitude.toFixed(6),
        longitude: fix.longitude.toFixed(6),
      });
      setAccuracy(fix.accuracy);
    } catch (err) {
      setError(
        err instanceof GeoError
          ? geoErrorMessage(err)
          : "Couldn't get your location. Enter the coordinates below instead."
      );
    } finally {
      setLocating(false);
    }
  }

  function clearPin() {
    onChange({ latitude: "", longitude: "" });
    setAccuracy(null);
    setError(null);
  }

  const fieldCls =
    "w-full text-body-md rounded-xl border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface placeholder-on-surface-variant focus:outline-none focus:ring-2 focus:ring-secondary";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-overline text-on-surface-variant">Map pin</p>
        <p className="mt-1 text-body-sm text-on-surface-variant">
          Without a pin this quest still appears everywhere else, but never under Near Me.
        </p>
      </div>

      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-secondary bg-secondary/5 px-3 py-2.5 text-body-md font-semibold text-secondary transition-colors hover:bg-secondary/10 disabled:opacity-50 tap-target"
      >
        {locating ? (
          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        ) : (
          <Crosshair size={15} aria-hidden="true" />
        )}
        {locating ? "Finding you…" : hasPin ? "Update to my current location" : "Use my current location"}
      </button>

      {hasPin && (
        <div className="flex items-start gap-2 rounded-xl bg-surface-container-low p-3">
          <MapPin size={15} className="mt-0.5 shrink-0 text-secondary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-medium text-on-surface">
              {lat.toFixed(5)}, {lon.toFixed(5)}
            </p>
            {accuracy !== null && (
              <p className="mt-0.5 text-label-sm text-on-surface-variant">
                Accurate to about {Math.round(accuracy)} m
                {accuracy > POOR_ACCURACY_M
                  ? " — that's a rough fix. Try again outdoors, or enter the exact pin below."
                  : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={clearPin}
            aria-label="Remove map pin"
            className="shrink-0 rounded-lg p-1 text-on-surface-variant transition-colors hover:text-error tap-target"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <input
          aria-label="Latitude"
          type="number"
          placeholder="Latitude"
          step="0.000001"
          value={latitude}
          onChange={(e) => {
            setAccuracy(null);
            onChange({ latitude: e.target.value, longitude });
          }}
          className={fieldCls}
        />
        <input
          aria-label="Longitude"
          type="number"
          placeholder="Longitude"
          step="0.000001"
          value={longitude}
          onChange={(e) => {
            setAccuracy(null);
            onChange({ latitude, longitude: e.target.value });
          }}
          className={fieldCls}
        />
      </div>

      {/* Only once both fields hold something: warning about an invalid pin
          while someone is still typing the first one is just noise. */}
      {latitude.trim() !== "" && longitude.trim() !== "" && !hasPin && (
        <p role="alert" className="text-label-sm text-error">
          That isn&apos;t a valid coordinate. Latitude runs −90 to 90, longitude −180 to 180.
        </p>
      )}

      {error && (
        <p role="alert" className="text-label-sm text-error">
          {error}
        </p>
      )}
    </div>
  );
}
