"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ClipboardList,
  Flag,
  Share2,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CertificationPanel } from "@/components/admin/certification-panel";
import { PlayerAvatar } from "@/components/player/identity";
import { LiveBadge } from "@/components/live-dot";
import { DEMO_USER_ID, playerById } from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import {
  useActiveTournament,
  useRoundCerts,
  useRoundScores,
  useSlowClock,
  useStandings,
} from "@/lib/sim/hooks";
import {
  endTournamentDay,
  reviewFlag,
  startNextRound,
  useSim,
  type OpsFlag,
  type SavedGroup,
  groupHolesPlayed,
} from "@/lib/sim/store";
import { roundsOf } from "@/lib/rounds";
import type { Player } from "@/lib/types";
import { cn, toPar } from "@/lib/utils";
import { formatElapsed, groupState, paceReadings, type PaceReading } from "@/lib/pace";
import { roundKey } from "@/lib/rounds";

function timeAgo(ts: number) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function SharePublicBoard({ tournamentId }: { tournamentId: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      onClick={async () => {
        const url = `${window.location.origin}/live/${tournamentId}`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {}
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }}
      title="Public leaderboard link for clubhouse screens and WhatsApp"
    >
      {copied ? <Check className="size-4 text-clay" /> : <Share2 className="size-4" />}
      {copied ? "Link copied" : "Share board"}
    </Button>
  );
}

function eventWord(gross: number, par: number) {
  const d = gross - par;
  if (d <= -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  return "Double+";
}

/* ------------------------------------------------------------------ */

function FlagCard({ flag, onReview }: { flag: OpsFlag; onReview: () => void }) {
  const amber = flag.kind === "amber";
  return (
    <motion.div
      layout
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      className={cn(
        // CSS entrance (not framer initial/animate): a flag can appear while
        // the sim is busy, and a main-thread entrance started then can freeze.
        // The layout and exit above only run on review, so they stay on framer.
        "animate-enter-rise flex items-center gap-3 rounded-xl border px-4 py-3",
        amber
          ? "border-amber-flag/30 bg-amber-wash"
          : "border-border bg-card/70",
      )}
    >
      {amber ? (
        <AlertTriangle className="size-4 shrink-0 text-amber-flag" />
      ) : (
        <Flag className="size-3.5 shrink-0 text-stone" />
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-[13px] font-medium",
            amber ? "text-amber-flag" : "text-ink-soft",
          )}
        >
          {flag.message}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {timeAgo(flag.ts)} · {amber ? "marker discrepancy" : "for a look after play"}
        </p>
      </div>
      <Button size="sm" variant="outline" onClick={onReview}>
        Review
      </Button>
    </motion.div>
  );
}

function GroupCard({
  g,
  byId,
  pace,
  selected,
  onSelect,
}: {
  g: SavedGroup;
  byId: Map<string, Player>;
  pace?: PaceReading;
  selected: boolean;
  onSelect: () => void;
}) {
  const scores = useRoundScores();
  const events = useSim((s) => s.events);
  const certs = useRoundCerts();
  const allFlags = useSim((s) => s.flags);
  const flags = allFlags.filter(
    (f) => f.groupId === g.id && f.status === "open" && (!IS_PILOT || f.kind !== "red"),
  );
  const thru = g.playerIds.length
    ? Math.min(
        ...g.playerIds.map(
          (pid) => (scores[pid] ?? []).filter((x) => x != null).length,
        ),
      )
    : 0;
  const finished = thru >= 18;
  const lastEvent = events.find((e) => g.playerIds.includes(e.playerId));

  // The group's lifecycle, folded from scores, certification and flags.
  const groupCerts = g.playerIds.map((pid) => certs[pid]);
  const state = groupState({
    thru,
    allCertified:
      g.playerIds.length > 0 &&
      groupCerts.every((c) => c?.stage === "certified"),
    anyDisputed: groupCerts.some(
      (c) => c?.stage === "disputed" || c?.stage === "committee-review",
    ),
    hasAmberFlag: flags.some((f) => f.kind === "amber"),
    hasRedFlag: flags.some((f) => f.kind === "red"),
  });
  const certified = state.phase === "certified";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-2xl p-4 text-left transition-shadow",
        // certified recedes into the page: no lift, sand ground, quieter ink
        certified
          ? "bg-secondary/40 shadow-none"
          : "bg-card shadow-card hover:shadow-lift",
        // attention as an edge, per the Three Flags Rule
        state.attention === "review" && "ring-1 ring-amber-flag/60",
        state.attention === "dispute" && "ring-2 ring-red-flag/70 bg-red-wash/25",
        // selection is the operator's focus and outranks the attention ring
        selected && "ring-2 ring-ink shadow-lift",
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-semibold text-foreground">
            Group {g.number}
            {g.playerIds.includes(DEMO_USER_ID) && (
              <span className="ml-1.5 rounded bg-clay-wash px-1 py-px text-[9px] font-medium text-clay-deep">
                demo user
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[10.5px] text-muted-foreground tnum">
            Teed off {g.teeTime}
            {pace?.elapsed !== undefined && (
              <> · out {formatElapsed(pace.elapsed)}</>
            )}
          </p>
          {/*
            Quiet on purpose. A group behind the field is a word between the
            caddymaster and a starter, not an alarm, and it is never shown to
            the players. See lib/pace.ts.
          */}
          {pace?.outOfPosition && (
            <p className="mt-1 text-[10.5px] text-amber-flag">
              {pace.behind} min behind the field
            </p>
          )}
          {pace?.total !== undefined && (
            <p className="mt-1 text-[10.5px] text-muted-foreground tnum">
              {formatElapsed(pace.front)} out · {formatElapsed(pace.back)} back
              · {formatElapsed(pace.total)} round
            </p>
          )}
        </div>
        <div className="flex flex-col items-end">
          {certified ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Check className="size-3.5" />
              <span className="font-serif text-[15px] leading-none">Sealed</span>
            </span>
          ) : (
            <p
              className={cn(
                "font-serif text-[22px] leading-none tnum",
                finished ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {finished ? "F" : `H${thru + 1}`}
            </p>
          )}
          {state.attention !== "none" && (
            <Flag
              className={cn(
                "mt-1 size-3",
                state.attention === "dispute" ? "text-red-flag" : "text-amber-flag",
              )}
              fill="currentColor"
            />
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-0.5">
        {g.playerIds.map((pid) => {
          const p = byId.get(pid);
          if (!p) return null;
          return (
            <p key={pid} className="flex justify-between text-[11.5px] text-ink-soft">
              <span className="truncate">{p.name}</span>
              <span className="text-muted-foreground tnum">{p.handicap}</span>
            </p>
          );
        })}
      </div>
      <div className="mt-2.5 border-t border-border/60 pt-2">
        {/*
          A plain in-progress group narrates its last moment. A group asking for
          a human, or one whose cards are in, states where it is instead: the
          status is the thing the desk needs to read, not the birdie.
        */}
        {state.attention === "none" && !certified && !finished && lastEvent ? (
          <motion.p
            key={lastEvent.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10.5px] text-muted-foreground"
          >
            <span
              className={cn(
                "font-medium",
                lastEvent.gross < lastEvent.par ? "text-clay-deep" : "text-ink-soft",
              )}
            >
              {eventWord(lastEvent.gross, lastEvent.par)}
            </span>{" "}
            · {(byId.get(lastEvent.playerId)?.name ?? "").split(" ")[1] ?? ""},{" "}
            {lastEvent.hole}th · {timeAgo(lastEvent.ts)}
          </motion.p>
        ) : (
          <p
            className={cn(
              "text-[10.5px]",
              state.attention === "dispute"
                ? "font-medium text-red-flag"
                : state.attention === "review"
                  ? "font-medium text-amber-flag"
                  : "text-muted-foreground",
            )}
          >
            {state.attention === "dispute"
              ? "Disputed, for the committee"
              : state.attention === "review"
                ? "Marker discrepancy, being resolved"
                : certified
                  ? "Certified and sealed"
                  : finished
                    ? "Card in, awaiting certification"
                    : thru > 0
                      ? "Out on the course"
                      : "Yet to score"}
          </p>
        )}
      </div>
    </button>
  );
}

function LeaderboardPanel({ isStableford }: { isStableford: boolean }) {
  const rows = useStandings(isStableford ? "points" : "net").slice(0, 10);
  return (
    <div className="overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-card">
      <div className="flex items-center justify-between px-4 pt-4 pb-2.5">
        <p className="smallcaps text-primary-foreground/60">Leaderboard</p>
        <p className="text-[10px] text-primary-foreground/60">
          {isStableford ? "Stableford pts" : "Net to par"}
        </p>
      </div>
      {rows.map((r) => (
        <motion.div
          layout="position"
          key={r.player.id}
          transition={{ type: "spring", stiffness: 350, damping: 32 }}
          className={cn(
            "flex items-center gap-2.5 border-t border-cream/5 px-4 py-2",
            r.player.id === DEMO_USER_ID && "bg-cream/5",
          )}
        >
          <span className="w-6 font-serif text-[13px] text-primary-foreground/70 tnum">
            {r.tied ? "T" : ""}
            {r.position}
          </span>
          <PlayerAvatar player={r.player} size="sm" />
          <span className="flex-1 truncate text-[12.5px]">{r.player.name}</span>
          <span className="text-[10.5px] text-primary-foreground/60 tnum">
            {r.thru >= 18 ? "F" : r.thru || "·"}
          </span>
          <motion.span
            key={isStableford ? r.points : r.netToPar}
            initial={{ scale: 1.25, color: "#E8C4B4" }}
            animate={{ scale: 1, color: "#F7F3EC" }}
            transition={{ duration: 0.7 }}
            className="w-8 text-right font-serif text-[15px] tnum"
          >
            {isStableford ? r.points : toPar(r.netToPar)}
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

function EventFeed({ byId }: { byId: Map<string, Player> }) {
  const events = useSim((s) => s.events);
  return (
    <div className="mt-4 overflow-hidden rounded-2xl bg-card shadow-card">
      <p className="smallcaps px-4 pt-3.5 pb-1 text-muted-foreground">
        Score feed
      </p>
      <div className="max-h-[300px] overflow-y-auto pb-2">
        <AnimatePresence initial={false}>
          {events.slice(0, 10).map((e) => {
            const p = byId.get(e.playerId);
            if (!p) return null;
            const under = e.gross < e.par;
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-2.5 px-4 py-1.5"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    under ? "bg-clay" : "bg-stone/50",
                  )}
                />
                <p className="flex-1 truncate text-[11.5px] text-ink-soft">
                  <span className={cn("font-medium", under && "text-clay-deep")}>
                    {eventWord(e.gross, e.par)}
                  </span>{" "}
                  · {p.name}, hole {e.hole}
                </p>
                <span className="shrink-0 text-[9.5px] text-muted-foreground">
                  {timeAgo(e.ts)}
                </span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function LiveOpsPage() {
  const router = useRouter();
  const flags = useSim((s) => s.flags);
  const scores = useRoundScores();
  const [reviewing, setReviewing] = useState<OpsFlag | null>(null);
  const [ending, setEnding] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  // The one group the desk is watching. A focus anchor, nothing more: click to
  // hold it, click again to let go.
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  // deep link: /admin/live#certification opens the Committee tab. Read on the
  // first render - this page only ever renders on the client, behind SimGate.
  const [tab, setTab] = useState(() =>
    typeof window !== "undefined" && window.location.hash === "#certification"
      ? "certs"
      : "course",
  );
  const openItems = useSim(
    (s) =>
      s.disputes.filter((d) => d.status === "open").length +
      s.corrections.filter((c) => c.status === "pending").length,
  );
  const active = useActiveTournament();

  // pilot mode never alerts pace flags during play - they live in
  // Settings > Integrity instead
  const openFlags = flags.filter(
    (f) => f.status === "open" && (!IS_PILOT || f.kind !== "red"),
  );

  const byId = new Map((active?.players ?? []).map((p) => [p.id, p] as const));

  /*
   * Pace, read off scoring that happened anyway. Recomputed on each render
   * rather than stored, because "how far behind the field" only means anything
   * relative to where the field is right now.
   */
  const now = useSlowClock();
  const paceState = useSim((s) => s.pace);
  const paceThreshold = useSim((s) => s.paceThresholdMin);
  const pairings = useSim((s) => s.pairings);
  const allScores = useSim((s) => s.scores);
  const paceBy = useMemo(() => {
    if (!active) return new Map<string, PaceReading>();
    const key = roundKey(active.tournament.id, active.round ?? 1);
    const rows = Object.values(paceState).filter((p) => p.key === key);
    const holes = groupHolesPlayed({ pairings, scores: allScores } as never, key);
    return new Map(
      paceReadings(rows, holes, now, paceThreshold).map(
        (r) => [r.groupId, r] as const,
      ),
    );
    // `scores` participates so the readings move as cards come in
  }, [active, paceState, paceThreshold, pairings, allScores, now]);
  const fieldIds = active ? active.groups.flatMap((g) => g.playerIds) : [];
  const scoresIn = fieldIds.reduce(
    (a: number, pid: string) =>
      a + (scores[pid] ?? []).filter((x) => x != null).length,
    0,
  );
  const rounds = active ? roundsOf(active.tournament) : [];
  const hasNextRound = !!active && active.round < rounds.length;
  const thisRoundCut = active
    ? (rounds.find((r) => r.number === active.round)?.cut ?? null)
    : null;
  const groupsOut = (active?.groups ?? []).filter((g) =>
    g.playerIds.some(
      (pid) => (scores[pid] ?? []).filter((x) => x != null).length < 18,
    ),
  ).length;

  if (!active) {
    return (
      <div>
        <p className="smallcaps text-muted-foreground">Live Ops</p>
        <h1 className="mt-2 font-serif text-[34px] leading-tight text-foreground">
          Nothing on the course today
        </h1>
        <p className="mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
          Start a tournament day from the tournaments list and this room comes
          alive: every group, every card, every flag.
        </p>
        <Button className="mt-6" asChild>
          <Link href="/admin/tournaments">Go to tournaments</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <header className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-3">
            <LiveBadge />
            <p className="smallcaps text-muted-foreground">
              {active.roundInfo.name}
              {rounds.length > 1 && ` of ${rounds.length}`} · first tee{" "}
              {active.roundInfo.firstTee}
            </p>
          </div>
          <h1 className="mt-2 font-serif text-[34px] leading-tight text-foreground">
            {active.tournament.name}
          </h1>
        </div>
        <div className="flex items-end gap-8 pb-1 text-right">
          {[
            { l: "Groups out", v: groupsOut },
            { l: "Scores in", v: scoresIn },
            { l: "Open flags", v: openFlags.length },
          ].map((s) => (
            <div key={s.l}>
              <p className="font-serif text-[26px] leading-none text-foreground tnum">
                {s.v}
              </p>
              <p className="smallcaps mt-1 text-[9px] text-muted-foreground">{s.l}</p>
            </div>
          ))}
          <SharePublicBoard tournamentId={active.tournament.id} />
          <Button variant="outline" asChild>
            <Link href="/admin/scores">
              <ClipboardList className="size-4" />
              Enter scores from cards
            </Link>
          </Button>
          {IS_PILOT && hasNextRound && (
            <Button variant="outline" onClick={() => setAdvancing(true)}>
              <ArrowRight className="size-4" />
              Close round
            </Button>
          )}
          {IS_PILOT && (
            <Button variant="clay" onClick={() => setEnding(true)}>
              <Flag className="size-4" />
              End tournament
            </Button>
          )}
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="mt-6">
        <TabsList className="h-11">
          <TabsTrigger value="course" className="px-5 text-[13px]">
            On course
          </TabsTrigger>
          <TabsTrigger value="certs" className="px-5 text-[13px]">
            Certification & disputes
            {openItems > 0 && (
              <span className="ml-1 rounded-full bg-amber-wash px-1.5 text-[11px] font-semibold text-amber-flag tnum">
                {openItems}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "certs" ? (
        <div className="mt-5">
          <CertificationPanel />
        </div>
      ) : (
        <>
      {openFlags.length > 0 && (
        <div className="mt-6 flex flex-col gap-2">
          <AnimatePresence>
            {openFlags.map((f) => (
              <FlagCard key={f.id} flag={f} onReview={() => setReviewing(f)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <div className="mt-6 grid grid-cols-[1fr_300px] gap-6">
        <div className="grid grid-cols-3 gap-3">
          {active.groups.map((g) => (
            <GroupCard
              key={g.id}
              g={g}
              byId={byId}
              pace={paceBy.get(g.id)}
              selected={selectedGroup === g.id}
              onSelect={() =>
                setSelectedGroup((prev) => (prev === g.id ? null : g.id))
              }
            />
          ))}
          {active.groups.length === 0 && (
            <p className="col-span-3 rounded-2xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
              No pairings saved yet. Set them in Pairings & tee times.
            </p>
          )}
        </div>
        <div>
          <LeaderboardPanel isStableford={active.tournament.format === "Stableford"} />
          <EventFeed byId={byId} />
        </div>
      </div>
        </>
      )}

      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent className="max-w-md">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle className="text-amber-flag">
                  {reviewing.message}
                </DialogTitle>
                <DialogDescription className="leading-relaxed">
                  {reviewing.detail}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl bg-secondary/50 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground">
                {reviewing.kind === "red"
                  ? "Shimo watches every card against expected scoring for the player's handicap. Flags are advisory. The Committee always decides."
                  : "Both players have been prompted on their phones to re-confirm this hole at the next tee. Most discrepancies clear themselves within a hole."}
              </div>
              <Button
                variant="default"
                onClick={() => {
                  reviewFlag(reviewing.id);
                  setReviewing(null);
                }}
              >
                Mark as reviewed
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={advancing} onOpenChange={setAdvancing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close {active.roundInfo.name}?</DialogTitle>
            <DialogDescription className="leading-relaxed">
              {thisRoundCut
                ? `The field is cut to the leading ${thisRoundCut.topN} and ties, and the next round is paired from the leaderboard with the leaders out last. Cards already certified stay locked.`
                : "The next round opens, paired from the leaderboard with the leaders out last. Cards already certified stay locked."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdvancing(false)}>
              Not yet
            </Button>
            <Button
              variant="clay"
              onClick={() => {
                startNextRound(active.tournament.id);
                setAdvancing(false);
              }}
            >
              <ArrowRight className="size-4" />
              Open the next round
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ending} onOpenChange={setEnding}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>End {active.tournament.name}?</DialogTitle>
            <DialogDescription className="leading-relaxed">
              This freezes the final standings and closes live scoring. You&apos;ll
              go straight to the prizegiving summary: winners by division, prizes,
              and the full field. The board stays viewable afterwards.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnding(false)}>
              Not yet
            </Button>
            <Button
              variant="clay"
              onClick={() => {
                const id = active.tournament.id;
                endTournamentDay(id);
                setEnding(false);
                router.push(`/admin/tournaments/${id}/summary`);
              }}
            >
              <Trophy className="size-4" />
              End &amp; see results
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
