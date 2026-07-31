"use client";

import { useState } from "react";
import { TrendingDown } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  CLUBS,
  DEMO_USER_ID,
  USER_HISTORY,
  USER_HI_TREND,
  clubById,
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
import { signOut } from "@/lib/sync/auth";
import { formatDate, initials, ordinal } from "@/lib/utils";

/**
 * 12-month handicap index sparkline. Single series: no legend, endpoint
 * labeled, recessive baseline only.
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

export default function ProfilePage() {
  const identity = useSim((s) => s.deviceIdentity);
  const authEmail = useSim((s) => s.authEmail);
  const myId = useSim(meId);
  const roster = useSim((s) => s.roster);
  const user =
    IS_PILOT && myId
      ? (roster.find((p) => p.id === myId) ?? playerById(DEMO_USER_ID))
      : playerById(DEMO_USER_ID);
  const club = clubById(user.clubId);
  const hidden = useSim((s) => s.hideLeaderboard);
  const signMethod = useSim((s) => s.signMethod);
  const tonePref = useSim((s) => s.tonePref);
  const [scoreNotifs, setScoreNotifs] = useState(true);
  const [teeReminders, setTeeReminders] = useState(true);
  const [homeClub, setHomeClub] = useState(user.clubId);

  const delta =
    USER_HI_TREND[USER_HI_TREND.length - 1].hi - USER_HI_TREND[0].hi;

  return (
    <div className="px-5 pt-5">
      <header className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-xl text-primary-foreground">
          {initials(user.name)}
        </div>
        <div>
          <h1 className="font-serif text-[28px] leading-tight text-foreground">
            {user.name}
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {club.name} · Member since 2019
          </p>
        </div>
      </header>

      {/* handicap card */}
      <section className="mt-6 rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-start justify-between">
          <div>
            <p className="smallcaps text-muted-foreground">Handicap index</p>
            <p className="mt-1 font-serif text-[44px] leading-none text-foreground tnum">
              {USER_HI_TREND[USER_HI_TREND.length - 1].hi.toFixed(1)}
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-clay-wash px-2.5 py-1 text-[11px] font-medium text-clay-deep tnum">
            <TrendingDown className="size-3" />
            {delta.toFixed(1)} this year
          </span>
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
            Your index syncs from the KGU. The trend builds as attested rounds
            come in.
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

      {/* settings */}
      <section className="mt-7 pb-4">
        <p className="smallcaps mb-3 text-muted-foreground">Settings</p>
        <div className="overflow-hidden rounded-2xl bg-card shadow-card">
          {IS_PILOT && authEmail && (
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5">
              <div className="min-w-0">
                <Label className="text-foreground">Signed in</Label>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {authEmail} · {user.name}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  setAuth(null, null);
                }}
              >
                Sign out
              </Button>
            </div>
          )}
          {IS_PILOT && !authEmail && identity && (
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3.5">
              <div>
                <Label className="text-foreground">This device is you</Label>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {user.name} · following as a guest
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeviceIdentity(null)}
              >
                Change
              </Button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div>
              <Label className="text-foreground">Scoreboard blindness</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Hide the leaderboard while you play
              </p>
            </div>
            <Switch checked={hidden} onCheckedChange={setHideLeaderboard} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5">
            <div>
              <Label className="text-foreground">Score notifications</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Position changes and milestones
              </p>
            </div>
            <Switch checked={scoreNotifs} onCheckedChange={setScoreNotifs} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5">
            <div>
              <Label className="text-foreground">Tee time reminders</Label>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                The evening before, and 90 minutes out
              </p>
            </div>
            <Switch checked={teeReminders} onCheckedChange={setTeeReminders} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5">
            <div>
              <Label className="text-foreground">Signature method</Label>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                How you certify cards. All three are legally valid.
              </p>
            </div>
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
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5">
            <div>
              <Label className="text-foreground">Greeting tone</Label>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                How the home screen speaks to you
              </p>
            </div>
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
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-3.5">
            <div className="shrink-0">
              <Label className="text-foreground">Home club</Label>
            </div>
            <Select value={homeClub} onValueChange={setHomeClub}>
              <SelectTrigger className="h-9 w-[190px] text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLUBS.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          Shimo · prototype build for the Kenya Golf Union
        </p>
      </section>
    </div>
  );
}
