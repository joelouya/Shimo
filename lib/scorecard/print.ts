"use client";

/**
 * Turn the tournament the club is looking at into a printable set of cards.
 *
 * Reads the pairings and roster from the store, draws a QR back into the app,
 * asks /api/scorecard for the PDF, and opens it. One card per pairing group, or
 * per named team when the day is played in teams.
 */

import QRCode from "qrcode";

import { clubById, courseById, TOURNAMENTS } from "@/lib/data";
import { roundKey, roundsOf } from "@/lib/rounds";
import { playerInField, simStore, teamsIn } from "@/lib/sim/store";
import { scorecardSpec } from "./spec";

export type PrintResult = "opened" | "no-pairings" | "failed";

export async function printScorecards(tournamentId: string): Promise<PrintResult> {
  const s = simStore.getState();
  const t =
    s.created.find((x) => x.id === tournamentId) ??
    TOURNAMENTS.find((x) => x.id === tournamentId);
  if (!t) return "failed";

  const round = roundsOf(t)[0];
  const course = courseById(round.courseId ?? t.courseId);
  const groups = s.pairings[roundKey(t.id, round.number)] ?? [];
  const teams = teamsIn(s, t.id, round.number);
  if (!groups.length && !teams.length) return "no-pairings";

  const origin = window.location.origin;

  // a group card carries its own group's QR, matching the tee sheet
  const qrByGroup: Record<string, string> = {};
  await Promise.all(
    groups.map(async (g) => {
      if (!g.code) return;
      try {
        qrByGroup[g.id] = await QRCode.toDataURL(
          `${origin}/play?c=${encodeURIComponent(g.code)}`,
          { margin: 1, width: 300 },
        );
      } catch {
        /* a card without a QR is still a card */
      }
    }),
  );

  // team cards have no group of their own: fall back to the registration link
  const link = `${origin}/register/${t.id}`;
  let qr: string | undefined;
  try {
    qr = await QRCode.toDataURL(link, { margin: 1, width: 300 });
  } catch {
    qr = undefined;
  }

  const spec = scorecardSpec({
    tournament: t,
    course,
    round: {
      number: round.number,
      tees: round.tees,
      firstTee: round.firstTee,
      date: round.date,
    },
    groups,
    teams,
    nameOf: (id) => playerInField(s, id)?.name ?? id,
    handicapOf: (id) => playerInField(s, id)?.handicap,
    clubName: clubById(t.clubId).name,
    qr,
    link: link.replace(/^https?:\/\//, ""),
    qrByGroup,
  });

  try {
    const res = await fetch("/api/scorecard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok) return "failed";
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank");
    return "opened";
  } catch {
    return "failed";
  }
}
