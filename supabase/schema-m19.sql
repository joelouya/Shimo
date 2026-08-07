/* ------------------------------------------------------------------ *
 * M19 - tournament columns for team, match and richer registration
 *
 * The team, Ryder Cup and registration work adds fields to a tournament that
 * have to survive the round trip through the cloud: without a column, a second
 * device hydrating the event loses the per-position handicap allowances and
 * scores the teams wrong. Every column is nullable, so events created before
 * this read back exactly as they did, and an upsert that omits them is fine.
 *
 * Complex fields (allowances, the Ryder Cup structure, registration questions)
 * are jsonb, matching how divisions, rounds and sponsors are already stored.
 *
 * Run any time. Idempotent.
 * ------------------------------------------------------------------ */

alter table tournaments
  add column if not exists players_per_team                 int,
  add column if not exists handicap_allowances              jsonb,
  add column if not exists max_course_handicap              int,
  add column if not exists max_course_handicap_differential int,
  add column if not exists max_hole_score                   jsonb,
  add column if not exists ryder_cup                        jsonb,
  add column if not exists waitlist                         boolean,
  add column if not exists require_full_team                boolean,
  add column if not exists registration_questions           jsonb;
