#!/usr/bin/env node
/**
 * Turn a club's scorecard CSV into a Shimo Course object.
 *
 *   node scripts/import-course.mjs data/courses/karen.csv
 *
 * It validates the card (18 holes, unique stroke indexes 1..18, sane pars,
 * at least one tee rating) and prints a ready-to-paste object for the COURSES
 * array in lib/data.ts. See data/courses/_template.csv for the input format.
 *
 * Dependency-free on purpose so it runs anywhere with plain Node.
 */

import { readFileSync } from "node:fs";
import { argv, exit } from "node:process";

const path = argv[2];
if (!path) {
  console.error("Usage: node scripts/import-course.mjs <scorecard.csv>");
  exit(1);
}

const text = readFileSync(path, "utf8");
const lines = text
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

const meta = {};
const holes = [];
const tees = [];
let section = null; // "holes" | "tees"

for (const line of lines) {
  const cells = line.split(",").map((c) => c.trim());
  const head = cells[0].toLowerCase();

  if (head === "meta") {
    meta[cells[1]] = cells.slice(2).join(",");
    continue;
  }
  if (head === "hole") {
    section = "holes"; // header row for the holes block
    continue;
  }
  if (head === "tee") {
    section = "tees"; // header row for the tees block
    continue;
  }
  if (section === "holes") {
    const [hole, par, si, yards] = cells.map(Number);
    holes.push({ hole, par, si, yards });
  } else if (section === "tees") {
    tees.push({
      tee: cells[0],
      courseRating: Number(cells[1]),
      slope: Number(cells[2]),
    });
  }
}

/* ---- validate ---- */
const errors = [];
const warnings = [];

for (const key of ["id", "clubId", "name", "defaultTee"]) {
  if (!meta[key]) errors.push(`missing meta: ${key}`);
}
if (meta.id && !/^[a-z0-9-]+$/.test(meta.id))
  errors.push(`id "${meta.id}" must be lowercase letters, digits, dashes`);

if (holes.length !== 18)
  errors.push(`expected 18 holes, got ${holes.length}`);

const sis = holes.map((h) => h.si).sort((a, b) => a - b);
const expected = Array.from({ length: 18 }, (_, i) => i + 1);
if (holes.length === 18 && sis.join() !== expected.join())
  errors.push(`stroke indexes must be 1..18 each used once, got: ${sis.join(",")}`);

for (const h of holes) {
  if (!(h.par >= 3 && h.par <= 6))
    warnings.push(`hole ${h.hole}: unusual par ${h.par}`);
  if (!(h.yards > 0)) warnings.push(`hole ${h.hole}: missing yards`);
}
if (tees.length === 0) errors.push("no tee ratings found");
if (meta.defaultTee && !tees.some((t) => t.tee === meta.defaultTee))
  warnings.push(`defaultTee "${meta.defaultTee}" has no matching tee rating row`);

const par = holes.reduce((a, h) => a + h.par, 0);

if (errors.length) {
  console.error("\n✗ Could not import — fix these first:\n");
  for (const e of errors) console.error("  • " + e);
  console.error("");
  exit(1);
}

/* ---- emit ---- */
const holeLines = holes
  .map(
    (h) =>
      `    { hole: ${h.hole}, par: ${h.par}, si: ${h.si}, yards: ${h.yards} },`,
  )
  .join("\n");
const ratingLines = tees
  .map(
    (t) =>
      `      { tee: "${t.tee}", courseRating: ${t.courseRating}, slope: ${t.slope} },`,
  )
  .join("\n");

const literal = `  {
    id: "${meta.id}",
    clubId: "${meta.clubId}",
    name: "${meta.name}",
    tees: "${meta.defaultTee}",
    par: ${par},
    holes: [
${holeLines}
    ],
    ratings: [
${ratingLines}
    ],
  },`;

console.log(`\n✓ ${meta.name} — par ${par}, ${holes.length} holes, ${tees.length} tees`);
if (warnings.length) {
  console.log("\n  warnings:");
  for (const w of warnings) console.log("  • " + w);
}
console.log("\nPaste this into the COURSES array in lib/data.ts:\n");
console.log(literal);
console.log("");
