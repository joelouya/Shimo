/* ------------------------------------------------------------------ *
 * M17 - purge simulated data
 *
 * The external field simulator (scripts/sim-live.mjs) writes to this project
 * the way real phones do, so that the real app - leaderboard, TV, Live Ops -
 * reads it as a genuine tournament. That is the point: it exercises the actual
 * deployment, not a puppet inside one browser tab. The cost is fake rows in a
 * real database, so there has to be a clean way to take them out again.
 *
 * The permissive pilot RLS grants select, insert and update to anon, but never
 * delete - by design, because the product never deletes a record. This is the
 * single sanctioned exception, and it is safe because it is scoped by name:
 * everything the simulator creates is prefixed (`sim-` for tournaments, `simp-`
 * for players), and this function only ever touches rows carrying those
 * prefixes. It is security definer so it can delete past RLS, but it cannot
 * reach a real tournament or a real member even if called with intent.
 *
 * Run any time. Idempotent. `select purge_simulator_data();` clears whatever
 * the simulator has left behind, including the rows the earlier in-app version
 * wrote before it was retired.
 * ------------------------------------------------------------------ */

create or replace function purge_simulator_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  /* Child rows first, though the like-filters make order immaterial; every
     predicate is pinned to a simulator prefix and cannot match real data. */
  delete from scores         where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from certifications where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from card_in        where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from disputes       where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from corrections    where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from audit_log      where tournament_id like 'sim-%' or player_id like 'simp-%';
  delete from pairings       where tournament_id like 'sim-%';
  delete from players        where id like 'simp-%';
  delete from tournaments    where id like 'sim-%';
end;
$$;

revoke all on function purge_simulator_data() from public;
grant execute on function purge_simulator_data() to anon, authenticated;
