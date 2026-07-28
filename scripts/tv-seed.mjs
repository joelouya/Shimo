#!/usr/bin/env node
/**
 * Seed a 40-player live tournament into Supabase for exercising TV mode.
 *
 *   node scripts/tv-seed.mjs
 *
 * Writes under the fixed id `t-tv-demo`, so running it twice replaces its own
 * rows and touches nothing else. Scores are written as agreeing player and
 * marker pairs, timestamped in the past so they have cleared the cool-down,
 * plus one settled eagle and one ace for the announcement layer to find.
 *
 * Uses the anon key and the ordinary RLS write policies: it can do nothing a
 * signed-in club could not. Clean up before a real pilot with a truncate in
 * the SQL editor.
 */
import { createJiti } from "jiti";
import { readFileSync } from "node:fs";

const root = "/Users/joelouya/Documents/Shimo Golf/shimo";
const env = Object.fromEntries(
  readFileSync(`${root}/.env.local`, "utf8").split("\n").filter(Boolean)
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const jiti = createJiti(import.meta.url, { alias: { "@": root }, interopDefault: true });
const { COURSES, PLAYERS, CLUBS } = await jiti.import(`${root}/lib/data.ts`);
const { mulberry32 } = await jiti.import(`${root}/lib/scoring.ts`);

const post = async (table, rows, conflict) => {
  const r = await fetch(`${URL_}/rest/v1/${table}${conflict ? `?on_conflict=${conflict}` : ""}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json",
               Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) console.error(table, r.status, (await r.text()).slice(0, 240));
  else console.log(table, "ok", rows.length);
};

const club = CLUBS[0];
const course = COURSES.find((c) => c.clubId === club.id) ?? COURSES[0];
const TID = "t-tv-demo";
const field = PLAYERS.slice(0, 40);

await post("clubs", [{ id: club.id, accent: "#1f6b4a", poster_credit: true }], "id");
await post("tournaments", [{
  id: TID, name: `${club.short} Captain's Prize`, club_id: club.id, course_id: course.id,
  date: "2026-07-27", format: "Stroke Play", entry_fee: 3500, status: "live",
  members_only: false, divisions: [], description: "", prizes: [], max_players: 120,
  reg_closes: "2026-07-25", handicap_allowance: 95, first_tee: "07:30", tee_interval: 10,
  field_size: field.length,
  sponsors: [{ id: "s1", name: "NCBA", tier: "title" }, { id: "s2", name: "Junior Golf Foundation", tier: "prize" }],
  rounds: [{ id: "r1", number: 1, name: "Round 1", date: "2026-07-27", courseId: course.id,
             tees: course.tees, firstTee: "07:30", teeInterval: 10, cut: null }],
}], "id");

await post("players", field.map((p) => ({
  id: p.id, name: p.name, club_id: p.clubId, handicap: p.handicap, gender: p.gender,
})), "id");

const groups = [];
for (let i = 0; i < field.length; i += 4)
  groups.push({ tournament_id: TID, round: 1, group_id: `g${i / 4 + 1}`, number: i / 4 + 1,
                tee_time: `0${7 + Math.floor(i / 16)}:${String((i * 10) % 60).padStart(2, "0")}`,
                player_ids: field.slice(i, i + 4).map((p) => p.id) });
await post("pairings", groups, "tournament_id,round,group_id");

// dual-entry scores: both parties agree, entered well in the past so they have settled
const now = Date.now();
const rows = [];
const rng = mulberry32(11);
field.forEach((p, idx) => {
  const holes = 4 + Math.floor(rng() * 15);           // varied progress round the course
  for (let h = 0; h < Math.min(holes, 18); h++) {
    const par = course.holes[h].par;
    const roll = rng();
    const gross = par + (roll < 0.1 ? -1 : roll < 0.5 ? 0 : roll < 0.82 ? 1 : 2);
    const at = new Date(now - (30 + (18 - h) * 4) * 60_000).toISOString();
    for (const source of ["player", "marker"])
      rows.push({ tournament_id: TID, round: 1, player_id: p.id, hole: h,
                  gross, source, client_id: "seed", updated_at: at });
  }
});
// one settled eagle, and one ace, for the announcement layer to find later
const par5 = course.holes.findIndex((h) => h.par === 5);
const par3 = course.holes.findIndex((h) => h.par === 3);
const old = new Date(now - 20 * 60_000).toISOString();
for (const source of ["player", "marker"]) {
  rows.push({ tournament_id: TID, round: 1, player_id: field[0].id, hole: par5,
              gross: course.holes[par5].par - 2, source, client_id: "seed", updated_at: old });
  rows.push({ tournament_id: TID, round: 1, player_id: field[1].id, hole: par3,
              gross: 1, source, client_id: "seed", updated_at: old });
}
for (let i = 0; i < rows.length; i += 500)
  await post("scores", rows.slice(i, i + 500), "tournament_id,round,player_id,hole,source");

console.log("\nseeded", TID, "with", field.length, "players,", rows.length, "score rows");
