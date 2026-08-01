"use client";

/**
 * Public registration for a guest.
 *
 * The one Shimo surface with no account behind it. Someone reaches this from a
 * WhatsApp forward, on a phone, and has never heard of Shimo. Every field
 * beyond a name is optional, because on a public form each required field is a
 * person who gives up and emails the organiser instead, which is precisely the
 * manual work this exists to remove.
 *
 * The consent question is the part to be careful with. Kenya's Data Protection
 * Act 2019 applies to everything captured here, so appearing in a sponsor's
 * participant list is asked separately, in plain words, and is off unless the
 * person turns it on. Dietary and accessibility notes are never shared with a
 * sponsor under any setting: they are operational data for the club and some
 * of them are health data.
 */

import { use, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, Copy } from "lucide-react";

import { Logo } from "@/components/logo";
import { SimGate } from "@/components/sim-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { clubById } from "@/lib/data";
import { validateRegistration, type GuestRegistration } from "@/lib/guests";
import { allTournaments, registerGuest, useSim } from "@/lib/sim/store";
import { formatDate } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;

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

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function Done({ code, name }: { code: string; name: string }) {
  const still = useReducedMotion();
  const [copied, setCopied] = useState(false);
  return (
    <Frame>
      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <div className="flex size-12 items-center justify-center rounded-2xl bg-clay-wash text-clay-deep">
            <Check className="size-6" />
          </div>
          <h1 className="mt-5 font-serif text-[30px] leading-tight text-foreground">
            You&apos;re on the sheet, {name.split(" ")[0]}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Keep this code. It is how you open your own scorecard on the day,
            and it works on any phone without signing in to anything.
          </p>
        </motion.div>

        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
          className="mt-7 rounded-2xl bg-card p-6 text-center shadow-card"
        >
          <p className="smallcaps text-muted-foreground">Your code</p>
          <p className="mt-2 font-serif text-[34px] leading-none tracking-[0.14em] text-foreground tnum">
            {code}
          </p>
          <Button
            variant="outline"
            className="mt-5"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
            }}
          >
            <Copy className="size-4" />
            {copied ? "Copied" : "Copy the code"}
          </Button>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-6 text-[13px] leading-relaxed text-muted-foreground"
        >
          The organiser has your details. If anything changes, tell them rather
          than registering again.
        </motion.p>
      </div>
    </Frame>
  );
}

function Register({ id }: { id: string }) {
  const still = useReducedMotion();
  const created = useSim((s) => s.created);
  const dismissed = useSim((s) => s.dismissed);
  const t = useMemo(
    () => allTournaments(created, dismissed).find((x) => x.id === id),
    [created, dismissed, id],
  );

  const [form, setForm] = useState<GuestRegistration>({
    name: "",
    email: "",
    phone: "",
    company: "",
    notes: "",
    sponsorListConsent: false,
  });
  const [handicap, setHandicap] = useState("");
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{ code: string; name: string } | null>(null);

  const parsedHandicap =
    handicap.trim() === "" ? undefined : Number(handicap.trim());
  const problems = validateRegistration({ ...form, handicap: parsedHandicap });
  const problemFor = (f: keyof GuestRegistration) =>
    touched ? problems.find((p) => p.field === f)?.message : undefined;

  if (done) return <Done code={done.code} name={done.name} />;

  if (!t) {
    return (
      <Frame>
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="font-serif text-[30px] leading-tight text-foreground">
            This event is not open
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            The link may be out of date. Ask the organiser for a current one.
          </p>
        </div>
      </Frame>
    );
  }

  const club = clubById(t.clubId);

  return (
    <Frame>
      <motion.div
        initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mt-2"
      >
        <p className="smallcaps text-muted-foreground">Registration</p>
        <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
          {t.name}
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          {formatDate(t.date)} · {club.name}
        </p>
      </motion.div>

      <motion.form
        initial={still ? { opacity: 0 } : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setTouched(true);
          if (problems.length) return;
          const entry = registerGuest(
            t.id,
            { ...form, handicap: parsedHandicap },
            t.clubId,
          );
          setDone({ code: entry.code, name: form.name });
        }}
      >
        <Field label="Your name">
          <Input
            value={form.name}
            placeholder="As it should appear on the scorecard"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            aria-invalid={Boolean(problemFor("name"))}
          />
          {problemFor("name") && (
            <p className="text-[13px] text-red-flag">{problemFor("name")}</p>
          )}
        </Field>

        <Field label="Company or organisation">
          <Input
            value={form.company}
            placeholder="Optional"
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Email">
            <Input
              type="email"
              value={form.email}
              placeholder="Optional"
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              aria-invalid={Boolean(problemFor("email"))}
            />
          </Field>
          <Field label="Phone">
            <Input
              type="tel"
              value={form.phone}
              placeholder="Optional"
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
        </div>
        {problemFor("email") && (
          <p className="-mt-2 text-[13px] text-red-flag">{problemFor("email")}</p>
        )}

        <Field
          label="Your handicap"
          hint="Leave it blank if you do not have one. Whatever you put here is recorded as your own figure, not a WHS index."
        >
          <Input
            inputMode="decimal"
            value={handicap}
            placeholder="Optional"
            onChange={(e) => setHandicap(e.target.value)}
            aria-invalid={Boolean(problemFor("handicap"))}
          />
          {problemFor("handicap") && (
            <p className="text-[13px] text-red-flag">{problemFor("handicap")}</p>
          )}
        </Field>

        <Field
          label="Anything the organiser should know"
          hint="Dietary requirements, access needs, anything else. This goes to the club only and is never shared with a sponsor."
        >
          <Input
            value={form.notes}
            placeholder="Optional"
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        {/*
          Asked separately and in plain words, because bundling this into a
          general "I agree" is exactly what the Data Protection Act exists to
          prevent. Off unless they turn it on.
        */}
        <div className="flex items-start gap-3 rounded-2xl bg-card p-4 shadow-card">
          <Switch
            id="sponsor-consent"
            checked={form.sponsorListConsent}
            onCheckedChange={(v) =>
              setForm({ ...form, sponsorListConsent: v })
            }
          />
          <Label
            htmlFor="sponsor-consent"
            className="cursor-pointer text-[13px] leading-relaxed font-normal text-ink-soft"
          >
            The sponsors may see my name and organisation in their list of who
            played. Your phone, email and any notes above are never included.
          </Label>
        </div>

        <Button type="submit" variant="clay" size="lg" className="w-full">
          Register
          <ArrowRight className="size-4" />
        </Button>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Registering does not create an account. You get a code that opens your
          scorecard on the day, and nothing else.
        </p>
      </motion.form>
    </Frame>
  );
}

export default function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <SimGate
      fallback={
        <Frame>
          <Logo className="text-3xl opacity-40" />
        </Frame>
      }
    >
      <Register id={id} />
    </SimGate>
  );
}
