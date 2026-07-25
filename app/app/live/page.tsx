"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  PenLine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LiveBadge } from "@/components/live-dot";
import { SyncStrip } from "@/components/sync-status";
import {
  CardReturnedView,
  CertificationCeremony,
  HandicapChain,
  LocationConsentCard,
} from "@/components/golfer/certification";
import {
  DEMO_USER_ID,
  MARKER_ID,
  clubById,
  courseById,
  playerById,
} from "@/lib/data";
import { stablefordPoints, strokesReceived, handicapSet } from "@/lib/scoring";
import {
  useActiveTournament,
  useMeId,
  useUserLive,
  playerStats,
} from "@/lib/sim/hooks";
import {
  LIVE_COURSE,
  LIVE_TOURNAMENT,
  enterMarkerScore,
  enterMarkerScoreFor,
  enterOwnScore,
  enterOwnScorePilot,
  markedByMe,
  markerOf,
  resolveDiscrepancy,
  setHideLeaderboard,
  useSim,
} from "@/lib/sim/store";
import { IS_PILOT } from "@/lib/mode";
import { cn, ordinal, toPar } from "@/lib/utils";

/** Shared empty card so a missing entry never allocates on every render. */
const EMPTY_CARD: (number | null)[] = Array(18).fill(null);

const JOE = playerById(DEMO_USER_ID);
const DAVID = playerById(MARKER_ID);
const JOE_PH = handicapSet(JOE.handicap, LIVE_COURSE, LIVE_TOURNAMENT.handicapAllowance).ph;
const DAVID_PH = handicapSet(DAVID.handicap, LIVE_COURSE, LIVE_TOURNAMENT.handicapAllowance).ph;

/* ------------------------------------------------------------------ */

function scoreLabel(gross: number, par: number) {
  const d = gross - par;
  if (d <= -2) return "Eagle";
  if (d === -1) return "Birdie";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  return `+${d}`;
}

/** classic card notation: circles for birdies, squares for bogeys */
function ScoreCell({
  gross,
  par,
  dim,
  flash,
}: {
  gross: number | null;
  par: number;
  dim?: boolean;
  flash?: boolean;
}) {
  if (gross == null)
    return <span className="text-muted-foreground/40">·</span>;
  const d = gross - par;
  return (
    <span
      className={cn(
        "inline-flex size-6 items-center justify-center text-[12.5px] tnum",
        d === -1 && "rounded-full border border-clay text-clay-deep",
        d <= -2 && "rounded-full border-2 border-clay text-clay-deep",
        d === 1 && "rounded-sm border border-stone/60 text-ink-soft",
        d >= 2 && "rounded-sm border-2 border-stone/60 text-ink-soft",
        d === 0 && "text-foreground",
        dim && "opacity-60",
        flash && "score-flash rounded-md",
      )}
    >
      {gross}
    </span>
  );
}

function ScorePad({
  par,
  onPick,
}: {
  par: number;
  onPick: (gross: number) => void;
}) {
  const values = Array.from({ length: 7 }, (_, i) => Math.max(1, par - 2) + i);
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {values.map((v) => (
        <motion.button
          key={v}
          whileTap={{ scale: 0.9 }}
          onClick={() => onPick(v)}
          className={cn(
            "flex h-12 flex-col items-center justify-center rounded-xl border text-[17px] font-medium tnum transition-colors cursor-pointer",
            v === par
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:border-stone/60",
          )}
        >
          {v}
          <span
            className={cn(
              "text-[8px] font-normal tracking-wide uppercase",
              v === par ? "text-primary-foreground/60" : "text-muted-foreground",
            )}
          >
            {scoreLabel(v, par)}
          </span>
        </motion.button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function LiveScoringPage() {
  if (IS_PILOT) return <PilotLiveTab />;
  return <DemoLiveScoring />;
}

/**
 * Pilot Live tab. If this device belongs to a player in today's field, they
 * score their own ball and mark one playing partner, exactly as on paper. If
 * not (a spectator, or the club running the desk), it stays a follow-only view.
 */
function PilotLiveTab() {
  const active = useActiveTournament();
  const me = useMeId();

  const myGroup = active?.groups.find((g) => g.playerIds.includes(me));

  if (active && me && myGroup) {
    return <PilotScoring />;
  }

  return (
    <div className="px-5 pt-5">
      <header className="flex items-center gap-2">
        {active && <LiveBadge />}
        <p className="smallcaps text-muted-foreground">Live</p>
      </header>
      {active ? (
        <div className="mt-5 overflow-hidden rounded-2xl bg-primary text-primary-foreground shadow-lift">
          <div className="p-6">
            <h1 className="font-serif text-[24px] leading-tight">
              {active.tournament.name}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-primary-foreground/70">
              {me
                ? "You're not in today's field. Follow the board as the cards come in."
                : "Sign in from Profile to score your own card. Until then, follow the board live."}
            </p>
          </div>
          <Link
            href="/app/leaderboard"
            className="block bg-clay py-3.5 text-center text-[15px] font-medium text-white transition-colors hover:bg-clay-deep"
          >
            Follow the leaderboard
          </Link>
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card/50 p-8 text-center">
          <p className="font-serif text-xl text-foreground">No round today</p>
          <p className="mx-auto mt-2 max-w-[260px] text-[15px] leading-relaxed text-muted-foreground">
            When the club starts a tournament day, it appears here and on the
            leaderboard.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Real dual entry for the signed-in player: their own ball on top, the partner
 * they mark below. Both land locally the instant they're tapped and sync as
 * separate figures, so a disagreement survives to the attestation step instead
 * of one phone quietly overwriting the other.
 */
function PilotScoring() {
  const active = useActiveTournament()!;
  const me = useMeId();
  const scores = useSim((s) => s.scores);
  const markerScores = useSim((s) => s.markerScores);
  const certs = useSim((s) => s.certifications);
  const hidden = useSim((s) => s.hideLeaderboard);

  const tournament = active.tournament;
  const course = courseById(tournament.courseId);
  const group = active.groups.find((g) => g.playerIds.includes(me));
  const marksId = markedByMe(group, me);
  const markedById = markerOf(group, me);

  const byId = useMemo(
    () => new Map(active.players.map((p) => [p.id, p] as const)),
    [active.players],
  );
  const mePlayer = byId.get(me);
  const marksPlayer = marksId ? byId.get(marksId) : undefined;

  const myCard = scores[me] ?? EMPTY_CARD;
  const myMarkerView = markerScores[me] ?? EMPTY_CARD; // what my marker has for me
  const theirCard = marksId ? (markerScores[marksId] ?? EMPTY_CARD) : EMPTY_CARD;
  const theirOwn = marksId ? (scores[marksId] ?? EMPTY_CARD) : EMPTY_CARD;

  // first hole still needing an entry on this phone
  const currentIdx = useMemo(() => {
    const a = myCard.findIndex((x) => x == null);
    const b = marksId ? theirCard.findIndex((x) => x == null) : -1;
    if (a === -1 && b === -1) return 18;
    return Math.min(a === -1 ? 18 : a, b === -1 ? 18 : b);
  }, [myCard, theirCard, marksId]);

  const [pinned, setPinned] = useState<number | null>(null);
  const selected = pinned ?? Math.min(currentIdx, 17);
  const hole = course.holes[selected];

  const myPh = handicapSet(
    mePlayer?.handicap ?? 0,
    course,
    tournament.handicapAllowance,
  ).ph;
  const theirPh = handicapSet(
    marksPlayer?.handicap ?? 0,
    course,
    tournament.handicapAllowance,
  ).ph;

  const myStats = playerStats(scores, me, course, tournament.handicapAllowance);
  const roundComplete = currentIdx === 18;
  const myCert = certs[me];
  // the card is back with the committee once certified (or a DQ was recorded)
  const returned = myCert?.stage === "certified" || myCert?.stage === "dq";

  if (!mePlayer || !group) return null;

  return (
    <div className="px-5 pt-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LiveBadge />
            <p className="smallcaps truncate text-muted-foreground">
              Group {group.number} · Tee {group.teeTime}
            </p>
          </div>
          <h1 className="mt-2 font-serif text-[24px] leading-tight text-foreground">
            {tournament.name}
          </h1>
          <HandicapChain
            playerId={me}
            course={course}
            allowance={tournament.handicapAllowance}
          />
        </div>
        <button
          onClick={() => setHideLeaderboard(!hidden)}
          className={cn(
            "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer",
            hidden
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
          title={hidden ? "Show leaderboard" : "Hide leaderboard (play blind)"}
        >
          {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </header>

      <SyncStrip className="mt-3" />
      {!returned && !roundComplete && <LocationConsentCard />}

      {returned ? (
        <CardReturnedView
          me={me}
          points={myStats.points}
          gross={myStats.grossTotal}
          netToPar={myStats.netToPar}
          position="on the board"
          hidden={hidden}
          correctionWindowMin={tournament.correctionWindowMin}
          clubShort={clubById(tournament.clubId).short}
          course={course}
        />
      ) : (
        <>
          {/* hole navigator */}
          <div className="no-scrollbar -mx-5 mt-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
            {course.holes.map((h, i) => {
              const entered = myCard[i] != null;
              const isCur = i === Math.min(currentIdx, 17) && pinned == null;
              const isSel = i === selected;
              return (
                <button
                  key={h.hole}
                  onClick={() => setPinned(i === Math.min(currentIdx, 17) ? null : i)}
                  className={cn(
                    "flex size-11 shrink-0 flex-col items-center justify-center rounded-full border text-[14px] font-medium tnum transition-all cursor-pointer",
                    isSel
                      ? "border-clay bg-clay text-white"
                      : entered
                        ? "border-transparent bg-secondary text-ink-soft"
                        : "border-border bg-card text-muted-foreground",
                    isCur && !isSel && "border-clay/50",
                  )}
                >
                  {entered && !isSel ? myCard[i] : h.hole}
                </button>
              );
            })}
          </div>

          {roundComplete ? (
            <CertificationCeremony
              me={me}
              marks={marksId ?? me}
              markedBy={markedById ?? me}
              course={course}
            />
          ) : (
            <>
              {/* hole header */}
              <div className="mt-5 flex items-end justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-[40px] leading-none text-foreground tnum">
                    {hole.hole}
                  </span>
                  <span className="smallcaps text-muted-foreground">Hole</span>
                </div>
                <div className="flex gap-4 pb-1 text-right">
                  {[
                    { l: "Par", v: hole.par },
                    { l: "SI", v: hole.si },
                    { l: "Yards", v: hole.yards },
                  ].map((x) => (
                    <div key={x.l}>
                      <p className="font-serif text-[17px] leading-none text-foreground tnum">
                        {x.v}
                      </p>
                      <p className="smallcaps mt-1 text-[9px] text-muted-foreground">
                        {x.l}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3">
                <PlayerEntry
                  title="Your ball"
                  name={mePlayer.name}
                  ph={myPh}
                  strokes={strokesReceived(myPh, hole.si)}
                  gross={myCard[selected]}
                  par={hole.par}
                  status={
                    myCard[selected] == null
                      ? null
                      : myMarkerView[selected] == null
                        ? "syncing"
                        : myMarkerView[selected] === myCard[selected]
                          ? "confirmed"
                          : "differs"
                  }
                  markerName={
                    markedById
                      ? (byId.get(markedById)?.name.split(" ")[0] ?? "your marker")
                      : "your marker"
                  }
                  onPick={(g) => enterOwnScorePilot(selected, g)}
                />
                {marksId && marksPlayer ? (
                  <PlayerEntry
                    title="You mark"
                    name={marksPlayer.name}
                    ph={theirPh}
                    strokes={strokesReceived(theirPh, hole.si)}
                    gross={theirCard[selected]}
                    par={hole.par}
                    status={
                      theirCard[selected] == null
                        ? null
                        : theirOwn[selected] == null
                          ? "syncing"
                          : theirOwn[selected] === theirCard[selected]
                            ? "confirmed"
                            : "differs"
                    }
                    markerName="their phone"
                    onPick={(g) => enterMarkerScoreFor(marksId, selected, g)}
                  />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-card/50 p-4 text-center">
                    <p className="text-[13px] leading-relaxed text-muted-foreground">
                      You&apos;re playing alone in this group, so there&apos;s no
                      card to mark. The desk will attest yours.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* running totals */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { l: "Points", v: myStats.points },
              { l: "Gross", v: myStats.grossTotal },
              { l: "Net", v: toPar(myStats.netToPar) },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-card py-3 text-center shadow-card">
                <p className="font-serif text-xl text-foreground tnum">{s.v}</p>
                <p className="smallcaps text-[9px] text-muted-foreground">
                  {s.l} · thru {myStats.thru}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function DemoLiveScoring() {
  const scores = useSim((s) => s.scores);
  const markerScores = useSim((s) => s.markerScores);
  const attested = useSim((s) => s.attested);
  const hidden = useSim((s) => s.hideLeaderboard);
  const me = useUserLive();

  const joeCard = scores[DEMO_USER_ID];
  const joeMarkerView = markerScores[DEMO_USER_ID]; // what David has for Joe
  const davidCard = markerScores[MARKER_ID]; // what Joe has for David
  const davidOwn = scores[MARKER_ID];

  // first hole still needing an entry on this phone
  const currentIdx = useMemo(() => {
    const j = joeCard.findIndex((x) => x == null);
    const d = davidCard.findIndex((x) => x == null);
    if (j === -1 && d === -1) return 18;
    return Math.min(j === -1 ? 18 : j, d === -1 ? 18 : d);
  }, [joeCard, davidCard]);

  const [pinned, setPinned] = useState<number | null>(null);
  const selected = pinned ?? Math.min(currentIdx, 17);
  const hole = LIVE_COURSE.holes[selected];

  // discrepancies on Joe's card (marker disagrees)
  const discrepancies = useMemo(
    () =>
      joeCard
        .map((own, i) =>
          own != null && joeMarkerView[i] != null && joeMarkerView[i] !== own
            ? i
            : -1,
        )
        .filter((i) => i >= 0),
    [joeCard, joeMarkerView],
  );

  const [resolveOpen, setResolveOpen] = useState(false);
  // ceremony opens once every hole is entered — discrepancies are agreed
  // (or disputed to the Committee) inside the ceremony itself
  const roundComplete = currentIdx === 18;

  const joeStats = playerStats(scores, DEMO_USER_ID);

  return (
    <div className="px-5 pt-5">
      {/* header */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <LiveBadge />
            <p className="smallcaps text-muted-foreground">Group 5 · Tee 08:10</p>
          </div>
          <h1 className="mt-2 font-serif text-[24px] leading-tight text-foreground">
            {LIVE_TOURNAMENT.name}
          </h1>
          <HandicapChain playerId={DEMO_USER_ID} />
        </div>
        <button
          onClick={() => setHideLeaderboard(!hidden)}
          className={cn(
            "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors cursor-pointer",
            hidden
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-muted-foreground hover:text-foreground",
          )}
          title={hidden ? "Show leaderboard" : "Hide leaderboard (play blind)"}
        >
          {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </header>

      {/* position strip — respects scoreboard blindness */}
      {!hidden && !attested && (
        <Link
          href="/app/leaderboard"
          className="mt-4 flex items-center justify-between rounded-xl bg-card px-4 py-3 shadow-card transition-shadow hover:shadow-lift"
        >
          <div className="flex items-baseline gap-3">
            <span className="font-serif text-xl text-foreground tnum">
              {me.tied ? "T" : ""}
              {me.position}
              <span className="text-xs text-muted-foreground">/{36}</span>
            </span>
            <span className="text-[13px] text-ink-soft tnum">
              {me.points} pts thru {me.thru}
            </span>
            <span className="text-xs text-muted-foreground tnum">
              {me.gap === 0 ? "leading" : `${me.gap} back`}
            </span>
          </div>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      )}
      {hidden && !attested && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-transparent px-4 py-3">
          <EyeOff className="size-3.5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Scoreboard hidden. Just you and the course until you sign.
          </p>
        </div>
      )}

      <SyncStrip className="mt-3" />
      {!attested && !roundComplete && <LocationConsentCard />}

      {/* discrepancy banner */}
      <AnimatePresence>
        {discrepancies.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: -6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -6, height: 0 }}
            onClick={() => setResolveOpen(true)}
            className="mt-3 flex w-full items-center gap-2.5 overflow-hidden rounded-xl border border-amber-flag/30 bg-amber-wash px-4 py-3 text-left cursor-pointer"
          >
            <AlertTriangle className="size-4 shrink-0 text-amber-flag" />
            <div className="flex-1">
              <p className="text-[13px] font-medium text-amber-flag">
                Check with your marker: hole {discrepancies[0] + 1} differs
              </p>
              <p className="text-[11px] text-amber-flag/70">
                Tap to compare and agree the score
              </p>
            </div>
            <ChevronRight className="size-4 text-amber-flag/60" />
          </motion.button>
        )}
      </AnimatePresence>

      {attested ? (
        <CardReturnedView
          points={joeStats.points}
          gross={joeStats.grossTotal}
          netToPar={joeStats.netToPar}
          position={`currently ${ordinal(me.position)}`}
          hidden={hidden}
        />
      ) : (
        <>
          {/* hole navigator */}
          <div className="no-scrollbar -mx-5 mt-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
            {LIVE_COURSE.holes.map((h, i) => {
              const entered = joeCard[i] != null;
              const isCur = i === Math.min(currentIdx, 17) && pinned == null;
              const isSel = i === selected;
              return (
                <button
                  key={h.hole}
                  onClick={() => setPinned(i === Math.min(currentIdx, 17) ? null : i)}
                  className={cn(
                    "flex size-11 shrink-0 flex-col items-center justify-center rounded-full border text-[14px] font-medium tnum transition-all cursor-pointer",
                    isSel
                      ? "border-clay bg-clay text-white"
                      : entered
                        ? "border-transparent bg-secondary text-ink-soft"
                        : "border-border bg-card text-muted-foreground",
                    isCur && !isSel && "border-clay/50",
                  )}
                >
                  {entered && !isSel ? joeCard[i] : h.hole}
                </button>
              );
            })}
          </div>

          {roundComplete ? (
            <CertificationCeremony />
          ) : (
            <>
              {/* hole header */}
              <div className="mt-5 flex items-end justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-[40px] leading-none text-foreground tnum">
                    {hole.hole}
                  </span>
                  <span className="smallcaps text-muted-foreground">Hole</span>
                </div>
                <div className="flex gap-4 pb-1 text-right">
                  {[
                    { l: "Par", v: hole.par },
                    { l: "SI", v: hole.si },
                    { l: "Yards", v: hole.yards },
                  ].map((x) => (
                    <div key={x.l}>
                      <p className="font-serif text-[17px] leading-none text-foreground tnum">
                        {x.v}
                      </p>
                      <p className="smallcaps mt-1 text-[9px] text-muted-foreground">
                        {x.l}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* the two cards — you and the player you mark */}
              <div className="mt-4 grid grid-cols-1 gap-3">
                <PlayerEntry
                  title="Your ball"
                  name={JOE.name}
                  ph={JOE_PH}
                  strokes={strokesReceived(JOE_PH, hole.si)}
                  gross={joeCard[selected]}
                  par={hole.par}
                  status={
                    joeCard[selected] == null
                      ? null
                      : joeMarkerView[selected] == null
                        ? "syncing"
                        : joeMarkerView[selected] === joeCard[selected]
                          ? "confirmed"
                          : "differs"
                  }
                  markerName="David"
                  onPick={(g) => enterOwnScore(selected, g)}
                />
                <PlayerEntry
                  title="You mark"
                  name={DAVID.name}
                  ph={DAVID_PH}
                  strokes={strokesReceived(DAVID_PH, hole.si)}
                  gross={davidCard[selected]}
                  par={hole.par}
                  status={
                    davidCard[selected] == null
                      ? null
                      : davidOwn[selected] == null
                        ? "syncing"
                        : "confirmed"
                  }
                  markerName="his phone"
                  onPick={(g) => enterMarkerScore(selected, g)}
                />
              </div>
            </>
          )}

          {/* running totals */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { l: "Points", v: joeStats.points },
              { l: "Gross", v: joeStats.grossTotal },
              { l: "Net", v: toPar(joeStats.netToPar) },
            ].map((s) => (
              <div key={s.l} className="rounded-xl bg-card py-3 text-center shadow-card">
                <p className="font-serif text-xl text-foreground tnum">{s.v}</p>
                <p className="smallcaps text-[9px] text-muted-foreground">
                  {s.l} · thru {joeStats.thru}
                </p>
              </div>
            ))}
          </div>

          <DualScorecard
            selected={selected}
            joeCard={joeCard}
            joeMarkerView={joeMarkerView}
            davidCard={davidCard}
            discrepancies={discrepancies}
          />
        </>
      )}

      <ResolveDialog
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        holeIdx={discrepancies[0] ?? null}
        own={discrepancies.length ? joeCard[discrepancies[0]] : null}
        marker={discrepancies.length ? joeMarkerView[discrepancies[0]] : null}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

function PlayerEntry({
  title,
  name,
  ph,
  strokes,
  gross,
  par,
  status,
  markerName,
  onPick,
}: {
  title: string;
  name: string;
  ph: number;
  strokes: number;
  gross: number | null;
  par: number;
  status: null | "syncing" | "confirmed" | "differs";
  markerName: string;
  onPick: (g: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  useEffect(() => setEditing(false), [gross]);

  return (
    <div className="rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <div>
          <p className="smallcaps text-[9px] text-clay">{title}</p>
          <p className="mt-0.5 text-[14px] font-medium text-foreground">
            {name}
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground tnum">
              PH {ph}
            </span>
          </p>
        </div>
        {strokes > 0 && (
          <span className="rounded-full bg-clay-wash px-2 py-0.5 text-[10px] font-medium text-clay-deep">
            {strokes} stroke{strokes > 1 ? "s" : ""} here
          </span>
        )}
      </div>

      <div className="mt-3">
        {gross != null && !editing ? (
          <div className="flex items-center justify-between">
            <div className="flex items-baseline gap-2.5">
              <motion.span
                key={gross}
                initial={{ scale: 1.25, color: "#B84A2E" }}
                animate={{ scale: 1, color: "#1A2332" }}
                transition={{ duration: 0.4 }}
                className="font-serif text-[38px] leading-none tnum"
              >
                {gross}
              </motion.span>
              <span className="text-xs text-muted-foreground">
                {scoreLabel(gross, par)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {status === "syncing" && (
                <span className="flex items-center gap-1 text-[10.5px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" />
                  syncing
                </span>
              )}
              {status === "confirmed" && (
                <span className="flex items-center gap-1 text-[10.5px] text-clay-deep">
                  <Check className="size-3" />
                  matches {markerName}
                </span>
              )}
              {status === "differs" && (
                <span className="flex items-center gap-1 text-[10.5px] font-medium text-amber-flag">
                  <AlertTriangle className="size-3" />
                  differs
                </span>
              )}
              <button
                onClick={() => setEditing(true)}
                className="min-h-11 rounded-lg border border-border px-3.5 text-[14px] text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Edit
              </button>
            </div>
          </div>
        ) : (
          <ScorePad par={par} onPick={onPick} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DualScorecard({
  selected,
  joeCard,
  joeMarkerView,
  davidCard,
  discrepancies,
}: {
  selected: number;
  joeCard: (number | null)[];
  joeMarkerView: (number | null)[];
  davidCard: (number | null)[];
  discrepancies: number[];
}) {
  const joePts = (i: number) =>
    joeCard[i] == null
      ? null
      : stablefordPoints(LIVE_COURSE.holes[i], joeCard[i]!, JOE_PH);

  const sum = (arr: (number | null)[], from: number, to: number) => {
    let s = 0;
    let any = false;
    for (let i = from; i < to; i++) {
      if (arr[i] != null) {
        s += arr[i]!;
        any = true;
      }
    }
    return any ? s : null;
  };
  const ptsArr = LIVE_COURSE.holes.map((_, i) => joePts(i));

  const Row = ({ i }: { i: number }) => {
    const h = LIVE_COURSE.holes[i];
    const isDisc = discrepancies.includes(i);
    return (
      <tr
        className={cn(
          "border-t border-border/60",
          i === selected && "bg-secondary/50",
          isDisc && "bg-amber-wash/70",
        )}
      >
        <td className="py-1.5 pl-4 text-left text-[12.5px] font-medium text-foreground tnum">
          {h.hole}
        </td>
        <td className="text-center text-[11.5px] text-muted-foreground tnum">{h.par}</td>
        <td className="text-center text-[11.5px] text-muted-foreground tnum">{h.si}</td>
        <td className="text-center text-[11.5px] text-muted-foreground tnum">{h.yards}</td>
        <td className="text-center">
          <ScoreCell gross={joeCard[i]} par={h.par} />
          {isDisc && (
            <span className="ml-0.5 align-middle text-[9px] text-amber-flag">
              ({joeMarkerView[i]})
            </span>
          )}
        </td>
        <td className="text-center text-[12px] font-medium text-clay-deep tnum">
          {ptsArr[i] ?? ""}
        </td>
        <td className="pr-4 text-center">
          <ScoreCell gross={davidCard[i]} par={h.par} dim />
        </td>
      </tr>
    );
  };

  const TotalRow = ({ label, from, to }: { label: string; from: number; to: number }) => (
    <tr className="border-t border-border bg-secondary/40">
      <td className="py-1.5 pl-4 text-left text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </td>
      <td className="text-center text-[11.5px] text-muted-foreground tnum">
        {LIVE_COURSE.holes.slice(from, to).reduce((a, h) => a + h.par, 0)}
      </td>
      <td />
      <td className="text-center text-[11.5px] text-muted-foreground tnum">
        {LIVE_COURSE.holes.slice(from, to).reduce((a, h) => a + h.yards, 0)}
      </td>
      <td className="text-center text-[13px] font-semibold text-foreground tnum">
        {sum(joeCard, from, to) ?? "·"}
      </td>
      <td className="text-center text-[12.5px] font-semibold text-clay-deep tnum">
        {sum(ptsArr, from, to) ?? ""}
      </td>
      <td className="pr-4 text-center text-[13px] font-medium text-ink-soft tnum">
        {sum(davidCard, from, to) ?? "·"}
      </td>
    </tr>
  );

  return (
    <div className="mt-5 overflow-hidden rounded-2xl bg-card pb-1 shadow-card">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <p className="smallcaps text-muted-foreground">Marker-swap card</p>
        <p className="text-[10px] text-muted-foreground">
          You keep {DAVID.name.split(" ")[0]}&apos;s card · he keeps yours
        </p>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[9px] uppercase tracking-wider text-muted-foreground">
            <th className="pb-1.5 pl-4 text-left font-medium">Hole</th>
            <th className="pb-1.5 text-center font-medium">Par</th>
            <th className="pb-1.5 text-center font-medium">SI</th>
            <th className="pb-1.5 text-center font-medium">Yds</th>
            <th className="pb-1.5 text-center font-medium text-foreground">You</th>
            <th className="pb-1.5 text-center font-medium text-clay-deep">Pts</th>
            <th className="pb-1.5 pr-4 text-center font-medium">
              {DAVID.name.split(" ")[0]}
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 9 }, (_, i) => (
            <Row key={i} i={i} />
          ))}
          <TotalRow label="Out" from={0} to={9} />
          {Array.from({ length: 9 }, (_, i) => (
            <Row key={i + 9} i={i + 9} />
          ))}
          <TotalRow label="In" from={9} to={18} />
          <TotalRow label="Total" from={0} to={18} />
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ResolveDialog({
  open,
  onOpenChange,
  holeIdx,
  own,
  marker,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holeIdx: number | null;
  own: number | null;
  marker: number | null;
}) {
  if (holeIdx == null || own == null || marker == null)
    return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Hole {holeIdx + 1}: cards differ</DialogTitle>
          <DialogDescription>
            Agree the score with David before you both sign. This is the digital
            version of comparing cards on the next tee.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-secondary/60 p-4 text-center">
            <p className="smallcaps text-[9px] text-muted-foreground">Your card</p>
            <p className="mt-1 font-serif text-4xl text-foreground tnum">{own}</p>
          </div>
          <div className="rounded-xl bg-amber-wash p-4 text-center">
            <p className="smallcaps text-[9px] text-amber-flag">David has you on</p>
            <p className="mt-1 font-serif text-4xl text-amber-flag tnum">{marker}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant="default"
            onClick={() => {
              resolveDiscrepancy(DEMO_USER_ID, holeIdx, own);
              onOpenChange(false);
            }}
          >
            Keep my {own} (David amends his card)
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              resolveDiscrepancy(DEMO_USER_ID, holeIdx, marker);
              onOpenChange(false);
            }}
          >
            David&apos;s right, make it {marker}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
