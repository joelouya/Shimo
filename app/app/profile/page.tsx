"use client";

import { useState } from "react";
import { BookOpen, KeyRound, LogIn, TrendingDown } from "lucide-react";

import { SignIn } from "@/components/golfer/onboarding";
import { Walkthrough } from "@/components/golfer/walkthrough";
import { PinChange } from "@/components/signature";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEMO_USER_ID,
  USER_HISTORY,
  USER_HI_TREND,
  findClub,
  playerById,
} from "@/lib/data";
import { IS_PILOT } from "@/lib/mode";
import {
  meId,
  setAuth,
  setDeviceIdentity,
  setHideLeaderboard,
  setSignMethod,
  setTonePref,
  useSim,
  type SignMethod,
} from "@/lib/sim/store";
import { AUTH_AVAILABLE, signOut } from "@/lib/sync/auth";
import { formatDate, initials, ordinal } from "@/lib/utils";

/**
 * 12-month handicap index sparkline. Single series: no legend, endpoint
 * labeled, recessive baseline only. Demo only: a pilot member's index comes
 * from the club roster and has no history here yet.
 */
function HandicapSparkline() {
  const data = USER_HI_TREND;
  const w = 280;
  const h = 60;
  const pad = 6;
  const min = Math.min(...data.map((d) => d.hi));
  const max = Math.max(...data.map((d) => d.hi));
  const x = (i: number) => pad + (i * (w - pad * 2 - 30)) / (data.length - 1);
  const y = (v: number) => pad + ((max - v) * (h - pad * 2)) / (max - min || 1);
  const path = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.hi).toFixed(1)}`)
    .join(" ");
  const last = data[data.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Handicap index over the last 12 months, improving from 13.8 to 11.9">
      <line
        x1={pad}
        x2={w - pad - 30}
        y1={h - pad}
        y2={h - pad}
        stroke="var(--border)"
        strokeWidth="1"
      />
      <path d={path} fill="none" stroke="var(--clay)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(last.hi)} r="3.5" fill="var(--clay)" />
      <text
        x={x(data.length - 1) + 8}
        y={y(last.hi) + 4}
        fontSize="12"
        fontWeight="600"
        fill="var(--foreground)"
        className="tnum"
      >
        {last.hi.toFixed(1)}
      </text>
    </svg>
  );
}

/** One row of the settings ledger: a label, a line under it, and a control. */
function Row({
  label,
  hint,
  children,
  first,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-4 py-3.5 ${
        first ? "" : "border-t border-border/60"
      }`}
    >
      <div className="min-w-0">
        <Label className="text-foreground">{label}</Label>
        {hint && (
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default function ProfilePage() {
  const identity = useSim((s) => s.deviceIdentity);
  const authEmail = useSim((s) => s.authEmail);
  const myId = useSim(meId);
  const roster = useSim((s) => s.roster);
  const guests = useSim((s) => s.guests);
  const hidden = useSim((s) => s.hideLeaderboard);
  const signMethod = useSim((s) => s.signMethod);
  const userPin = useSim((s) => s.userPin);
  const tonePref = useSim((s) => s.tonePref);

  const [dialog, setDialog] = useState<null | "pin" | "signin" | "how">(null);
  const close = () => setDialog(null);

  // Pilot: the real player this device stands for, or nobody. Demo: Joel.
  const user = IS_PILOT
    ? myId
      ? (roster.find((p) => p.id === myId) ?? guests.find((p) => p.id === myId) ?? null)
      : null
    : playerById(DEMO_USER_ID);
  const clubName = findClub(user?.clubId)?.name ?? "Your club";
  const selfDeclared = Boolean(user?.guest?.selfDeclaredHandicap);

  const delta =
    USER_HI_TREND[USER_HI_TREND.length - 1].hi - USER_HI_TREND[0].hi;

  return (
    <div className="px-5 pt-5">
      <header className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-xl text-primary-foreground">
          {user ? initials(user.name) : "?"}
        </div>
        <div className="min-w-0">
          <h1 className="truncate font-serif text-[32px] font-medium leading-[1.04] tracking-[-0.012em] text-foreground">
            {user ? user.name : "Not signed in"}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {!IS_PILOT
              ? `${clubName} · Member since 2019`
              : user
                ? `${clubName} · ${user.guest ? "Guest" : "Member"}`
                : "Sign in, or open your tournament code, to score your own card"}
          </p>
        </div>
      </header>

      {/* handicap card */}
      <section className="mt-6 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <p className="smallcaps text-muted-foreground">
              {selfDeclared ? "Self-declared handicap" : "Handicap index"}
            </p>
            <p className="mt-1 font-serif text-[44px] leading-none text-foreground tnum">
              {!IS_PILOT
                ? USER_HI_TREND[USER_HI_TREND.length - 1].hi.toFixed(1)
                : user
                  ? user.handicap
                  : "–"}
            </p>
          </div>
          {!IS_PILOT && (
            <span className="flex items-center gap-1 rounded-full bg-clay-wash px-2.5 py-1 text-[11px] font-medium text-clay-deep tnum">
              <TrendingDown className="size-3" />
              {delta.toFixed(1)} this year
            </span>
          )}
        </div>
        {!IS_PILOT && (
          <div className="mt-4">
            <HandicapSparkline />
            <div className="mt-1 flex justify-between pr-9 text-[9px] text-muted-foreground">
              <span>{USER_HI_TREND[0].month} ’25</span>
              <span>{USER_HI_TREND[USER_HI_TREND.length - 1].month} ’26</span>
            </div>
          </div>
        )}
        {IS_PILOT && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            {selfDeclared
              ? "Declared at registration. It is labelled wherever it affects a result."
              : user
                ? "Your index comes from the club roster. The trend builds as attested rounds come in."
                : "Your index appears here once the club knows who you are."}
          </p>
        )}
      </section>

      {/* quick stats */}
      {!IS_PILOT && (
      <section className="mt-4 grid grid-cols-3 gap-2">
        {[
          { l: "Rounds ’26", v: "23" },
          { l: "Best finish", v: "3rd" },
          { l: "Avg points", v: "33.4" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl bg-card py-3.5 text-center shadow-card">
            <p className="font-serif text-xl text-foreground tnum">{s.v}</p>
            <p className="smallcaps mt-0.5 text-[9px] text-muted-foreground">{s.l}</p>
          </div>
        ))}
      </section>
      )}

      {/* history */}
      <section className="mt-7">
        <p className="smallcaps mb-3 text-muted-foreground">Tournament history</p>
        {IS_PILOT ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-7 text-center">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Your history builds here as you play Shimo events at the club.
            </p>
          </div>
        ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          {USER_HISTORY.map((e, i) => (
            <div
              key={e.tournament + e.date}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-border/60" : ""
              }`}
            >
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-medium text-foreground">
                  {e.tournament}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {e.club} · {formatDate(e.date)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-serif text-[16px] tnum ${
                    e.position <= 3 ? "text-clay-deep" : "text-foreground"
                  }`}
                >
                  {ordinal(e.position)}
                  <span className="text-[10px] text-muted-foreground">
                    /{e.fieldSize}
                  </span>
                </p>
                <p className="text-[10.5px] text-muted-foreground tnum">{e.score}</p>
              </div>
            </div>
          ))}
        </div>
        )}
      </section>

      {/* account */}
      {IS_PILOT && (
        <section className="mt-7">
          <p className="smallcaps mb-3 text-muted-foreground">Account</p>
          <div className="overflow-hidden rounded-2xl bg-card shadow-card">
            {authEmail ? (
              <Row first label="Signed in" hint={`${authEmail}${user ? ` · ${user.name}` : ""}`}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await signOut();
                    setAuth(null, null);
                    // the phone stops acting as this player too
                    setDeviceIdentity(null);
                  }}
                >
                  Sign out
                </Button>
              </Row>
            ) : (
              <Row
                first
                label={identity && user ? "This device is you" : "Sign in"}
                hint={
                  identity && user
                    ? `${user.name} · ${user.guest ? "by your tournament code" : "picked off the tee sheet"}`
                    : AUTH_AVAILABLE
                      ? "Members sign in with the email the club has on file"
                      : "Ask the desk for your tournament code"
                }
              >
                <div className="flex gap-2">
                  {identity && (
                    <Button variant="outline" size="sm" onClick={() => setDeviceIdentity(null)}>
                      Change
                    </Button>
                  )}
                  {AUTH_AVAILABLE && (
                    <Button variant="clay" size="sm" onClick={() => setDialog("signin")}>
                      <LogIn className="size-3.5" />
                      Sign in
                    </Button>
                  )}
                </div>
              </Row>
            )}
          </div>
        </section>
      )}

      {/* signing */}
      <section className="mt-7">
        <p className="smallcaps mb-3 text-muted-foreground">Signing cards</p>
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <Row first label="Signature method" hint="How you certify. All three are legally valid.">
            <Select
              value={signMethod === "committee" ? "pin" : signMethod}
              onValueChange={(v) => setSignMethod(v as SignMethod)}
            >
              <SelectTrigger className="h-11 w-[170px] text-[14px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pin">PIN</SelectItem>
                <SelectItem value="signature">Finger signature</SelectItem>
                <SelectItem value="biometric">Biometric</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row
            label="Signing PIN"
            hint={userPin ? "Set · four digits" : "Not set yet. You'll be asked before you can certify."}
          >
            <Button
              variant={userPin ? "outline" : "clay"}
              size="sm"
              onClick={() => setDialog("pin")}
            >
              <KeyRound className="size-3.5" />
              {userPin ? "Change PIN" : "Set PIN"}
            </Button>
          </Row>
          <Row label="How Shimo works" hint="The two cards, the board, signing off, playing offline">
            <Button variant="outline" size="sm" onClick={() => setDialog("how")}>
              <BookOpen className="size-3.5" />
              Show me
            </Button>
          </Row>
        </div>
      </section>

      {/* preferences */}
      <section className="mt-7 pb-4">
        <p className="smallcaps mb-3 text-muted-foreground">Preferences</p>
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          <Row first label="Scoreboard blindness" hint="Hide the leaderboard while you play">
            <Switch checked={hidden} onCheckedChange={setHideLeaderboard} />
          </Row>
          <Row label="Greeting tone" hint="How the home screen speaks to you">
            <Select
              value={tonePref}
              onValueChange={(v) => setTonePref(v as "editorial" | "classic")}
            >
              <SelectTrigger className="h-11 w-[170px] text-[14px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editorial">Editorial</SelectItem>
                <SelectItem value="classic">Classic</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </div>
        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          Shimo · {IS_PILOT ? "pilot build" : "demo build"}
        </p>
      </section>

      {/* dialogs */}
      <Dialog open={dialog === "pin"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{userPin ? "Change your PIN" : "Set your PIN"}</DialogTitle>
            <DialogDescription>
              Four digits. You sign every card with it, so pick one you will remember.
            </DialogDescription>
          </DialogHeader>
          <PinChange onDone={close} onCancel={close} />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "signin"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="sr-only">Sign in</DialogTitle>
            <DialogDescription className="sr-only">
              Sign in with the email your club has on file.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-[420px] flex-col">
            <SignIn onMatched={close} onSkip={close} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "how"} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[88dvh] max-w-sm overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="sr-only">How Shimo works</DialogTitle>
            <DialogDescription className="sr-only">
              A short tour of the app on tournament day.
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-[560px] flex-col">
            <Walkthrough onDone={close} doneLabel="Done" />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
