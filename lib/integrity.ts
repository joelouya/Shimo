"use client";

/**
 * Tamper-evidence for returned cards.
 *
 * When marker and player have both certified, we hash the full hole-by-hole
 * score set with the identities involved, capture a light device fingerprint
 * (no PII, no MSISDN), the sign-off location if the golfer permitted it, and
 * the distance to the registered clubhouse — the digital equivalent of
 * physically returning the card to the Committee's scoring area.
 *
 * Records are append-only. Committee interventions append new records that
 * reference the original; nothing is ever overwritten.
 */

export const APP_VERSION = "0.3.0-pilot";

export interface DeviceFingerprint {
  ua: string;
  screen: string; // "390x844@3"
  tz: string;
}

export interface GpsFix {
  lat: number;
  lng: number;
  accuracyM: number;
}

export type AuditKind =
  | "marker-attested"
  | "player-certified"
  | "card-returned" // the full integrity record
  | "dispute-raised"
  | "dispute-resolved"
  | "correction-requested"
  | "correction-decided"
  | "committee-override";

export interface AuditRecord {
  id: string;
  kind: AuditKind;
  tournamentId: string;
  /** which round of the tournament this entry belongs to (1-based) */
  round: number;
  playerId: string;
  /** who performed the action: a player id, or "committee" */
  actor: string;
  ts: number; // UTC epoch ms
  hash?: string; // sha-256 hex of the canonical score payload
  device?: DeviceFingerprint;
  gps?: GpsFix | null;
  distanceFromClubhouseM?: number | null;
  appVersion: string;
  /** human-readable what/why — committee reasons land here verbatim */
  detail: string;
  /** hi/ch/ph snapshot for Rule 3.3b(4) */
  handicaps?: { hi: number; ch: number; ph: number };
}

/* ------------------------------------------------------------------ */

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Canonical payload so the same card always hashes identically.
 *
 * The round is part of the payload: in a multi-round tournament a player can
 * legitimately return two identical cards, and those must still seal to
 * different hashes so one round's signature can never stand in for another's.
 */
export function scorePayload(args: {
  tournamentId: string;
  round: number;
  courseId: string;
  playerId: string;
  markerId: string;
  scores: (number | null)[];
}): string {
  return JSON.stringify({
    t: args.tournamentId,
    r: args.round,
    c: args.courseId,
    p: args.playerId,
    m: args.markerId,
    s: args.scores,
  });
}

export function deviceFingerprint(): DeviceFingerprint {
  if (typeof window === "undefined") return { ua: "server", screen: "", tz: "" };
  return {
    ua: navigator.userAgent.slice(0, 140),
    screen: `${window.screen.width}x${window.screen.height}@${window.devicePixelRatio}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "unknown",
  };
}

/** metres between two coordinates (haversine) */
export function distanceM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** One-shot GPS fix; resolves null on denial/timeout — never throws. */
export function getGpsFix(timeoutMs = 8000): Promise<GpsFix | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
        }),
      () => resolve(null),
      { timeout: timeoutMs, maximumAge: 60000 },
    );
  });
}

export function newAuditId() {
  return `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/* ------------------------------------------------------------------ */
/* Audit trail export                                                  */
/* ------------------------------------------------------------------ */

export function auditTrailCsv(records: AuditRecord[], playerName: (id: string) => string): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "record_id", "kind", "utc_timestamp", "player", "actor", "sha256_hash",
    "gps_lat", "gps_lng", "gps_accuracy_m", "distance_from_clubhouse_m",
    "device_ua", "device_screen", "device_tz", "hi", "ch", "ph",
    "app_version", "detail",
  ];
  const rows = records.map((r) =>
    [
      r.id, r.kind, new Date(r.ts).toISOString(), playerName(r.playerId),
      r.actor === "committee" ? "Committee" : playerName(r.actor),
      r.hash ?? "", r.gps?.lat ?? "", r.gps?.lng ?? "", r.gps?.accuracyM ?? "",
      r.distanceFromClubhouseM ?? "", r.device?.ua ?? "", r.device?.screen ?? "",
      r.device?.tz ?? "", r.handicaps?.hi ?? "", r.handicaps?.ch ?? "",
      r.handicaps?.ph ?? "", r.appVersion, r.detail,
    ].map(esc).join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
