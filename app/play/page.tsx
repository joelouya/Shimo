"use client";

/**
 * Landing on a group from the tee sheet.
 *
 * A player scans the QR beside their tee time, or types the four-character code
 * off the printed sheet, and arrives here. The code names their group and does
 * nothing else: it opens no scorecard. From the group they pick themselves out,
 * and picking is what asks for identity.
 *
 *   a member  signs in the ordinary way. If they are already signed in on this
 *             device they go straight through; otherwise the code sends a magic
 *             link to the address the club has for them. The code is a shortcut
 *             into their own account, never a way past the sign-in.
 *   a guest   produces the personal registration code they were given. The
 *             group code cannot stand in for it: a guest still proves they are
 *             the person on the sheet before their card opens.
 *
 * So the group code is convenience with no privilege. Anyone can reach the
 * "select yourself" screen; nobody scores as someone else without passing the
 * same gate they always would.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck, User, UserRound } from "lucide-react";

import { Logo } from "@/components/logo";
import { SimGate } from "@/components/sim-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normaliseGroupCode } from "@/lib/group-code";
import { hydrateForGroup, resolveGroupCode } from "@/lib/group-remote";
import { normaliseCode } from "@/lib/guests";
import { enterResolvedGuest, resolveGuestCodeRemote } from "@/lib/guests-remote";
import {
  allTournaments,
  guestForCode,
  meId,
  playerInField,
  setAuth,
  setDeviceIdentity,
  simStore,
  useSim,
  type SavedGroup,
} from "@/lib/sim/store";
import { roundKey } from "@/lib/rounds";
import { sendLoginCode, verifyLoginCode } from "@/lib/sync/auth";
import type { Player, Tournament } from "@/lib/types";
import { initials } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;

/** A stable empty array, so a round with no pairings does not churn memo deps. */
const NO_GROUPS: SavedGroup[] = [];

type Resolved = { tournamentId: string; round: number; groupId: string | null };

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col px-6 pb-12 pt-[max(env(safe-area-inset-top),24px)]">
      <div className="py-4">
        <Logo className="text-[17px]" />
      </div>
      {children}
    </div>
  );
}

function Fade({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const still = useReducedMotion();
  return (
    <motion.div
      initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Typing the code                                                     */
/* ------------------------------------------------------------------ */

function CodeEntry({
  onResolved,
}: {
  onResolved: (r: Resolved) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<null | "not-found" | "unavailable">(null);

  const submit = async () => {
    setProblem(null);
    setBusy(true);
    const res = await resolveGroupCode(code);
    setBusy(false);
    if (res.status === "ok") {
      onResolved({ tournamentId: res.tournamentId, round: res.round, groupId: res.groupId });
      return;
    }
    setProblem(res.status === "unavailable" ? "unavailable" : "not-found");
  };

  return (
    <div className="flex flex-1 flex-col justify-center">
      <Fade>
        <p className="smallcaps text-muted-foreground">Tournament day</p>
        <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
          Find your group
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          Type the four-character code printed beside your tee time, or scan the
          code next to it.
        </p>
      </Fade>

      <Fade delay={0.08}>
        <div className="mt-8 space-y-2">
          <Label htmlFor="group-code">Group code</Label>
          <Input
            id="group-code"
            autoFocus
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            value={code}
            placeholder="7KP4"
            onChange={(e) => {
              setCode(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            aria-invalid={Boolean(problem)}
            className="h-14 text-center font-serif text-[30px] uppercase tracking-[0.25em] tnum"
          />
          {problem === "not-found" && (
            <p className="text-[13px] leading-relaxed text-red-flag">
              That code did not match a group. Check it against the tee sheet, or
              ask the starter.
            </p>
          )}
          {problem === "unavailable" && (
            <p className="text-[13px] leading-relaxed text-red-flag">
              We could not reach the scoring service. Check your signal and try
              again, or ask the starter.
            </p>
          )}
        </div>
      </Fade>

      <Fade delay={0.16}>
        <Button
          variant="clay"
          size="lg"
          className="mt-6 w-full"
          disabled={normaliseGroupCode(code).length < 4 || busy}
          onClick={submit}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Find my group"}
          {!busy && <ArrowRight className="size-4" />}
        </Button>
        <Link
          href="/enter"
          className="mt-5 block text-center text-[13px] text-muted-foreground underline-offset-4 hover:underline"
        >
          I have a personal registration code
        </Link>
      </Fade>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Choosing a pairing (the "see all groups" fallback)                  */
/* ------------------------------------------------------------------ */

function PickPairing({
  tournament,
  groups,
  onPick,
}: {
  tournament: Tournament;
  groups: SavedGroup[];
  onPick: (g: SavedGroup) => void;
}) {
  const s = simStore.getState();
  const nameOf = (pid: string) => playerInField(s, pid)?.name ?? pid;

  return (
    <div className="flex flex-1 flex-col">
      <Fade>
        <p className="smallcaps text-muted-foreground">{tournament.name}</p>
        <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
          Select your group
        </h1>
      </Fade>
      <div className="mt-6 flex flex-col gap-2.5">
        {groups.map((g, i) => (
          <Fade key={g.id} delay={Math.min(i * 0.03, 0.24)}>
            <button
              onClick={() => onPick(g)}
              className="w-full rounded-2xl bg-card p-4 text-left shadow-card transition-[box-shadow] duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-foreground">
                  Group {g.number}
                </p>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-ink-soft tnum">
                  {g.teeTime}
                </span>
              </div>
              <p className="mt-1.5 text-[14px] leading-snug text-ink-soft">
                {g.playerIds.map(nameOf).join(" · ")}
              </p>
            </button>
          </Fade>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Choosing yourself within a group                                    */
/* ------------------------------------------------------------------ */

function PickSelf({
  tournament,
  group,
  onPick,
  onSeeAll,
}: {
  tournament: Tournament;
  group: SavedGroup;
  onPick: (p: Player, kind: "member" | "guest") => void;
  onSeeAll: () => void;
}) {
  const s = simStore.getState();
  const entrants = group.playerIds
    .map((pid) => playerInField(s, pid))
    .filter((p): p is Player => Boolean(p));

  return (
    <div className="flex flex-1 flex-col">
      <Fade>
        <p className="smallcaps text-muted-foreground">
          {tournament.name} · Group {group.number}
          {group.teeTime ? ` · ${group.teeTime}` : ""}
        </p>
        <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
          Which one is you?
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          Choose your name to open your scorecard. You still sign in, or use your
          own registration code. This only points you at the right card.
        </p>
      </Fade>

      <div className="mt-6 flex flex-col gap-2.5">
        {entrants.map((p, i) => {
          const isGuest = Boolean(p.guest);
          return (
            <Fade key={p.id} delay={Math.min(i * 0.04, 0.24)}>
              <button
                onClick={() => onPick(p, isGuest ? "guest" : "member")}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-3.5 text-left shadow-card transition-[box-shadow] duration-[var(--dur-hover)] ease-[var(--ease-out)] hover:shadow-lift"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-secondary font-serif text-[15px] text-ink-soft">
                  {initials(p.name)}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-[15px] font-medium text-foreground">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[13px] text-muted-foreground">
                    {isGuest ? (
                      <>
                        <UserRound className="size-3" /> Guest
                      </>
                    ) : (
                      <>
                        <User className="size-3" /> Member
                      </>
                    )}
                  </span>
                </span>
                <ArrowRight className="size-4 text-muted-foreground" />
              </button>
            </Fade>
          );
        })}
      </div>

      <button
        onClick={onSeeAll}
        className="mt-5 self-start text-[13px] text-muted-foreground underline-offset-4 hover:underline"
      >
        Not your group? See all groups
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Member: the code is a shortcut into their account, not a bypass     */
/* ------------------------------------------------------------------ */

function MemberSignIn({
  player,
  onDone,
  onBack,
}: {
  player: Player;
  onDone: () => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(player.email ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      await sendLoginCode(email);
      setPhase("code");
    } catch (e) {
      setError((e as Error).message ?? "Couldn't send the code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setError(null);
    setBusy(true);
    try {
      const session = await verifyLoginCode(email, code);
      if (session?.user) {
        setAuth(session.user.email ?? email, session.user.id);
        onDone();
        return;
      }
      setError("That code didn't work. Check it and try again.");
    } catch {
      setError("That code didn't work. Check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-center">
      <Fade>
        <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-clay-wash text-clay-deep">
          <ShieldCheck className="size-6" />
        </span>
        <h1 className="mt-5 font-serif text-[30px] leading-tight text-foreground">
          {phase === "email" ? `Sign in as ${player.name.split(" ")[0]}` : "Enter your code"}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          {phase === "email"
            ? "We'll email a six-digit code to the address your club has on file. No password to remember."
            : `We emailed a code to ${email}. It signs you in as yourself.`}
        </p>
      </Fade>

      <Fade delay={0.08}>
        <div className="mt-6">
          {phase === "email" ? (
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              value={email}
              placeholder="you@email.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && email.includes("@") && send()}
              className="h-12 text-[17px]"
            />
          ) : (
            <Input
              autoFocus
              inputMode="numeric"
              value={code}
              placeholder="123456"
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && code.length >= 6 && verify()}
              className="h-14 text-center font-serif text-[30px] tracking-[0.3em] tnum"
            />
          )}
          {error && <p className="mt-2 text-[13px] text-red-flag">{error}</p>}
        </div>
      </Fade>

      <Fade delay={0.16}>
        <Button
          variant="clay"
          size="lg"
          className="mt-6 w-full"
          disabled={busy || (phase === "email" ? !email.includes("@") : code.length < 6)}
          onClick={phase === "email" ? send : verify}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : phase === "email" ? (
            "Email me a code"
          ) : (
            "Open my scorecard"
          )}
        </Button>
        <button
          onClick={phase === "code" ? () => setPhase("email") : onBack}
          className="mt-5 flex items-center justify-center gap-1.5 self-center text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {phase === "code" ? "Use a different email" : "That's not me"}
        </button>
      </Fade>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Guest: the group code cannot stand in for their own code            */
/* ------------------------------------------------------------------ */

function GuestVerify({
  player,
  onDone,
  onBack,
}: {
  player: Player;
  onDone: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<
    null | "not-found" | "wrong-player" | "unavailable" | "rate-limited"
  >(null);

  const submit = async () => {
    setProblem(null);
    setBusy(true);
    /* On the guest's own phone the entry is already here, so try locally first
       - instant, and it never leaves the device. */
    const local = guestForCode(simStore.getState(), code);
    if (local) {
      if (local.player.id !== player.id) {
        setBusy(false);
        setProblem("wrong-player");
        return;
      }
      setDeviceIdentity(local.player.id);
      onDone();
      return;
    }
    const res = await resolveGuestCodeRemote(code);
    setBusy(false);
    if (res.status === "ok") {
      if (res.guestId !== player.id) {
        setProblem("wrong-player");
        return;
      }
      const ok = await enterResolvedGuest(res.tournamentId, res.guestId);
      if (ok) {
        onDone();
        return;
      }
      setProblem("unavailable");
      return;
    }
    if (res.status === "rate-limited") setProblem("rate-limited");
    else if (res.status === "unavailable") setProblem("unavailable");
    else setProblem("not-found");
  };

  return (
    <div className="flex flex-1 flex-col justify-center">
      <Fade>
        <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-clay-wash text-clay-deep">
          <UserRound className="size-6" />
        </span>
        <h1 className="mt-5 font-serif text-[30px] leading-tight text-foreground">
          Confirm it&apos;s you, {player.name.split(" ")[0]}
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
          Enter the personal registration code you were sent. It&apos;s six
          characters, and it opens your card only. The group code can&apos;t.
        </p>
      </Fade>

      <Fade delay={0.08}>
        <div className="mt-6">
          <Input
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={code}
            placeholder="abc-123"
            onChange={(e) => {
              setCode(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && normaliseCode(code).length === 7 && submit()}
            aria-invalid={Boolean(problem)}
            className="h-14 text-center font-serif text-[30px] tracking-[0.2em] tnum"
          />
          {problem === "wrong-player" && (
            <p className="mt-2 text-[13px] leading-relaxed text-red-flag">
              That code belongs to a different player. Use the code from your own
              registration.
            </p>
          )}
          {problem === "not-found" && (
            <p className="mt-2 text-[13px] leading-relaxed text-red-flag">
              That code did not open anything. Check it against your registration.
            </p>
          )}
          {problem === "rate-limited" && (
            <p className="mt-2 text-[13px] leading-relaxed text-red-flag">
              Too many tries. Wait a moment, then try again, or ask the desk.
            </p>
          )}
          {problem === "unavailable" && (
            <p className="mt-2 text-[13px] leading-relaxed text-red-flag">
              We couldn&apos;t reach the scoring service. Check your signal, or ask
              the desk.
            </p>
          )}
        </div>
      </Fade>

      <Fade delay={0.16}>
        <Button
          variant="clay"
          size="lg"
          className="mt-6 w-full"
          disabled={busy || normaliseCode(code).length !== 7}
          onClick={submit}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Open my scorecard"}
        </Button>
        <button
          onClick={onBack}
          className="mt-5 flex items-center justify-center gap-1.5 self-center text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          That&apos;s not me
        </button>
      </Fade>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Loading({ label = "Finding your group" }: { label?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}

type Phase =
  | { kind: "entry" }
  | { kind: "loading" }
  | { kind: "pick-pairing" }
  | { kind: "pick-self"; group: SavedGroup }
  | { kind: "member"; player: Player }
  | { kind: "guest"; player: Player }
  | { kind: "error"; message: string };

function Play() {
  const router = useRouter();
  const params = useSearchParams();
  const created = useSim((s) => s.created);
  // subscribe so a hydrate that lands pairings re-renders this screen
  const pairings = useSim((s) => s.pairings);

  const paramCode = params.get("c") ?? "";
  const paramTid = params.get("t") ?? "";
  const paramGroup = params.get("g") ?? "";
  const paramRound = Number(params.get("r")) || 1;

  const [resolved, setResolved] = useState<Resolved | null>(
    paramTid ? { tournamentId: paramTid, round: paramRound, groupId: paramGroup || null } : null,
  );
  /*
   * The screen a user action or an async result has explicitly moved to. Null
   * means "follow the data": the base screen - loading, then the right group -
   * is derived from what has resolved and hydrated rather than pushed from an
   * effect, so the effects never call setState synchronously.
   */
  const [override, setOverride] = useState<Phase | null>(
    paramCode || paramTid ? null : { kind: "entry" },
  );
  const started = useRef(false);

  const tournament = useMemo(
    () => (resolved ? allTournaments(created).find((t) => t.id === resolved.tournamentId) : undefined),
    [created, resolved],
  );
  const groups = useMemo(
    () =>
      resolved ? pairings[roundKey(resolved.tournamentId, resolved.round)] ?? NO_GROUPS : NO_GROUPS,
    [resolved, pairings],
  );

  // hydrate the event, then record it resolved; every setState is post-await, so
  // nothing fires synchronously inside an effect
  const applyResolved = useCallback(async (r: Resolved) => {
    const ok = await hydrateForGroup(r.tournamentId);
    if (!ok) {
      setOverride({ kind: "error", message: "We couldn't reach this event. Check your signal, or ask the starter." });
      return;
    }
    setOverride(null);
    setResolved(r);
  }, []);

  // resolve a code that arrived in the URL, once
  useEffect(() => {
    if (started.current) return;
    if (paramCode) {
      started.current = true;
      (async () => {
        const res = await resolveGroupCode(paramCode);
        if (res.status === "ok") {
          await applyResolved({ tournamentId: res.tournamentId, round: res.round, groupId: res.groupId });
        } else {
          setOverride({ kind: "entry" });
        }
      })();
    } else if (paramTid) {
      started.current = true;
      // resolved is already set from initial state, so this only has to bring the
      // event into the store; a failure is noted from the callback, never inline
      hydrateForGroup(paramTid).then((ok) => {
        if (!ok)
          setOverride({
            kind: "error",
            message: "We couldn't reach this event. Check your signal, or ask the starter.",
          });
      });
    }
  }, [paramCode, paramTid, applyResolved]);

  /*
   * The base screen, derived rather than stored: while resolving or hydrating it
   * is loading, and once the event is in it settles on the player's own group,
   * or the list of groups, or an empty-event notice. An override wins over all
   * of it.
   */
  const screen: Phase = useMemo(() => {
    if (override) return override;
    if (!resolved || !tournament) return { kind: "loading" };
    const group = resolved.groupId ? groups.find((g) => g.id === resolved.groupId) : undefined;
    if (group) return { kind: "pick-self", group };
    if (groups.length) return { kind: "pick-pairing" };
    return {
      kind: "error",
      message: "This event has no groups yet. Ask the starter to print the tee sheet.",
    };
  }, [override, resolved, tournament, groups]);

  const goLive = () => router.push("/app/live");

  const pickSelf = (p: Player, kind: "member" | "guest") => {
    // already this person on this device: the shortcut is a straight-through
    if (meId(simStore.getState()) === p.id) {
      goLive();
      return;
    }
    setOverride({ kind: kind === "member" ? "member" : "guest", player: p });
  };

  // going back from a self-pick returns to the derived base (their own group,
  // or the list) by clearing the override
  const backToGroup = () => setOverride(null);

  return (
    <Frame>
      {screen.kind === "entry" && (
        <CodeEntry
          onResolved={(r) => {
            setOverride(null);
            void applyResolved(r);
          }}
        />
      )}
      {screen.kind === "loading" && <Loading />}
      {screen.kind === "error" && (
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="font-serif text-[30px] leading-tight text-foreground">
            Something&apos;s off
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{screen.message}</p>
          <Button
            variant="outline"
            className="mt-6 self-start"
            onClick={() => {
              setResolved(null);
              started.current = false;
              setOverride({ kind: "entry" });
            }}
          >
            Enter a code
          </Button>
        </div>
      )}
      {screen.kind === "pick-pairing" && tournament && (
        <PickPairing
          tournament={tournament}
          groups={groups}
          onPick={(g) => setOverride({ kind: "pick-self", group: g })}
        />
      )}
      {screen.kind === "pick-self" && tournament && (
        <PickSelf
          tournament={tournament}
          group={screen.group}
          onPick={pickSelf}
          onSeeAll={() => setOverride({ kind: "pick-pairing" })}
        />
      )}
      {screen.kind === "member" && (
        <MemberSignIn player={screen.player} onDone={goLive} onBack={backToGroup} />
      )}
      {screen.kind === "guest" && (
        <GuestVerify player={screen.player} onDone={goLive} onBack={backToGroup} />
      )}
    </Frame>
  );
}

export default function PlayPage() {
  return (
    <SimGate
      fallback={
        <Frame>
          <Loading label="Loading" />
        </Frame>
      }
    >
      <Suspense
        fallback={
          <Frame>
            <Loading label="Loading" />
          </Frame>
        }
      >
        <Play />
      </Suspense>
    </SimGate>
  );
}
