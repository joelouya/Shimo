"use client";

/**
 * What a club makes its own about the television.
 *
 * Three things, in the order they matter. The background image is the biggest
 * lever by a distance: it is the difference between a screen that shows this
 * club's tournament and a screen that shows a tournament. The messages are the
 * cheapest way for a club to talk to a room it already has the attention of.
 * The course records are the one piece of club history the screen can honour,
 * and the one thing it must never get wrong.
 */

import { useRef, useState } from "react";
import { Check, ImagePlus, Loader2, Plus, Trash2, Trophy } from "lucide-react";

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
import { COURSES, CLUBS } from "@/lib/data";
import { clubIdentityOf, setClubIdentity, useSim } from "@/lib/sim/store";
import { uploadTvBackground, validateLogo } from "@/lib/sync/storage";
import type { ClubIdentity } from "@/lib/types";

const CLUB_ID = CLUBS[0].id;

export function TvSettingsCard() {
  const identity = useSim((s) => clubIdentityOf(s, CLUB_ID));
  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <p className="font-serif text-lg text-foreground">The clubhouse screen</p>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        How TV mode looks and what it says between moments
      </p>
      <div className="mt-5 flex flex-col gap-7">
        <Background identity={identity} />
        <Messages identity={identity} />
        <Records identity={identity} />
      </div>
    </section>
  );
}

function Background({ identity }: { identity: ClubIdentity }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  const pick = async (file: File) => {
    // a hero image is allowed to be big, but it still has to be an image
    const bad = await validateLogo(file, { minPx: 1200 });
    if (bad) {
      setError(bad);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { url } = await uploadTvBackground(CLUB_ID, file);
      setClubIdentity(CLUB_ID, { tvBackgroundUrl: url });
    } catch {
      setError("The upload did not complete. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Label>Background image</Label>
      <p className="mt-1 text-[12px] text-muted-foreground">
        A hero shot of the course or the clubhouse. Shimo darkens it so the
        scores stay readable, and keeps your colours over the top. This is the
        single biggest thing that makes the screen feel like yours.
      </p>

      {identity.tvBackgroundUrl ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-border">
          <div className="relative aspect-[16/9]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={identity.tvBackgroundUrl}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            {/* the same two layers the television uses, so what is previewed
                here is what a room will actually see */}
            <div className="absolute inset-0 bg-[#101722]/82" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(16,23,34,0.55), rgba(16,23,34,0.9) 55%, rgba(16,23,34,0.97))",
              }}
            />
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-serif text-2xl text-[#f7f3ec]">
              Your tournament, here
            </p>
          </div>
        </div>
      ) : null}

      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
        }}
      />
      <div className="mt-3 flex items-center gap-2">
        <Button variant="outline" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {identity.tvBackgroundUrl ? "Replace" : "Upload an image"}
        </Button>
        {identity.tvBackgroundUrl && (
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setClubIdentity(CLUB_ID, { tvBackgroundUrl: undefined })}
          >
            Remove
          </Button>
        )}
      </div>
      {error && <p className="mt-2 text-[13px] text-red-flag">{error}</p>}
    </div>
  );
}

function Messages({ identity }: { identity: ClubIdentity }) {
  const list = identity.tvMessages ?? [];
  const [draft, setDraft] = useState("");

  const save = (next: string[]) =>
    setClubIdentity(CLUB_ID, { tvMessages: next.length ? next : undefined });

  return (
    <div>
      <Label>Messages for the room</Label>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Short lines the screen shows between moments. One sentence each, and
        keep them true all afternoon: they appear in rotation, not at a set time.
      </p>

      {list.length > 0 && (
        <div className="mt-3 space-y-2">
          {list.map((m, i) => (
            <div
              key={`${m}-${i}`}
              className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"
            >
              <span className="text-[13px] text-ink-soft">{m}</span>
              <button
                type="button"
                aria-label={`Remove "${m}"`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => save(list.filter((_, j) => j !== i))}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Prizegiving at 6pm in the main bar"
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              save([...list, draft.trim()]);
              setDraft("");
            }
          }}
        />
        <Button
          variant="outline"
          disabled={draft.trim().length < 4}
          onClick={() => {
            save([...list, draft.trim()]);
            setDraft("");
          }}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

/**
 * Course records, per course and per tee set.
 *
 * Per tee set because a record off the white tees is not a record off the red,
 * and a club that sees the two treated as one will not trust the screen about
 * anything else. Shimo never breaks a record on its own: a lower score is
 * offered to the club in the producer panel and only becomes the record when
 * someone here says so.
 */
function Records({ identity }: { identity: ClubIdentity }) {
  const records = identity.courseRecords ?? [];
  const courses = COURSES.filter((c) => c.clubId === CLUB_ID);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [tee, setTee] = useState(courses[0]?.tees ?? "White");
  const [strokes, setStrokes] = useState("");
  const [holder, setHolder] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [saved, setSaved] = useState(false);

  const tees = COURSES.find((c) => c.id === courseId)?.ratings.map((r) => r.tee) ?? [];
  const save = (next: NonNullable<ClubIdentity["courseRecords"]>) =>
    setClubIdentity(CLUB_ID, { courseRecords: next.length ? next : undefined });

  const add = () => {
    const n = Number(strokes);
    if (!courseId || !n || !holder.trim()) return;
    const others = records.filter((r) => !(r.courseId === courseId && r.tee === tee));
    save([...others, { courseId, tee, strokes: n, holder: holder.trim(), year: Number(year) }]);
    setStrokes("");
    setHolder("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <Label>Course records</Label>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Held per set of tees, because a white-tee record is not a red-tee
        record. Shimo never breaks one by itself: if it records a lower score it
        asks you in the TV producer panel first.
      </p>

      {records.length > 0 && (
        <div className="mt-3 space-y-2">
          {records.map((r) => (
            <div
              key={`${r.courseId}-${r.tee}`}
              className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2"
            >
              <span className="text-[13px] text-ink-soft">
                <Trophy className="mr-1.5 inline size-3.5 text-gold" />
                {COURSES.find((c) => c.id === r.courseId)?.name ?? r.courseId} ·{" "}
                {r.tee} tees — <span className="font-medium">{r.strokes}</span>,{" "}
                {r.holder} ({r.year})
              </span>
              <button
                type="button"
                aria-label="Remove this record"
                className="text-muted-foreground hover:text-destructive"
                onClick={() =>
                  save(records.filter((x) => !(x.courseId === r.courseId && x.tee === r.tee)))
                }
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger className="col-span-2">
            <SelectValue placeholder="Course" />
          </SelectTrigger>
          <SelectContent>
            {courses.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tee} onValueChange={setTee}>
          <SelectTrigger>
            <SelectValue placeholder="Tees" />
          </SelectTrigger>
          <SelectContent>
            {tees.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={strokes}
          onChange={(e) => setStrokes(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          placeholder="Strokes"
        />
        <Input
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          placeholder="Year"
        />
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          placeholder="Who holds it"
        />
        <Button
          variant="outline"
          disabled={!strokes || holder.trim().length < 2}
          onClick={add}
        >
          {saved ? <Check className="size-4" /> : <Plus className="size-4" />}
          {saved ? "Saved" : "Set"}
        </Button>
      </div>
    </div>
  );
}
