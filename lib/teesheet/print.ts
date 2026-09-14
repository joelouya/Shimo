"use client";

/**
 * Turn the round the club is looking at into a printable tee sheet.
 *
 * Reads that round's pairings and roster from the store, draws a QR per group
 * that lands on the group by its code, asks /api/teesheet for the PDF, and opens
 * it. The QR and the printed code resolve the same way, so a phone that cannot
 * focus falls back to four typed characters.
 */

import QRCode from "qrcode";

import { clubById, courseById, TOURNAMENTS } from "@/lib/data";
import { roundKey, roundsOf } from "@/lib/rounds";
import { playerInField, simStore } from "@/lib/sim/store";
import { teeSheetSpec } from "./spec";

export type TeeSheetResult = "opened" | "no-pairings" | "failed" | "blocked";

/**
 * Open the tab while we are still inside the click. A window opened after
 * an await has lost the user gesture and is popup-blocked in Safari and
 * Firefox, which used to look like a print that silently did nothing.
 */
function openTab(): Window | null {
  try {
    const w = window.open("", "_blank");
    if (w) w.document.title = "Preparing the sheet…";
    return w;
  } catch {
    return null;
  }
}

export async function printTeeSheet(
  tournamentId: string,
  round = 1,
): Promise<TeeSheetResult> {
  const s = simStore.getState();
  const t =
    s.created.find((x) => x.id === tournamentId) ??
    TOURNAMENTS.find((x) => x.id === tournamentId);
  if (!t) return "failed";

  const rounds = roundsOf(t);
  const roundInfo = rounds.find((r) => r.number === round) ?? rounds[0];
  const course = courseById(roundInfo.courseId ?? t.courseId);
  const groups = s.pairings[roundKey(t.id, roundInfo.number)] ?? [];
  const withPlayers = groups.filter((g) => g.playerIds.length > 0);
  if (!withPlayers.length) return "no-pairings";
  const tab = openTab();

  // a QR per group, pointing at the group by its code
  const origin = window.location.origin;
  const qrByGroup: Record<string, string> = {};
  await Promise.all(
    withPlayers.map(async (g) => {
      if (!g.code) return;
      try {
        qrByGroup[g.id] = await QRCode.toDataURL(
          `${origin}/play?c=${encodeURIComponent(g.code)}`,
          { margin: 1, width: 240 },
        );
      } catch {
        /* a row without a QR still prints its code */
      }
    }),
  );

  const spec = teeSheetSpec({
    tournament: t,
    course,
    round: {
      number: roundInfo.number,
      name: roundInfo.name,
      date: roundInfo.date,
    },
    groups: withPlayers,
    nameOf: (id) => playerInField(s, id)?.name ?? id,
    clubName: clubById(t.clubId).name,
    qrByGroup,
    multiRound: rounds.length > 1,
  });

  try {
    const res = await fetch("/api/teesheet", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok) {
      tab?.close();
      return "failed";
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else if (!window.open(url, "_blank")) return "blocked";
    return "opened";
  } catch {
    tab?.close();
    return "failed";
  }
}
