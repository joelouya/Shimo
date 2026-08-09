/* ------------------------------------------------------------------ *
 * M20 - group codes on pairings
 *
 * The tournament-day tee sheet prints a short code and a QR beside every tee
 * time. Scanning or typing it lands a player on their group, from where they
 * pick themselves out - which is what asks for identity. The code names a
 * group; it opens nothing on its own.
 *
 * Because it only names a group it is safe to be readable, unlike a guest code:
 * an ordinary anon read of pairings already returns the whole tee sheet, so a
 * player resolving their own code learns nothing they could not read off the
 * sheet on the wall. The column is nullable, so pairings written before this
 * read back exactly as they did, and the app mints codes on the next save.
 *
 * Run any time. Idempotent.
 * ------------------------------------------------------------------ */

alter table pairings
  add column if not exists code text;

/* Resolving a typed code is a lookup by code across the live events. Not
   unique - a code names a group within a tournament, and the same short code
   could recur in a different event months apart - so the client prefers the
   most recently updated match. The index just keeps the lookup quick. */
create index if not exists pairings_code_idx
  on pairings (code)
  where code is not null;
