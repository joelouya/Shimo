"use client";

import { useEffect, useState } from "react";
import { Flag, RotateCcw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClubIdentityCard } from "@/components/admin/club-identity";
import { CsvImportCard } from "@/components/admin/csv-import";
import { DeskCard } from "@/components/admin/desk-card";
import { TvSettingsCard } from "@/components/admin/tv-settings";
import { guestResolveAbuseSummary } from "@/lib/guests-remote";
import { FEATURES } from "@/lib/flags";
import { IS_PILOT } from "@/lib/mode";
import { resetDemo, reviewIntegrityEntry, useSim } from "@/lib/sim/store";

function Card({
  title,
  children,
  sub,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <p className="font-serif text-lg text-foreground">{title}</p>
      {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  hint,
  children,
  first,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 py-3.5 ${
        first ? "" : "border-t border-border/60"
      }`}
    >
      <div>
        <Label className="text-foreground">{label}</Label>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function IntegrityCard() {
  const log = useSim((s) => s.integrityLog);
  return (
    <Card
      title="Integrity"
      sub="Pace flags are logged here quietly, never surfaced during play"
    >
      {log.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <Flag className="mx-auto size-4 text-muted-foreground" />
          <p className="mt-2 text-[13px] text-muted-foreground">
            Nothing flagged. Cards are scoring within expectation.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {log.map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-3 rounded-xl bg-secondary/50 px-4 py-3"
            >
              <Flag className="mt-0.5 size-3.5 shrink-0 text-stone" />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">
                  {f.message}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {f.detail}
                </p>
              </div>
              {f.status === "open" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reviewIntegrityEntry(f.id)}
                >
                  Mark reviewed
                </Button>
              ) : (
                <Badge variant="outline">Reviewed</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GuestAccessCard() {
  const [summary, setSummary] = useState<
    Awaited<ReturnType<typeof guestResolveAbuseSummary>> | "loading"
  >("loading");

  useEffect(() => {
    let live = true;
    guestResolveAbuseSummary().then((s) => {
      if (live) setSummary(s);
    });
    return () => {
      live = false;
    };
  }, []);

  // no remote configured, or the call failed: say nothing rather than imply
  // a signal we cannot actually read
  if (summary === "loading" || summary === null) return null;

  const quiet = summary.bursts === 0;
  return (
    <Card
      title="Guest access"
      sub="How often someone has been turned away for guessing at codes"
    >
      <div
        className={`flex items-start gap-3 rounded-xl px-4 py-3.5 ${
          quiet ? "bg-secondary/50" : "bg-clay-wash"
        }`}
      >
        <ShieldAlert
          className={`mt-0.5 size-4 shrink-0 ${
            quiet ? "text-muted-foreground" : "text-clay-deep"
          }`}
        />
        <div className="min-w-0">
          <p className="text-[13.5px] font-medium text-foreground">
            {quiet
              ? "Nothing unusual in the last day"
              : `${summary.bursts} ${
                  summary.bursts === 1 ? "burst" : "bursts"
                } of failed attempts in the last day`}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
            {quiet
              ? "A burst is a single connection locked out for repeatedly trying codes that do not exist. None so far."
              : "Each is a connection locked out after too many wrong codes. Codes still work for the guests who hold them; this is only a heads-up that someone was probing."}
            {!quiet && summary.lastAt
              ? ` Most recent ${summary.lastAt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}.`
              : ""}
          </p>
        </div>
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [autoFlag, setAutoFlag] = useState(true);
  const [publicBoards, setPublicBoards] = useState(true);
  const [attestReminders, setAttestReminders] = useState(true);
  // Settings are grouped into jobs rather than stacked in one long column, so
  // the page stops reading as a dump and starts reading as a console.
  const [tab, setTab] = useState("club");

  return (
    <div>
      <header>
        <p className="smallcaps text-muted-foreground">Settings</p>
        <h1 className="mt-2 font-serif text-[clamp(34px,4.4vw,46px)] font-medium leading-[1.02] tracking-[-0.016em] text-foreground">
          Club settings
        </h1>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="mt-8 max-w-4xl">
        <TabsList className="h-10">
          <TabsTrigger value="club" className="px-4 text-[13px]">Club</TabsTrigger>
          <TabsTrigger value="competition" className="px-4 text-[13px]">Competition</TabsTrigger>
          <TabsTrigger value="experience" className="px-4 text-[13px]">Experience</TabsTrigger>
          <TabsTrigger value="operations" className="px-4 text-[13px]">Operations</TabsTrigger>
        </TabsList>

        {/*
          forceMount keeps every tab in the tree so an in-progress edit, a
          parsed CSV preview or an unsaved accent survives a glance at another
          tab. Radix hides the inactive ones; only their state persists.
        */}
        <TabsContent value="club" forceMount className="mt-6 grid items-start gap-6 data-[state=inactive]:hidden md:grid-cols-2">
          <Card title="Club profile" sub="What golfers see across Shimo">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Club name</Label>
                <Input defaultValue="Muthaiga Golf Club" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Default tees</Label>
                  <Select defaultValue="Yellow">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Yellow", "White", "Blue", "Red"].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Tee interval</Label>
                  <Select defaultValue="10">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["8", "10", "12"].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t} minutes
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Card>
          <ClubIdentityCard />
        </TabsContent>

        <TabsContent value="competition" forceMount className="mt-6 grid items-start gap-6 data-[state=inactive]:hidden md:grid-cols-2">
          <Card
            title="Competition defaults"
            sub="Applied to every new tournament, editable per event"
          >
            <SettingRow
              first
              label="Handicap allowance"
              hint="WHS recommendation for singles"
            >
              <Select defaultValue="95">
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["100", "95", "90", "85"].map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow
              label="Anomaly flags in Live Ops"
              hint="Watch cards against expected scoring"
            >
              <Switch checked={autoFlag} onCheckedChange={setAutoFlag} />
            </SettingRow>
            <SettingRow
              label="Public leaderboards"
              hint="Anyone with the link can follow live"
            >
              <Switch checked={publicBoards} onCheckedChange={setPublicBoards} />
            </SettingRow>
            <SettingRow
              label="Certification reminders"
              hint="Nudge players who haven’t certified within 20 minutes"
            >
              <Switch checked={attestReminders} onCheckedChange={setAttestReminders} />
            </SettingRow>
          </Card>
          {/*
            Handicapping is the one place the product must be scrupulous about
            what it is. Kenya's national WHS engine is run by Club Systems
            under an R&A federation initiative; Shimo runs the tournament day
            and produces a sealed, submission-ready result that feeds it.
            Approved submission is being pursued and is not yet secured, so
            this card says what is true today and nothing more. See
            docs/COMMITMENTS.md.
          */}
          <Card
            title="Handicapping"
            sub="Works with the handicap system your club already uses"
          >
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3.5">
              <div>
                <p className="text-[13.5px] font-medium text-foreground">
                  Submission-ready results
                </p>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Every certified card is sealed and exportable for the club&apos;s
                  handicap returns. Direct submission to the national system is
                  being arranged and is not live yet.
                </p>
              </div>
              <Badge variant="secondary">Export</Badge>
            </div>
          </Card>
          {IS_PILOT && <IntegrityCard />}
        </TabsContent>

        <TabsContent value="experience" forceMount className="mt-6 grid items-start gap-6 data-[state=inactive]:hidden md:grid-cols-2">
          <TvSettingsCard />
        </TabsContent>

        <TabsContent value="operations" forceMount className="mt-6 grid items-start gap-6 data-[state=inactive]:hidden md:grid-cols-2">
          <DeskCard />
          {IS_PILOT && <GuestAccessCard />}
          <CsvImportCard />
          {FEATURES.payments && (
          <Card
            title="Payments"
            sub="Illustrative only. Shimo does not settle money today"
          >
            {/*
              Demo-only, and labelled. Whether M-PESA settlement ships at all
              is an open commercial decision, and the entity/Daraja path is an
              unresolved legal question. A screen shown to prospective clubs
              and to the KGU must not imply a working integration exists.
              See docs/COMMITMENTS.md.
            */}
            <div className="mb-3 rounded-xl border border-amber-flag/25 bg-amber-wash/50 px-4 py-3">
              <p className="text-[12.5px] leading-relaxed text-ink-soft">
                A worked example of how settlement would look. Nothing here is
                connected to Safaricom or to a bank, and no money moves.
              </p>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3.5">
              <div>
                <p className="text-[13.5px] font-medium text-foreground">
                  M-PESA Paybill 522 533
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Muthaiga Golf Club · KES settlement
                </p>
              </div>
              <Badge variant="secondary">Example</Badge>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3.5">
              <div>
                <p className="text-[13.5px] font-medium text-foreground">
                  Card payments · Visa / Mastercard
                </p>
                <p className="text-[11px] text-muted-foreground">
                  For visitors and diaspora members
                </p>
              </div>
              <Badge variant="secondary">Example</Badge>
            </div>
          </Card>
          )}
          {!IS_PILOT ? (
            <Card title="Demo" sub="This is a prototype. Data is simulated">
              <Button variant="outline" onClick={() => resetDemo()}>
                <RotateCcw className="size-4" />
                Reset demo data
              </Button>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Restores the Captain’s Prize to mid-round, clears created
                tournaments and registrations, and re-arms the discrepancy and
                anomaly storylines.
              </p>
            </Card>
          ) : (
            <Card title="Pilot data" sub="Local data on this device">
              <Button variant="outline" onClick={() => resetDemo()}>
                <RotateCcw className="size-4" />
                Reset pilot data
              </Button>
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Clears tournaments, pairings, and entered scores on this
                device and restores the club roster. Use with care on
                tournament day.
              </p>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
