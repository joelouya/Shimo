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
import { QrCode } from "@/components/qr";
import { SimGate } from "@/components/sim-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { clubById } from "@/lib/data";
import { validateRegistration, type GuestRegistration } from "@/lib/guests";
import {
  allTournaments,
  registerGuest,
  registrationCapacity,
  simStore,
  useSim,
} from "@/lib/sim/store";
import type { RegistrationQuestion } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

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

/** One of the club's custom questions: a text field, or a row of choice pills. */
function QuestionField({
  q,
  value,
  onChange,
  invalid,
}: {
  q: RegistrationQuestion;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <Field label={`${q.label}${q.required ? "" : " (optional)"}`}>
      {q.kind === "choice" && q.options?.length ? (
        <div className="flex flex-wrap gap-2">
          {q.options.map((opt) => {
            const active = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(active ? "" : opt)}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
                  active
                    ? "border-clay bg-clay text-cream"
                    : "border-border bg-card text-ink-soft hover:border-clay/50",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      ) : (
        <Input
          value={value}
          placeholder={q.required ? "" : "Optional"}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid}
        />
      )}
      {invalid && (
        <p className="text-[13px] text-red-flag">Please answer this.</p>
      )}
    </Field>
  );
}

function Done({
  code,
  name,
  waitlisted,
}: {
  code: string;
  name: string;
  waitlisted?: boolean;
}) {
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
            {waitlisted
              ? `You're on the waitlist, ${name.split(" ")[0]}`
              : `You're on the sheet, ${name.split(" ")[0]}`}
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            {waitlisted
              ? "The field is full for now. Keep this code — the moment a place opens the desk can wave you straight in with it, no re-registering."
              : "Scan this on the day and your scorecard opens. No account, no password, and it works on any phone."}
          </p>
        </motion.div>

        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
          className="mt-7 rounded-2xl bg-card p-6 text-center shadow-card"
        >
          {/*
            The QR is the primary way in and the code is the fallback, not the
            other way round. On the day this is scanned off a phone screen by
            somebody holding a driver; the six characters exist for when the
            camera will not focus or the screen has died.
          */}
          <div className="flex justify-center">
            <QrCode
              value={`/enter?code=${encodeURIComponent(code)}`}
              size={190}
              label={`Scan to open the scorecard for code ${code}`}
            />
          </div>
          <p className="smallcaps mt-5 text-muted-foreground">
            Or type this code
          </p>
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
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<{
    code: string;
    name: string;
    waitlisted?: boolean;
  } | null>(null);

  const questions = t?.registrationQuestions ?? [];
  // recompute capacity as entries land so a field that fills mid-session closes
  const confirmedCount = useSim((s) =>
    t ? s.guestEntries.filter((e) => e.tournamentId === t.id && !e.waitlisted).length : 0,
  );
  const capacity = useMemo(
    () => (t ? registrationCapacity(simStore.getState(), t) : null),
    // confirmedCount is the reactive input; simStore read stays fresh with it
    [t, confirmedCount],
  );

  const parsedHandicap =
    handicap.trim() === "" ? undefined : Number(handicap.trim());
  const problems = validateRegistration({ ...form, handicap: parsedHandicap });
  const missingAnswer = (q: RegistrationQuestion) =>
    q.required && !(answers[q.id] ?? "").trim();
  const answerProblems = questions.filter(missingAnswer);
  const problemFor = (f: keyof GuestRegistration) =>
    touched ? problems.find((p) => p.field === f)?.message : undefined;

  if (done)
    return <Done code={done.code} name={done.name} waitlisted={done.waitlisted} />;

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

  // a full field with no waitlist is closed: say so plainly rather than taking
  // a registration the club has no place for
  if (capacity?.full && !t.waitlist) {
    return (
      <Frame>
        <div className="flex flex-1 flex-col justify-center">
          <p className="smallcaps text-muted-foreground">{t.name}</p>
          <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
            The field is full
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Every place for {formatDate(t.date)} at {club.name} has been taken.
            Ask the organiser whether a place might open, and they can add you
            directly.
          </p>
        </div>
      </Frame>
    );
  }

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
          if (problems.length || answerProblems.length) return;
          const entry = registerGuest(
            t.id,
            { ...form, handicap: parsedHandicap, answers },
            t.clubId,
          );
          setDone({
            code: entry.code,
            name: form.name,
            waitlisted: entry.waitlisted,
          });
        }}
      >
        {capacity?.waitlistOpen && (
          <div className="rounded-2xl border border-clay/30 bg-clay-wash/60 p-4">
            <p className="text-[13px] leading-relaxed text-clay-deep">
              The field is full, so this registration joins the{" "}
              <span className="font-medium">waitlist</span>. You still get a code,
              and the desk can wave you in the moment a place opens.
            </p>
          </div>
        )}

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

        {/* the club's own questions, if it set any */}
        {questions.map((q) => (
          <QuestionField
            key={q.id}
            q={q}
            value={answers[q.id] ?? ""}
            onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
            invalid={touched && missingAnswer(q)}
          />
        ))}

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
