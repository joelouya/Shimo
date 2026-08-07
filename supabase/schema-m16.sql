/* ------------------------------------------------------------------ *
 * M16 - a guest can open a code they were handed, on a phone that has
 *        never seen Shimo
 *
 * Until now a guest code resolved only against the device that wrote it: the
 * flow was register-on-your-own-phone, get a code, open it on the same phone.
 * That covers the common case and nothing else. An organiser who registers a
 * field in advance and prints a code card per person had no path - the fresh
 * phone that scans the card holds none of the data, and guest_entries is
 * deliberately non-enumerable, so the client could not look it up.
 *
 * The server-side resolver already existed (resolve_guest_code); it was never
 * called and it was never throttled. An unthrottled resolver over a six-
 * character code is a slow brute force waiting to happen, so this migration
 * replaces it with one that:
 *
 *   - counts failed attempts per client IP and locks that IP out for
 *     exponentially longer after a run of misses,
 *   - refuses a code once its tournament has closed, so a leaked code has a
 *     blast radius that ends with the day,
 *   - records the moment an IP first trips the lockout, so the club sees a
 *     signal rather than a silent flood.
 *
 * IP is best-effort. It comes from the edge headers and can be spoofed, so it
 * is one obstacle among several (the per-device cap in the client is another,
 * the short code space a third), not a wall. The point is to make guessing
 * cost time, not to prove identity.
 *
 * Run after M13. Idempotent.
 * ------------------------------------------------------------------ */

/* One row per client IP, holding how badly it has been behaving lately. Only
   the resolver, which is security definer, ever reads or writes this, so it
   carries RLS with no policy at all - unreachable from any client. */
create table if not exists guest_resolve_throttle (
  ip            text primary key,
  fail_count    int not null default 0,
  window_start  timestamptz not null default now(),
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table guest_resolve_throttle enable row level security;

/* One row each time an IP first locks itself out: a burst worth a human
   glance. IPs are personal data under the Data Protection Act, so they live
   here for a person with database access and are never handed to a client -
   the club-facing summary counts bursts and names nobody. */
create table if not exists guest_resolve_abuse (
  id          uuid primary key default gen_random_uuid(),
  ip          text not null,
  fail_count  int not null,
  at          timestamptz not null default now()
);
alter table guest_resolve_abuse enable row level security;

/* ------------------------------------------------------------------ *
 * The resolver
 *
 * plpgsql now, because it has to decide as well as look up. Same name and
 * shape as before, so every existing grant and caller keeps working; the only
 * visible change to an honest caller is that a code for a finished tournament
 * no longer resolves.
 * ------------------------------------------------------------------ */

create or replace function resolve_guest_code(p_code text)
returns table (tournament_id text, guest_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip           text;
  v_headers      json;
  v_row          record;
  v_fail         int;
  v_window_start timestamptz;
  v_locked       timestamptz;
  v_window       constant interval := interval '10 minutes';
  v_free         constant int := 5;   -- misses allowed before a lockout starts
  v_now          timestamptz := now();
begin
  /* Best-effort client IP. Cloudflare's header first, then the left-most
     x-forwarded-for, then a constant so a missing header does not become its
     own un-throttled bucket. */
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), ''),
    'unknown'
  );

  /* Take the row for this IP, creating it if new, and lock it for the length
     of this call so two simultaneous attempts cannot both slip past the cap. */
  insert into guest_resolve_throttle (ip) values (v_ip)
    on conflict (ip) do nothing;

  select fail_count, window_start, locked_until
    into v_fail, v_window_start, v_locked
    from guest_resolve_throttle where ip = v_ip for update;

  /* Locked out: refuse before even looking at the code. */
  if v_locked is not null and v_locked > v_now then
    raise exception 'guest_code_rate_limited'
      using errcode = 'P0001',
            hint = to_char(v_locked, 'YYYY-MM-DD"T"HH24:MI:SSOF');
  end if;

  /* A fresh window wipes the slate: a couple of typos an hour ago should not
     count against someone getting it right now. */
  if v_window_start < v_now - v_window then
    v_fail := 0;
    update guest_resolve_throttle
      set fail_count = 0, window_start = v_now, locked_until = null
      where ip = v_ip;
  end if;

  /* The lookup itself: the code, but only while its tournament is still open.
     A finished or cancelled event resolves to nothing, which is what bounds a
     leaked code to the day it was for. */
  select e.tournament_id, e.guest_id
    into v_row
    from guest_entries e
    join tournaments t on t.id = e.tournament_id
    where e.code = lower(btrim(p_code))
      and t.status in ('upcoming', 'live')
    limit 1;

  if found then
    /* Success clears this IP: an honest guest who mistyped twice then got it
       right walks away with a clean record. */
    update guest_resolve_throttle
      set fail_count = 0, window_start = v_now, locked_until = null, updated_at = v_now
      where ip = v_ip;
    tournament_id := v_row.tournament_id;
    guest_id := v_row.guest_id;
    return next;
    return;
  end if;

  /* A miss. Count it, and once past the free allowance start locking for
     exponentially longer - 30s, 60s, 120s, ... capped at an hour. */
  v_fail := v_fail + 1;
  update guest_resolve_throttle
    set fail_count = v_fail,
        updated_at = v_now,
        locked_until = case
          when v_fail > v_free
          then v_now + make_interval(
            secs => least(3600, (2 ^ (v_fail - v_free - 1))::int * 30))
          else null
        end
    where ip = v_ip;

  /* Log the moment it first locks, once, so the club sees one burst per run
     rather than a line per attempt. */
  if v_fail = v_free + 1 then
    insert into guest_resolve_abuse (ip, fail_count) values (v_ip, v_fail);
  end if;

  return; -- empty: the caller shows "that code did not open anything"
end;
$$;

revoke all on function resolve_guest_code(text) from public;
grant execute on function resolve_guest_code(text) to anon, authenticated;

/* ------------------------------------------------------------------ *
 * The club-facing signal
 *
 * Counts, never addresses. "Three bursts in the last day" is enough for a
 * caddymaster to know someone is poking at the codes; the IPs behind them are
 * a matter for whoever holds the database, not for the app.
 * ------------------------------------------------------------------ */

create or replace function guest_resolve_abuse_summary(
  p_since timestamptz default now() - interval '24 hours'
)
returns table (bursts int, last_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select count(*)::int as bursts, max(at) as last_at
  from guest_resolve_abuse
  where at >= p_since;
$$;

revoke all on function guest_resolve_abuse_summary(timestamptz) from public;
grant execute on function guest_resolve_abuse_summary(timestamptz) to anon, authenticated;
