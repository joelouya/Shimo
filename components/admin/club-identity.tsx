"use client";

/**
 * Club identity: the logo, one accent colour, and the contact details that
 * appear on tournament pages and posters.
 *
 * Shimo's own identity is not up for negotiation here. The wordmark, the
 * editorial type, the cream field and the navy panels stay as they are. The
 * club's colour lands on the surfaces that belong to them, which is why the
 * preview shows exactly those three surfaces and nothing else.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { Check, Loader2, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Logo, LogoMark } from "@/components/logo";
import { clubById } from "@/lib/data";
import {
  DEFAULT_ACCENT,
  accentOnDark,
  accentOnLight,
  checkAccent,
  textOnAccent,
} from "@/lib/contrast";
import { clubIdentityOf, setClubIdentity, useSim } from "@/lib/sim/store";
import { uploadClubLogo, validateLogo } from "@/lib/sync/storage";
import { REMOTE_CONFIGURED } from "@/lib/sync/client";
import { cn } from "@/lib/utils";

/** The club this console administers. */
const CLUB_ID = "muthaiga";

const SWATCHES = [
  { hex: "#b84a2e", label: "Shimo terracotta" },
  { hex: "#1e7a4c", label: "Fairway green" },
  { hex: "#2b6cb0", label: "Club blue" },
  { hex: "#8a1c3b", label: "Claret" },
  { hex: "#5b3fa8", label: "Violet" },
  { hex: "#8a5a12", label: "Bronze" },
];

export function ClubIdentityCard() {
  const club = clubById(CLUB_ID);
  const identity = useSim((s) => clubIdentityOf(s, CLUB_ID));
  const fileRef = useRef<HTMLInputElement>(null);

  const [draftAccent, setDraftAccent] = useState(identity.accent ?? DEFAULT_ACCENT);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const check = checkAccent(draftAccent);
  const applied = identity.accent ?? DEFAULT_ACCENT;
  const light = accentOnLight(check.hex ?? applied);
  const dark = accentOnDark(check.hex ?? applied);
  const onAccent = textOnAccent(check.hex ?? applied);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    const problem = await validateLogo(file);
    if (problem) return setUploadError(problem);
    if (!REMOTE_CONFIGURED) {
      return setUploadError(
        "Logo upload needs the club's database configured. Ask whoever set Shimo up.",
      );
    }
    setUploading(true);
    try {
      const { url } = await uploadClubLogo(CLUB_ID, file);
      setClubIdentity(CLUB_ID, { logoUrl: url });
      flash();
    } catch (e) {
      setUploadError(
        (e as Error).message ?? "The upload failed. Check the connection and try again.",
      );
    } finally {
      setUploading(false);
    }
  };

  const field = (
    key: "phone" | "phoneAlt" | "whatsapp" | "email" | "website",
    label: string,
    placeholder: string,
    type = "text",
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        placeholder={placeholder}
        defaultValue={identity[key] ?? ""}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== (identity[key] ?? "")) {
            setClubIdentity(CLUB_ID, { [key]: v || undefined });
            flash();
          }
        }}
      />
    </div>
  );

  return (
    <section className="rounded-2xl bg-card p-6 shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-serif text-[22px] leading-tight text-foreground">
            Club identity
          </h2>
          <p className="mt-1 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">
            Your crest, your colour and how members reach you. These appear on
            your tournaments, your leaderboard and the posters Shimo generates.
            Shimo&apos;s own look stays as it is underneath.
          </p>
        </div>
        {saved && (
          <span className="flex shrink-0 items-center gap-1.5 text-[12.5px] text-clay-deep">
            <Check className="size-3.5" />
            Saved
          </span>
        )}
      </div>

      {/* ---- logo ---- */}
      <div className="mt-6 border-t border-border/60 pt-5">
        <p className="smallcaps mb-3 text-muted-foreground">Crest</p>
        <div className="flex items-center gap-5">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-secondary/40">
            {identity.logoUrl ? (
              // the club's own file, so next/image optimisation is skipped
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={identity.logoUrl}
                alt={`${club.name} crest`}
                className="size-full object-contain"
              />
            ) : (
              <LogoMark className="size-10 opacity-25" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                {identity.logoUrl ? "Replace crest" : "Upload crest"}
              </Button>
              {identity.logoUrl && (
                <Button
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setClubIdentity(CLUB_ID, { logoUrl: undefined });
                    flash();
                  }}
                >
                  <Trash2 className="size-4" />
                  Remove
                </Button>
              )}
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
              Square works best, at least 400px. PNG with a transparent
              background is ideal. JPG, WebP and SVG are fine too. Up to 2MB;
              Shimo squares it and scales it down for you.
            </p>
            {uploadError && (
              <p className="mt-2 text-[12.5px] text-destructive">{uploadError}</p>
            )}
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            void pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {/* ---- accent ---- */}
      <div className="mt-6 border-t border-border/60 pt-5">
        <p className="smallcaps mb-3 text-muted-foreground">Accent colour</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="color"
            aria-label="Pick an accent colour"
            value={check.hex ?? DEFAULT_ACCENT}
            onChange={(e) => setDraftAccent(e.target.value)}
            className="size-11 cursor-pointer rounded-lg border border-border bg-transparent p-1"
          />
          <Input
            value={draftAccent}
            onChange={(e) => setDraftAccent(e.target.value)}
            placeholder="#B84A2E"
            className="h-11 w-[140px] font-mono text-[14px]"
          />
          <Button
            variant="clay"
            disabled={!check.ok || check.hex === identity.accent}
            onClick={() => {
              if (!check.hex) return;
              setClubIdentity(CLUB_ID, { accent: check.hex });
              flash();
            }}
          >
            Apply colour
          </Button>
          {identity.accent && (
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => {
                setClubIdentity(CLUB_ID, { accent: undefined });
                setDraftAccent(DEFAULT_ACCENT);
                flash();
              }}
            >
              Back to Shimo&apos;s
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {SWATCHES.map((sw) => (
            <button
              key={sw.hex}
              onClick={() => setDraftAccent(sw.hex)}
              title={sw.label}
              className={cn(
                "size-7 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer",
                draftAccent.toLowerCase() === sw.hex
                  ? "border-foreground"
                  : "border-transparent",
              )}
              style={{ backgroundColor: sw.hex }}
            />
          ))}
        </div>

        {/* the contrast verdict, in words */}
        {!check.ok ? (
          <div className="mt-4 rounded-xl border border-amber-flag/30 bg-amber-wash px-4 py-3">
            <p className="text-[13px] leading-relaxed text-amber-flag">
              {check.reason}
            </p>
            {check.suggestion && (
              <button
                onClick={() => setDraftAccent(check.suggestion!)}
                className="mt-2 inline-flex items-center gap-2 text-[13px] font-medium text-amber-flag underline-offset-2 hover:underline cursor-pointer"
              >
                <span
                  className="size-3.5 rounded-full"
                  style={{ backgroundColor: check.suggestion }}
                />
                Use {check.suggestion} instead
              </button>
            )}
          </div>
        ) : (
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            Readable on cream at {Math.round(check.ratioOnCream * 10) / 10}:1,
            clear of the 4.5:1 WCAG AA asks for.
            {dark.toLowerCase() !== (check.hex ?? "").toLowerCase() && (
              <>
                {" "}
                On the dark leaderboard Shimo uses a lighter tone of it (
                <span className="font-mono">{dark}</span>) so it stays legible
                there.
              </>
            )}
          </p>
        )}

        {/* ---- preview: the three surfaces the accent actually touches ---- */}
        <div className="mt-5">
          <p className="smallcaps mb-2.5 text-muted-foreground">Preview</p>
          <div className="grid gap-3 lg:grid-cols-3">
            {/* a tournament card */}
            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="smallcaps mb-2 text-[9px] text-muted-foreground">
                Tournament card
              </p>
              <div className="rounded-xl bg-card p-3 shadow-card">
                <div className="flex items-start gap-2.5">
                  {identity.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={identity.logoUrl}
                      alt=""
                      className="size-8 shrink-0 rounded object-contain"
                    />
                  ) : (
                    <div className="flex size-8 shrink-0 flex-col items-center justify-center rounded bg-secondary/70">
                      <span className="font-serif text-[13px] leading-none text-foreground">
                        22
                      </span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-serif text-[14px] leading-snug text-foreground">
                      {club.short} Monthly Mug
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {club.name}
                    </p>
                    <span
                      className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9.5px] font-medium"
                      style={{ backgroundColor: light + "1f", color: light }}
                    >
                      You&apos;re eligible
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* the leaderboard header */}
            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="smallcaps mb-2 text-[9px] text-muted-foreground">
                Leaderboard
              </p>
              <div className="overflow-hidden rounded-xl bg-primary p-3 text-primary-foreground">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
                      style={{ backgroundColor: dark, color: onAccent }}
                    >
                      ● LIVE
                    </span>
                    <p className="mt-1.5 font-serif text-[15px] leading-tight">
                      Monthly Mug
                    </p>
                  </div>
                  {identity.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={identity.logoUrl}
                      alt=""
                      className="size-7 shrink-0 rounded object-contain opacity-90"
                    />
                  ) : (
                    <Logo className="text-[10px] shrink-0" tone="cream" />
                  )}
                </div>
                <p className="mt-2 text-[10px]" style={{ color: dark }}>
                  1 · Joel Ouya · 38 pts
                </p>
              </div>
            </div>

            {/* the results export */}
            <div className="rounded-2xl border border-border bg-background p-3">
              <p className="smallcaps mb-2 text-[9px] text-muted-foreground">
                Results export
              </p>
              <div className="rounded-xl bg-card p-3 shadow-card">
                <div className="flex items-center gap-2">
                  {identity.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={identity.logoUrl}
                      alt=""
                      className="size-6 rounded object-contain"
                    />
                  ) : (
                    <LogoMark className="size-5 opacity-40" />
                  )}
                  <p className="smallcaps text-[9px]" style={{ color: light }}>
                    Final results
                  </p>
                </div>
                <p className="mt-2 font-serif text-[14px] text-foreground">
                  Monthly Mug
                </p>
                <div
                  className="mt-2 rounded-lg px-2.5 py-1.5"
                  style={{ backgroundColor: light, color: onAccent }}
                >
                  <p className="text-[10px] font-medium">Champion · Joel Ouya</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- contact ---- */}
      <div className="mt-6 border-t border-border/60 pt-5">
        <p className="smallcaps mb-1 text-muted-foreground">Contact</p>
        <p className="mb-3 text-[12.5px] text-muted-foreground">
          Shown on your tournament pages and on generated posters.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("phone", "Primary phone", "+254 20 000 0000", "tel")}
          {field("phoneAlt", "Second phone", "+254 722 000 000", "tel")}
          {field("whatsapp", "WhatsApp", "+254 722 000 000", "tel")}
          {field("email", "Email", "golf@club.co.ke", "email")}
        </div>
        <div className="mt-4">
          {field("website", "Website", "www.club.co.ke", "url")}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-secondary/50 px-4 py-3.5">
          <div>
            <Label className="text-foreground">Credit Shimo on posters</Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              A small shimo.golf line at the foot of generated posters.
            </p>
          </div>
          <Switch
            checked={identity.posterCredit !== false}
            onCheckedChange={(v) => {
              setClubIdentity(CLUB_ID, { posterCredit: v });
              flash();
            }}
          />
        </div>
      </div>
    </section>
  );
}
