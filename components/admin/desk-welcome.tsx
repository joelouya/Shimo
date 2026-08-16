"use client";

/**
 * First run at the desk.
 *
 * A club setting Shimo up for the first time has real work to do before a
 * tournament day makes sense: its own crest and colour, its members, and a
 * first event on the calendar. So this is that work, laid out as an unhurried
 * desktop flow rather than a page of screenshots, and every step leaves a
 * usable result behind rather than a tutorial.
 *
 * Six steps: a welcome that names the club, club identity with a live preview,
 * a member import, a real first tournament, a short tour of where the day
 * lives, and a close that offers to send invitations now or later. The crest
 * at the top never moves, so the flow reads as one desk rather than six.
 */

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Mail,
  Radio,
  Trophy,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/logo";
import { ClubIdentityCard } from "@/components/admin/club-identity";
import { CsvImportCard } from "@/components/admin/csv-import";
import { clubById, courseById, COURSES } from "@/lib/data";
import { makeRound, withRoundsSynced } from "@/lib/rounds";
import {
  createTournament,
  inviteAllMembers,
  setDeskWelcomed,
  useSim,
} from "@/lib/sim/store";
import type { Format, Tournament } from "@/lib/types";

const EASE = [0.23, 1, 0.32, 1] as const;

/** The club this console administers. */
const CLUB_ID = "muthaiga";

type Step = "welcome" | "identity" | "members" | "tournament" | "tour" | "done";
const ORDER: Step[] = [
  "welcome",
  "identity",
  "members",
  "tournament",
  "tour",
  "done",
];

const FORMATS: Format[] = ["Stableford", "Stroke Play", "Better Ball"];

export function DeskWelcome() {
  const welcomed = useSim((s) => s.deskWelcomed);
  const rosterCount = useSim((s) => s.roster.length);
  const still = useReducedMotion();

  const show = !welcomed;

  const [step, setStep] = useState<Step>("welcome");
  const [dir, setDir] = useState(1);
  const idx = ORDER.indexOf(step);

  const club = clubById(CLUB_ID);

  const go = (next: Step) => {
    setDir(ORDER.indexOf(next) >= idx ? 1 : -1);
    setStep(next);
  };
  // The overlay closes by unmounting the moment the flag flips, and the CSS
  // entrance does not need an exit, so setting the flag is the whole of it.
  const finish = () => setDeskWelcomed(true);

  if (!show) return null;

  /*
   * The overlay entrance is CSS, not framer. This panel mounts at the same
   * moment the field simulation runs its boot burst, and a main-thread
   * entrance animation started in that window can be starved and freeze
   * part-way. The compositor animation completes on wall-clock time. Step
   * transitions below stay on framer: they fire after mount, once the burst
   * has passed.
   */
  return (
    <div className="animate-enter-fade fixed inset-0 z-50 flex items-center justify-center bg-ink/25 p-6 backdrop-blur-[2px]">
      <div className="animate-enter-rise flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-background shadow-pane">
            {/* header: the crest is the anchor that never moves, and a thin
                line fills as the flow advances instead of a step counter */}
            <div className="flex items-center gap-4 border-b border-border/60 px-8 py-5">
              <LogoMark className="size-7 shrink-0" />
              <span className="smallcaps text-muted-foreground">
                Setting up {club.name}
              </span>
              <span className="ml-auto h-0.5 w-40 overflow-hidden rounded-full bg-border">
                <motion.span
                  className="block h-full w-full origin-left rounded-full bg-clay"
                  initial={false}
                  animate={{ scaleX: (idx + 1) / ORDER.length }}
                  transition={{ duration: 0.5, ease: EASE }}
                />
              </span>
            </div>

            <div className="relative flex-1 overflow-y-auto px-8 py-7">
              <AnimatePresence initial={false} mode="wait">
                <motion.div
                  key={step}
                  initial={still ? { opacity: 0 } : { opacity: 0, x: dir >= 0 ? 24 : -24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={still ? { opacity: 0 } : { opacity: 0, x: dir >= 0 ? -18 : 18 }}
                  transition={{ duration: 0.32, ease: EASE }}
                >
                  {step === "welcome" && (
                    <Welcome clubName={club.name} onNext={() => go("identity")} />
                  )}
                  {step === "identity" && (
                    <IdentityStep
                      onBack={() => go("welcome")}
                      onNext={() => go("members")}
                    />
                  )}
                  {step === "members" && (
                    <MembersStep
                      onBack={() => go("identity")}
                      onNext={() => go("tournament")}
                    />
                  )}
                  {step === "tournament" && (
                    <TournamentStep
                      onBack={() => go("members")}
                      onNext={() => go("tour")}
                    />
                  )}
                  {step === "tour" && (
                    <TourStep
                      onBack={() => go("tournament")}
                      onNext={() => go("done")}
                    />
                  )}
                  {step === "done" && (
                    <DoneStep rosterCount={rosterCount} onFinish={finish} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Steps
 * ------------------------------------------------------------------ */

function StepHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub?: string }) {
  return (
    <div className="mb-6">
      <p className="smallcaps text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-1.5 font-serif text-[30px] leading-tight text-foreground">
        {title}
      </h2>
      {sub && (
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-soft">
          {sub}
        </p>
      )}
    </div>
  );
}

/** A consistent footer so the primary action lands in the same place each step. */
function StepFoot({
  onBack,
  onNext,
  nextLabel = "Continue",
  skip,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  skip?: { label: string; onSkip: () => void };
}) {
  return (
    <div className="mt-7 flex items-center gap-3 border-t border-border/60 pt-5">
      {onBack && (
        <Button variant="ghost" className="text-muted-foreground" onClick={onBack}>
          Back
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {skip && (
          <Button variant="ghost" className="text-muted-foreground" onClick={skip.onSkip}>
            {skip.label}
          </Button>
        )}
        <Button variant="clay" size="lg" onClick={onNext}>
          {nextLabel}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function Welcome({ clubName, onNext }: { clubName: string; onNext: () => void }) {
  return (
    <div>
      <motion.div
        className="flex size-14 items-center justify-center rounded-2xl bg-clay-wash"
        initial={{ rotate: -8 }}
        animate={{ rotate: 0 }}
        transition={{ duration: 0.9, ease: EASE }}
      >
        <LogoMark className="size-8" />
      </motion.div>
      <h2 className="mt-5 font-serif text-[30px] leading-tight text-foreground">
        Welcome, {clubName}
      </h2>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
        This sets up your tournament desk. Your crest and colour, your members,
        and your first event, in a few unhurried steps. Everything you enter is
        real and stays when you finish.
      </p>
      <div className="mt-7 border-t border-border/60 pt-5">
        <Button variant="clay" size="lg" onClick={onNext}>
          Get started
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function IdentityStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div>
      <StepHead
        eyebrow="Step one"
        title="Make it your club"
        sub="Your crest, your colour and how members reach you. The preview shows exactly where they land as you choose."
      />
      <ClubIdentityCard />
      <StepFoot onBack={onBack} onNext={onNext} />
    </div>
  );
}

function MembersStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div>
      <StepHead
        eyebrow="Step two"
        title="Bring in your members"
        sub="Import the club roster from a CSV. Shimo matches the columns and shows you what it found before anything is added."
      />
      <CsvImportCard />
      <StepFoot
        onBack={onBack}
        onNext={onNext}
        skip={{ label: "Add members later", onSkip: onNext }}
      />
    </div>
  );
}

function TournamentStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const club = clubById(CLUB_ID);
  const clubCourses = COURSES.filter((c) => c.clubId === CLUB_ID);
  const courses = clubCourses.length ? clubCourses : COURSES;

  const [name, setName] = useState("Captain's Prize");
  const [date, setDate] = useState("");
  const [format, setFormat] = useState<Format>("Stableford");
  const [courseId, setCourseId] = useState(courses[0].id);
  const [createdName, setCreatedName] = useState<string | null>(null);

  const create = () => {
    const course = courseById(courseId);
    const day = date || new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const t: Tournament = withRoundsSynced({
      id: `t-custom-${Date.now()}`,
      name: name.trim() || "Club tournament",
      clubId: club.id,
      courseId,
      date: day,
      format,
      entryFee: 0,
      status: "upcoming",
      membersOnly: true,
      membership: "members",
      divisions: [{ name: "Overall", range: [0, 28] }],
      description: `${format} at ${club.name}. Created from the Shimo tournament desk.`,
      prizes: [{ place: "Winner", prize: "Pro shop credit + club honours" }],
      maxPlayers: 120,
      regCloses: day,
      handicapAllowance: 95,
      firstTee: "07:30",
      teeInterval: 10,
      fieldSize: 0,
      rounds: [makeRound(1, { date: day, courseId, tees: course.tees })],
    });
    createTournament(t);
    setCreatedName(t.name);
  };

  return (
    <div>
      <StepHead
        eyebrow="Step three"
        title="Put a day on the calendar"
        sub="Create a real event now. You can set pairings and tee times later; this is enough to open entries."
      />

      {createdName ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="rounded-2xl bg-card p-6 shadow-card"
        >
          <span className="flex size-11 items-center justify-center rounded-2xl bg-clay text-cream">
            <Trophy className="size-5" />
          </span>
          <p className="mt-4 font-serif text-[22px] leading-tight text-foreground">
            {createdName} is on the calendar
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            It is upcoming and ready for entries. Find it under Tournaments to
            set pairings, tee times and prizes whenever you like.
          </p>
        </motion.div>
      ) : (
        <div className="grid gap-4 rounded-2xl bg-card p-6 shadow-card sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Format</Label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground"
            >
              {FORMATS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Course</Label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-background px-3 text-[14px] text-foreground"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Button variant="clay" onClick={create} disabled={!name.trim()}>
              <Trophy className="size-4" />
              Create this tournament
            </Button>
          </div>
        </div>
      )}

      <StepFoot
        onBack={onBack}
        onNext={onNext}
        skip={createdName ? undefined : { label: "Skip for now", onSkip: onNext }}
      />
    </div>
  );
}

const TOUR = [
  {
    icon: Trophy,
    label: "Create tournament",
    detail: "Events, pairings, tee times and the printable tee sheet.",
  },
  {
    icon: Users,
    label: "Import members",
    detail: "Your roster and invitations, all under Members.",
  },
  {
    icon: Radio,
    label: "Live Ops",
    detail: "Returned cards, discrepancies and disputes as the day runs.",
  },
];

function TourStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const still = useReducedMotion();
  return (
    <div>
      <StepHead
        eyebrow="Step four"
        title="Where the day lives"
        sub="Three places do the work. The rest of the desk is arranged around them."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        {TOUR.map((t, i) => {
          const Icon = t.icon;
          return (
            <motion.div
              key={t.label}
              initial={still ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: still ? 0 : 0.08 + i * 0.06 }}
              className="rounded-2xl bg-card p-5 shadow-card"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-ink-soft">
                <Icon className="size-4" />
              </span>
              <p className="mt-3 text-[15px] font-medium text-foreground">
                {t.label}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {t.detail}
              </p>
            </motion.div>
          );
        })}
      </div>
      <StepFoot onBack={onBack} onNext={onNext} />
    </div>
  );
}

function DoneStep({
  rosterCount,
  onFinish,
}: {
  rosterCount: number;
  onFinish: () => void;
}) {
  const [sent, setSent] = useState<number | null>(null);

  const invite = () => {
    const n = inviteAllMembers();
    setSent(n);
  };

  return (
    <div>
      <motion.div
        className="flex size-14 items-center justify-center rounded-2xl bg-clay text-cream"
        initial={{ scale: 0.7, rotate: -12 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 240, damping: 16 }}
      >
        <Check className="size-7" />
      </motion.div>
      <h2 className="mt-5 font-serif text-[30px] leading-tight text-foreground">
        Your desk is set
      </h2>

      {sent === null ? (
        <>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-soft">
            Send your members their invitations now, or do it later from
            Members. Nothing is sent until you choose to.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
            <Button variant="clay" size="lg" onClick={invite} disabled={rosterCount === 0}>
              <Mail className="size-4" />
              Send invitations now
            </Button>
            <Button variant="ghost" size="lg" className="text-muted-foreground" onClick={onFinish}>
              Do this later
            </Button>
          </div>
          {rosterCount === 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <ClipboardCheck className="size-3.5" />
              Import members first, then invitations become available here.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="mt-3 flex items-center gap-1.5 text-[15px] leading-relaxed text-foreground">
            <Check className="size-4 text-clay" />
            {sent} invitation{sent === 1 ? "" : "s"} queued. Members claim their
            place from the link.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-border/60 pt-5">
            <Button variant="clay" size="lg" onClick={onFinish}>
              Go to the desk
              <ArrowRight className="size-4" />
            </Button>
            <Button variant="ghost" size="lg" asChild onClick={onFinish}>
              <Link href="/admin/members">Review members</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
