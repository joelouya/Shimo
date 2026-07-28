"use client";

import { useState } from "react";
import { Check, Flag, RotateCcw } from "lucide-react";

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
import { ClubIdentityCard } from "@/components/admin/club-identity";
import { CsvImportCard } from "@/components/admin/csv-import";
import { DeskCard } from "@/components/admin/desk-card";
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
          <Flag className="mx-auto size-4 text-muted-foreground/50" />
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

export default function SettingsPage() {
  const [autoFlag, setAutoFlag] = useState(true);
  const [publicBoards, setPublicBoards] = useState(true);
  const [attestReminders, setAttestReminders] = useState(true);

  return (
    <div>
      <header>
        <p className="smallcaps text-clay">Settings</p>
        <h1 className="mt-2 font-serif text-[34px] leading-tight text-foreground">
          Club settings
        </h1>
      </header>

      <div className="mt-8 grid max-w-4xl grid-cols-2 items-start gap-6">
        <div className="flex flex-col gap-6">
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
        </div>

        <div className="flex flex-col gap-6">
          <ClubIdentityCard />
          <DeskCard />
          {IS_PILOT && <IntegrityCard />}
          <CsvImportCard />
          {!IS_PILOT && (
          <Card title="Payments" sub="Entry fees, settled to the club weekly">
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3.5">
              <div>
                <p className="text-[13.5px] font-medium text-foreground">
                  M-PESA Paybill 522 533
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Muthaiga Golf Club · KES settlement
                </p>
              </div>
              <Badge variant="claySoft">
                <Check className="size-3" />
                Connected
              </Badge>
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
              <Badge variant="claySoft">
                <Check className="size-3" />
                Connected
              </Badge>
            </div>
          </Card>
          )}

          <Card
            title="Handicapping"
            sub="Kenya Golf Union · World Handicap System"
          >
            <div className="flex items-center justify-between rounded-xl bg-secondary/50 px-4 py-3.5">
              <div>
                <p className="text-[13.5px] font-medium text-foreground">
                  KGU handicap sync
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Attested cards post automatically · indexes pull nightly
                </p>
              </div>
              <Badge variant="claySoft">
                <Check className="size-3" />
                Active
              </Badge>
            </div>
          </Card>

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
        </div>
      </div>
    </div>
  );
}
