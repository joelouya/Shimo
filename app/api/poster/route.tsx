/**
 * Poster renderer.
 *
 * Takes a finished PosterSpec and returns a 1080x1350 PNG, the portrait size
 * Instagram shows at full height. Rendering happens here rather than in the
 * browser so that the same spec always produces the same pixels: no waiting on
 * webfonts, no device pixel ratio, no screenshot of a page that scrolled.
 *
 * The renderer is Satori, which lays out a strict subset of CSS: flexbox only,
 * no grid, no float, and every element with more than one child must say
 * `display: flex`. That is the reason for the shape of the JSX below.
 *
 * Images are inlined as data URIs before layout. A club crest or a sponsor
 * mark is a URL on Supabase storage, and a fetch that fails mid-layout takes
 * the whole poster down; fetching first means a mark that cannot be read is
 * simply left out and its name is set instead.
 */

/* This file draws a PNG, not a page. `next/image` has nothing to optimise here
   and Satori has no notion of alt text, so the two image rules do not apply. */
/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { accentOnDark, accentOnLight, normalizeHex } from "@/lib/contrast";
import type { PosterSpec } from "@/lib/poster/spec";
import type { Sponsor } from "@/lib/types";

export const runtime = "nodejs";

export const WIDTH = 1080;
export const HEIGHT = 1350;

const CREAM = "#f7f3ec";
const CARD = "#fcfaf5";
const NAVY = "#1a2332";
const SAND = "#ece5d6";
const STONE = "#8b8578";
const INK_SOFT = "#414b5e";
const CLAY = "#b84a2e";
const GOLD = "#a08434";

const fontDir = join(process.cwd(), "assets", "fonts");
const fonts = [
  { name: "Fraunces", data: readFileSync(join(fontDir, "fraunces-600.ttf")), weight: 600 as const, style: "normal" as const },
  { name: "Inter", data: readFileSync(join(fontDir, "inter-400.ttf")), weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: readFileSync(join(fontDir, "inter-600.ttf")), weight: 600 as const, style: "normal" as const },
];

/* ---------- images ---------- */

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/** Fetch once, inline as a data URI, and never throw. */
async function inline(url: string | undefined): Promise<string | undefined> {
  if (!url) return undefined;
  if (url.startsWith("data:")) return url;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") ?? "image/png";
    // Satori rasterises PNG and JPEG; an SVG has to be embedded as markup,
    // which it does not do inside a data URI, so those are skipped.
    if (!/^image\/(png|jpeg|jpg|webp)/.test(type)) return undefined;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) return undefined;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Resolve every remote image in the spec up front, in parallel. */
async function withInlinedImages(spec: PosterSpec): Promise<PosterSpec> {
  const [logo, image, ...marks] = await Promise.all([
    inline(spec.club.logo),
    inline(spec.club.image),
    ...(spec.sponsors ?? []).map((s) => inline(s.logoUrl)),
  ]);
  return {
    ...spec,
    club: { ...spec.club, logo, image },
    sponsors: spec.sponsors?.map((s, i) => ({ ...s, logoUrl: marks[i] })),
  };
}

/* ---------- palette ---------- */

/**
 * The club's colour, with the two tones the poster needs derived from it: one
 * that carries on cream, one that carries on the navy band. A club that has
 * set nothing gets Shimo's clay, so a poster is never colourless.
 */
/** `#rrggbb` plus an alpha, for the scrim over a club's photograph. */
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function palette(accent?: string) {
  const hex = (accent && normalizeHex(accent)) || CLAY;
  return {
    base: hex,
    onLight: accentOnLight(hex),
    onDark: accentOnDark(hex),
    /*
     * The club's colour taken deep enough to carry cream text, and used as a
     * ground rather than as a tint. This is the difference between a club
     * having a colour on the poster and the poster being in the club's colour.
     */
    ground: accentOnLight(hex, 7),
  };
}

/* ---------- pieces shared by both templates ---------- */

function Masthead({
  spec,
  tone,
}: {
  spec: PosterSpec;
  tone: ReturnType<typeof palette>;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
      {spec.club.logo ? (
        <img
          src={spec.club.logo}
          width={72}
          height={72}
          style={{ objectFit: "contain" }}
        />
      ) : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: 21,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: CREAM,
          }}
        >
          {spec.club.name}
        </div>
        <div
          style={{
            marginTop: 7,
            width: 46,
            height: 3,
            backgroundColor: tone.onDark,
          }}
        />
      </div>
    </div>
  );
}

/**
 * The navy header both posters open with. `compact` tightens it for the
 * results poster, where the leaderboard below needs every pixel it can get.
 */
function Header({
  spec,
  tone,
  titleSize,
  compact,
}: {
  spec: PosterSpec;
  tone: ReturnType<typeof palette>;
  titleSize: number;
  compact?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: NAVY,
        padding: compact ? "42px 68px 34px" : "54px 68px 48px",
      }}
    >
      <Masthead spec={spec} tone={tone} />
      <div
        style={{
          marginTop: compact ? 32 : 44,
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: compact ? 20 : 23,
          letterSpacing: 4,
          textTransform: "uppercase",
          color: tone.onDark,
        }}
      >
        {spec.eyebrow}
      </div>
      <div
        style={{
          marginTop: compact ? 12 : 16,
          fontFamily: "Fraunces",
          fontWeight: 600,
          fontSize: titleSize,
          lineHeight: 1.04,
          letterSpacing: -1.5,
          color: CREAM,
        }}
      >
        {spec.title}
      </div>
      <div
        style={{
          marginTop: compact ? 18 : 26,
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: compact ? 26 : 30,
          color: CREAM,
        }}
      >
        {spec.dateLine}
      </div>
      <div
        style={{
          marginTop: compact ? 5 : 8,
          fontFamily: "Inter",
          fontSize: compact ? 21 : 24,
          color: "#a8b0bd",
        }}
      >
        {spec.venueLine}
      </div>
    </div>
  );
}

function Label({ children, color }: { children: string; color: string }) {
  return (
    <div
      style={{
        fontFamily: "Inter",
        fontWeight: 600,
        fontSize: 18,
        letterSpacing: 3.2,
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Sponsors along the foot, in billing order, the title sponsor larger than the
 * rest. A sponsor whose mark could not be inlined is set as its name, which is
 * what a club would do by hand rather than leave a hole in the row.
 */
function SponsorFoot({
  sponsors,
  credit,
  tone,
}: {
  sponsors: Sponsor[];
  credit: boolean;
  tone: ReturnType<typeof palette>;
}) {
  const order = { title: 0, prize: 1, category: 2, partner: 3 };
  const sorted = [...sponsors].sort(
    (a, b) => (order[a.tier ?? "partner"] ?? 3) - (order[b.tier ?? "partner"] ?? 3),
  );
  // Three or four backers can be billed properly; past that everyone shares the
  // row evenly and the title sponsor loses its label rather than the row losing
  // a sponsor. The strip is one line high in every case.
  const roomy = sorted.length <= 4;
  const gap = roomy ? 40 : 26;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: SAND,
        padding: sorted.length ? "30px 68px 26px" : "22px 68px",
      }}
    >
      {sorted.length ? (
        <div style={{ display: "flex", alignItems: "center", gap }}>
          {sorted.map((s) => {
            const isTitle = s.tier === "title" && roomy;
            /*
             * Every mark gets the same box and is fitted inside it. One club
             * sends a square crest and the next a wordmark five times as wide;
             * scaling by height alone lets the second one take the whole row
             * and push the strip onto a second line, which drops the last line
             * of the poster off the bottom. A fixed box makes the foot the same
             * height whatever arrives, and still bills the title sponsor larger.
             */
            const box = isTitle
              ? { w: 190, h: 54 }
              : { w: roomy ? 150 : 118, h: roomy ? 40 : 34 };
            return (
              <div
                key={s.id}
                style={{ display: "flex", alignItems: "center", gap: 14 }}
              >
                {s.logoUrl ? (
                  <img
                    src={s.logoUrl}
                    width={box.w}
                    height={box.h}
                    style={{
                      width: box.w,
                      height: box.h,
                      objectFit: "contain",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      fontFamily: "Fraunces",
                      fontWeight: 600,
                      fontSize: isTitle ? 34 : roomy ? 25 : 21,
                      color: NAVY,
                    }}
                  >
                    {s.name}
                  </div>
                )}
                {isTitle ? (
                  <div
                    style={{
                      fontFamily: "Inter",
                      fontSize: 15,
                      letterSpacing: 2,
                      textTransform: "uppercase",
                      color: STONE,
                    }}
                  >
                    Title sponsor
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
      {credit ? (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: sorted.length ? 26 : 0,
            paddingTop: sorted.length ? 20 : 0,
            borderTop: sorted.length ? `1px solid #ded5c2` : "none",
            fontFamily: "Inter",
            fontSize: 17,
            letterSpacing: 1.6,
            color: STONE,
          }}
        >
          <div style={{ display: "flex" }}>Live scoring on Shimo</div>
          <div style={{ display: "flex", color: tone.onLight, fontWeight: 600 }}>
            shimo.golf
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- fixture template ---------- *
 *
 * Rebuilt around two decisions.
 *
 * The club takes the credit. The header ground is the club's own colour, or
 * their course photograph when they have uploaded one for the clubhouse
 * screen, rather than Shimo's navy. Shimo keeps one line at the foot. A poster
 * that looks like the club made it gets posted; one that looks like software
 * made it gets posted once.
 *
 * The prizes outrank the price. The old sheet set the entry fee in 34px
 * Fraunces inside a bordered card and dropped the prize list entirely once the
 * poster grew crowded, which is a fixture poster arguing against itself. What
 * you are playing for is now the largest thing under the title and is never
 * dropped; the fee is a phrase in the detail line, where a qualifying detail
 * belongs.
 * ------------------------------------------------------------------ */

/**
 * The band the poster opens with: the club's photograph under a scrim mixed
 * from their own colour, or that colour alone when there is no photograph.
 *
 * The scrim is weighted downward, the same trick the clubhouse screen uses, so
 * the photograph stays a photograph at the top of the frame while the type
 * below it sits on something dark enough to read against.
 */
function FixtureHero({
  spec,
  tone,
  titleSize,
  dense,
}: {
  spec: PosterSpec;
  tone: ReturnType<typeof palette>;
  titleSize: number;
  /** true when the sheet below is carrying rounds as well as prizes */
  dense?: boolean;
}) {
  /*
   * The photograph gets its own band and the type sits below it on solid
   * colour, rather than both sharing one scrimmed image.
   *
   * The scrimmed version was tested against a high-contrast image and failed
   * the way it will fail in the field: a club uploads a bright sky or a
   * bunker face, and cream type lands on top of it. A scrim heavy enough to
   * guarantee legibility everywhere is heavy enough to hide the photograph it
   * was protecting. Splitting them means no upload can ever make the title
   * unreadable, and the picture stays a picture.
   */
  /*
   * A championship carries a full prize list and a rounds block; a club medal
   * carries prizes alone. Both get the same 1350px, and the dense one does not
   * fit alongside a photograph: measured, it needs about 650px of body and a
   * photo band leaves 512.
   *
   * So the photograph is what yields, not the foot of the sheet. Shrinking the
   * hero instead was tried and produced a poster with the venue line sliced by
   * the band edge and the entry details missing entirely. A club still gets
   * their colour, their crest and their name on every poster; the picture is
   * the one part a dense sheet cannot afford.
   */
  const photo = dense ? undefined : spec.club.image;
  const photoH = 272;
  const bandH = photo ? 500 : dense ? 578 : 604;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {photo ? (
        <div
          style={{
            position: "relative",
            display: "flex",
            width: WIDTH,
            height: photoH,
          }}
        >
          <img
            src={photo}
            width={WIDTH}
            height={photoH}
            style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }}
          />
          {/* a breath of the club's colour, and a fade into the band below so
              the two do not meet on a hard line */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: WIDTH,
              height: photoH,
              display: "flex",
              backgroundImage: `linear-gradient(180deg, ${rgba(
                tone.ground,
                0.18,
              )} 0%, ${rgba(tone.ground, 0.1)} 62%, ${rgba(
                tone.ground,
                1,
              )} 100%)`,
            }}
          />
        </div>
      ) : null}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          height: bandH,
          backgroundColor: tone.ground,
          padding: photo ? "40px 68px 52px" : "56px 68px 52px",
        }}
      >
        <Masthead spec={spec} tone={tone} />

        <div style={{ display: "flex", flex: 1 }} />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: 23,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: rgba(CREAM, 0.72),
            }}
          >
            {spec.eyebrow}
          </div>
          <div
            style={{
              fontFamily: "Fraunces",
              fontWeight: 600,
              fontSize: titleSize,
              lineHeight: 1.02,
              marginTop: 18,
              color: CREAM,
            }}
          >
            {spec.title}
          </div>
          <div
            style={{
              fontFamily: "Fraunces",
              fontWeight: 600,
              fontSize: 34,
              marginTop: 22,
              color: CREAM,
            }}
          >
            {spec.dateLine}
          </div>
          <div style={{ fontSize: 24, marginTop: 10, color: rgba(CREAM, 0.75) }}>
            {spec.venueLine}
          </div>
        </div>
      </div>
    </div>
  );
}

/** One of the three facts a player checks before entering. */
function FixtureFact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: ReturnType<typeof palette>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <Label color={tone.onLight}>{label}</Label>
      <div
        style={{
          fontFamily: "Fraunces",
          fontWeight: 600,
          fontSize: 27,
          lineHeight: 1.25,
          marginTop: 12,
          color: NAVY,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function FixturePoster({ spec }: { spec: PosterSpec }) {
  const tone = palette(spec.club.accent);
  const fees = spec.fees ?? [];
  const schedule = spec.schedule ?? [];
  const prizes = spec.prizes ?? [];
  const titleSize =
    spec.title.length > 34 ? 74 : spec.title.length > 22 ? 86 : 98;

  /* The fee reads as a phrase now, so several tiers cost one line rather than
     a table: "KES 2,500, or KES 2,000 for members". */
  /* One tier is a price; several are a small table read as a phrase. The
     tier labels already say what they are, so they lead. */
  const feeLine = !fees.length
    ? undefined
    : fees.length === 1
      ? `Entry ${fees[0].value}`
      : fees.map((f) => `${f.label} ${f.value}`).join("  ·  ");

  /*
   * A championship's three rounds cannot be joined into one string and dropped
   * in a third-width column: it wraps to five lines, runs off the sheet and
   * takes the detail line with it. One round is a fact; several rounds are a
   * block of their own.
   */
  const multiRound = schedule.length > 1;
  const teeLine = schedule.length === 1 ? schedule[0].value : undefined;

  /*
   * A multi-round sheet has no "First tee" fact, so the cut takes that column
   * instead of being buried in the small print, where it wrapped the detail
   * line onto a second line and had it sliced by the sponsor foot. The cut is
   * the thing a player entering a championship most needs to know anyway.
   */
  const cutAsFact = multiRound && Boolean(spec.cut);
  const detail = [
    feeLine,
    cutAsFact ? undefined : spec.cut,
    spec.note,
  ]
    .filter(Boolean)
    .join("  ·  ");

  /* Prizes are never dropped; when there are many they simply set tighter,
     and tighter again when a rounds block is competing for the same page. */
  const tightPrizes = prizes.length > 3 || multiRound;
  /* The sheet is dense once a rounds block and a full prize list share it. */
  const dense = multiRound && prizes.length > 2;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: CREAM,
        fontFamily: "Inter",
      }}
    >
      <FixtureHero
        spec={spec}
        tone={tone}
        titleSize={titleSize}
        dense={dense}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "44px 68px 0",
        }}
      >
        {prizes.length ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <Label color={tone.onLight}>Playing for</Label>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: tightPrizes ? 14 : 18,
              }}
            >
              {prizes.map((p, i) => (
                <div
                  key={p.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    paddingTop: i === 0 ? 0 : tightPrizes ? 12 : 16,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "Fraunces",
                      fontWeight: 600,
                      fontSize: tightPrizes ? 32 : 38,
                      color: NAVY,
                    }}
                  >
                    {p.label}
                  </div>
                  <div
                    style={{
                      fontSize: tightPrizes ? 24 : 26,
                      color: INK_SOFT,
                      marginLeft: 28,
                    }}
                  >
                    {p.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {multiRound ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: prizes.length ? 30 : 0,
              paddingTop: prizes.length ? 26 : 0,
              borderTop: prizes.length ? "1px solid #e4ddce" : "none",
            }}
          >
            <Label color={tone.onLight}>Rounds</Label>
            <div
              style={{ display: "flex", flexDirection: "column", marginTop: 12 }}
            >
              {schedule.map((r) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    paddingTop: 8,
                  }}
                >
                  <div
                    style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 26, color: NAVY }}
                  >
                    {r.label}
                  </div>
                  <div style={{ fontSize: 23, color: INK_SOFT, marginLeft: 24 }}>
                    {r.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            gap: 36,
            marginTop: prizes.length || multiRound ? (multiRound ? 30 : 42) : 0,
            paddingTop: prizes.length || multiRound ? (multiRound ? 26 : 34) : 0,
            borderTop:
              prizes.length || multiRound ? "1px solid #e4ddce" : "none",
          }}
        >
          {teeLine ? (
            <FixtureFact label="First tee" value={teeLine} tone={tone} />
          ) : null}
          {spec.closes ? (
            <FixtureFact label="Entries close" value={spec.closes} tone={tone} />
          ) : null}
          {spec.eligibility ? (
            <FixtureFact
              label="Who may enter"
              value={spec.eligibility}
              tone={tone}
            />
          ) : null}
          {cutAsFact ? (
            <FixtureFact label="Cut" value={spec.cut!} tone={tone} />
          ) : null}
        </div>

        {spec.contacts?.length ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
            <Label color={tone.onLight}>To enter</Label>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 24,
                marginTop: 12,
              }}
            >
              {spec.contacts.map((c) => (
                <div key={c} style={{ fontSize: 25, color: NAVY }}>
                  {c}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", flex: 1 }} />

        {detail ? (
          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: STONE,
              paddingTop: 22,
              paddingBottom: 30,
            }}
          >
            {detail}
          </div>
        ) : null}
      </div>

      <SponsorFoot
        sponsors={spec.sponsors ?? []}
        credit={spec.credit}
        tone={tone}
      />
    </div>
  );
}

/* ---------- results template ---------- */

function ResultsPoster({ spec }: { spec: PosterSpec }) {
  const tone = palette(spec.club.accent);
  const rows = spec.rows ?? [];
  // The hero is only drawn when the spec names someone to draw; otherwise
  // every player, the leader included, goes in the list.
  const hero = spec.heroLabel ? rows[0] : undefined;
  const rest = hero ? rows.slice(1) : rows;
  const titleSize = spec.title.length > 34 ? 58 : spec.title.length > 22 ? 68 : 78;

  /*
   * The board has to fit; a poster cannot scroll. Satori gives no way to
   * measure, so the row height is chosen from what is left after the parts
   * whose heights are known: a two-line title costs a line, and sponsors cost
   * the taller foot. Rows are then padded to fill whatever remains, so a short
   * board breathes and a full one still clears the strip.
   */
  const titleLines = titleSize === 58 ? 2 : 1;
  const headerH = 380 + (titleLines - 1) * Math.round(titleSize * 1.04);
  const footH = spec.sponsors?.length ? 190 : 76;
  const heroH = hero ? 148 + 30 : 0;
  const chromeH = 34 + heroH + 38 + 74; // padding, hero, column heads, note
  const budget = HEIGHT - headerH - footH - chromeH;
  // Rows share what is left, up to a limit past which a short board stops
  // looking generous and starts looking padded.
  const perRow = rest.length ? Math.min(104, Math.floor(budget / rest.length)) : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: WIDTH,
        height: HEIGHT,
        backgroundColor: CREAM,
        fontFamily: "Inter",
      }}
    >
      <Header spec={spec} tone={tone} titleSize={titleSize} compact />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "34px 68px 0",
        }}
      >
        {hero ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 26,
              backgroundColor: CARD,
              border: `2px solid ${tone.onLight}`,
              borderRadius: 20,
              padding: "26px 32px",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
              }}
            >
              <div
                style={{
                  fontFamily: "Inter",
                  fontWeight: 600,
                  fontSize: 17,
                  letterSpacing: 3.2,
                  textTransform: "uppercase",
                  color: GOLD,
                }}
              >
                {spec.heroLabel}
              </div>
              <div
                style={{
                  marginTop: 6,
                  fontFamily: "Fraunces",
                  fontWeight: 600,
                  fontSize: 50,
                  lineHeight: 1.1,
                  color: NAVY,
                }}
              >
                {hero.name}
              </div>
              {hero.detail ? (
                <div style={{ marginTop: 2, fontSize: 21, color: STONE }}>
                  {hero.detail}
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  fontFamily: "Fraunces",
                  fontWeight: 600,
                  fontSize: 58,
                  color: tone.onLight,
                }}
              >
                {hero.score}
              </div>
              {hero.total ? (
                <div style={{ fontSize: 20, color: STONE }}>
                  {`${hero.total} strokes`}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {rest.length ? (
          <div
            style={{ display: "flex", flexDirection: "column", marginTop: 30 }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                paddingBottom: 12,
                borderBottom: "1px solid #e4ddce",
              }}
            >
              <Label color={STONE}>Leaderboard</Label>
              <Label color={STONE}>{spec.scoreLabel ?? "Score"}</Label>
            </div>
            {rest.map((r) => (
              <div
                key={`${r.pos}-${r.name}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: perRow,
                  gap: 20,
                  borderBottom: "1px solid #ece5d6",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 58,
                    fontFamily: "Fraunces",
                    fontWeight: 600,
                    fontSize: 27,
                    color: STONE,
                  }}
                >
                  {r.pos}
                </div>
                {/* name and club on one line: a stacked pair costs a row of
                    height each, which is the difference between showing ten
                    players and showing seven */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    flex: 1,
                  }}
                >
                  <div style={{ fontSize: 27, color: NAVY }}>{r.name}</div>
                  {r.detail ? (
                    <div style={{ fontSize: 18, color: STONE }}>{r.detail}</div>
                  ) : null}
                </div>
                {r.total ? (
                  <div style={{ display: "flex", fontSize: 22, color: STONE }}>
                    {r.total}
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    width: 104,
                    fontFamily: "Fraunces",
                    fontWeight: 600,
                    fontSize: 31,
                    color: NAVY,
                  }}
                >
                  {r.score}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div style={{ display: "flex", flex: 1 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            paddingBottom: 26,
            fontSize: 19,
            color: STONE,
          }}
        >
          {spec.cut ? <div style={{ display: "flex" }}>{spec.cut}</div> : null}
          {spec.note ? <div style={{ display: "flex" }}>{spec.note}</div> : null}
        </div>
      </div>

      <SponsorFoot
        sponsors={spec.sponsors ?? []}
        credit={spec.credit}
        tone={tone}
      />
    </div>
  );
}

/* ---------- handler ---------- */

async function render(spec: PosterSpec) {
  const ready = await withInlinedImages(spec);
  const image = new ImageResponse(
    ready.kind === "results" ? (
      <ResultsPoster spec={ready} />
    ) : (
      <FixturePoster spec={ready} />
    ),
    { width: WIDTH, height: HEIGHT, fonts },
  );

  // Draw the whole PNG here rather than handing back the stream. Satori lays
  // out lazily, so a layout it refuses (an unsupported style, an element it
  // cannot measure) throws after the response headers have gone out, and the
  // caller sees a truncated body instead of an error. Buffering costs a couple
  // of hundred kilobytes and turns that into a 500 with a reason in the log.
  const png = await image.arrayBuffer();
  return new Response(png, {
    headers: {
      "content-type": "image/png",
      "content-length": String(png.byteLength),
      // a poster is derived entirely from its spec, so it may be cached, but
      // a club that edits the tournament and regenerates must see the change
      "cache-control": "no-store",
    },
  });
}

export async function POST(req: Request) {
  try {
    const spec = (await req.json()) as PosterSpec;
    if (!spec?.title) return new Response("Bad spec", { status: 400 });
    return await render(spec);
  } catch (err) {
    console.error("poster render failed", err);
    return new Response("Poster render failed", { status: 500 });
  }
}

/** The same renderer over a URL, so a poster can be opened or linked directly. */
export async function GET(req: Request) {
  const encoded = new URL(req.url).searchParams.get("d");
  if (!encoded) return new Response("Missing spec", { status: 400 });
  try {
    const json = Buffer.from(encoded, "base64url").toString("utf8");
    return await render(JSON.parse(json) as PosterSpec);
  } catch (err) {
    console.error("poster render failed", err);
    return new Response("Poster render failed", { status: 500 });
  }
}
