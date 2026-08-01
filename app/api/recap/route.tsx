/**
 * The sponsor recap pack.
 *
 * Pages are drawn with Satori, exactly like the poster, then bound into one
 * PDF with pdf-lib. Two reasons for that route rather than an HTML print: it
 * runs on serverless with no headless browser, and it means the pack, the
 * poster and the clubhouse screen all come out of one visual system rather
 * than three.
 *
 * The research says sponsor fulfilment takes a club four to twelve hours and
 * is the least systematised part of the whole workflow. That is what this is
 * for: the same document, in minutes, per sponsor, with figures that were
 * actually observed.
 *
 * On the figures: every number arriving here is a `Measure`, so a page cannot
 * print a bare count. Where Shimo did not observe something the pack says so
 * and says why, in words a club can repeat to a sponsor without sounding
 * evasive. That is not modesty, it is the product's first claim applied to the
 * one document a club hands to somebody who paid.
 */

/* Draws a PDF, not a page. `next/image` has nothing to optimise here and
   Satori has no notion of alt text, so the two image rules do not apply. */
/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PDFDocument } from "pdf-lib";

import { accentOnLight, normalizeHex } from "@/lib/contrast";
import { SURFACE_LABEL } from "@/lib/sponsors";
import type { Measure } from "@/lib/exposure";
import type { RecapSpec } from "@/lib/recap/spec";

export const runtime = "nodejs";

const W = 1240;
const H = 1754; // A4 at 150dpi, so it prints as well as it scrolls

const CREAM = "#f7f3ec";
const CARD = "#fcfaf5";
const NAVY = "#1a2332";
const INK_SOFT = "#414b5e";
const STONE = "#736d61";
const BORDER = "#e4ddce";
const CLAY = "#b84a2e";

const fontDir = join(process.cwd(), "assets", "fonts");
const fonts = [
  {
    name: "Fraunces",
    data: readFileSync(join(fontDir, "fraunces-600.ttf")),
    weight: 600 as const,
    style: "normal" as const,
  },
  {
    name: "Inter",
    data: readFileSync(join(fontDir, "inter-400.ttf")),
    weight: 400 as const,
    style: "normal" as const,
  },
  {
    name: "Inter",
    data: readFileSync(join(fontDir, "inter-600.ttf")),
    weight: 600 as const,
    style: "normal" as const,
  },
];

/** The sponsor's own colour where it is theirs to have, ours where it is not. */
function tone(accent?: string) {
  const hex = (accent && normalizeHex(accent)) || CLAY;
  return { base: hex, onLight: accentOnLight(hex, 4.5) };
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

function Label({ children, color }: { children: string; color: string }) {
  return (
    <div
      style={{
        fontFamily: "Inter",
        fontWeight: 600,
        fontSize: 20,
        letterSpacing: 3,
        textTransform: "uppercase",
        color,
      }}
    >
      {children}
    </div>
  );
}

function Page({
  children,
  spec,
  foot,
}: {
  children: React.ReactNode;
  spec: RecapSpec;
  foot: string;
}) {
  const t = tone(spec.sponsor.accent);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: W,
        height: H,
        backgroundColor: CREAM,
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "72px 84px 0",
        }}
      >
        {children}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: `1px solid ${BORDER}`,
          margin: "0 84px",
          padding: "26px 0 40px",
          fontSize: 19,
          color: STONE,
        }}
      >
        <div style={{ display: "flex" }}>{foot}</div>
        <div style={{ display: "flex", color: t.onLight }}>
          {spec.event.title}
        </div>
      </div>
    </div>
  );
}

/**
 * A figure, or the reason there is not one.
 *
 * The only way a number reaches a page. An unmeasured figure is set in the
 * same slot at the same size, so the document reads as complete rather than as
 * having a hole in it, and the reason sits underneath in the sponsor's own
 * language.
 */
function Figure({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: Measure<string>;
  note?: string;
  accent: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        borderTop: `1px solid ${BORDER}`,
        padding: "22px 0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ display: "flex", fontSize: 24, color: INK_SOFT }}>
          {label}
        </div>
        {value.measured ? (
          <div
            style={{
              display: "flex",
              fontFamily: "Fraunces",
              fontWeight: 600,
              fontSize: 40,
              color: NAVY,
            }}
          >
            {value.value}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 22, color: STONE }}>
            Not measured
          </div>
        )}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 8,
          fontSize: 19,
          lineHeight: 1.5,
          color: STONE,
          maxWidth: 900,
        }}
      >
        {value.measured ? (note ?? "") : value.why}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page one: the day, and this sponsor's part in it
 * ------------------------------------------------------------------ */

function CoverPage({ spec }: { spec: RecapSpec }) {
  const t = tone(spec.sponsor.accent);
  return (
    <Page spec={spec} foot="Prepared by the club">
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        {spec.sponsor.logo ? (
          <img src={spec.sponsor.logo} width={140} height={80} style={{ objectFit: "contain" }} />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Label color={t.onLight}>{SURFACE_LABEL_TIER[spec.sponsor.tier] ?? "Sponsor"}</Label>
          <div
            style={{
              fontFamily: "Fraunces",
              fontWeight: 600,
              fontSize: 46,
              marginTop: 8,
              color: NAVY,
            }}
          >
            {spec.sponsor.name}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: 150 }} />

      <div style={{ display: "flex", flexDirection: "column" }}>
        {/* On a day a company presents and also title-sponsors, their name
            was already at the top of this page. Printing it again reads as a
            template that did not notice. */}
        {spec.event.presentedBy &&
        spec.event.presentedBy !== spec.sponsor.name ? (
          <Label color={STONE}>{spec.event.presentedBy}</Label>
        ) : null}
        <div
          style={{
            fontFamily: "Fraunces",
            fontWeight: 600,
            fontSize: 92,
            lineHeight: 1.03,
            marginTop: 18,
            color: NAVY,
          }}
        >
          {spec.event.title}
        </div>
        <div
          style={{
            fontFamily: "Fraunces",
            fontWeight: 600,
            fontSize: 38,
            marginTop: 26,
            color: INK_SOFT,
          }}
        >
          {spec.event.dateLine}
        </div>
        <div style={{ display: "flex", fontSize: 26, marginTop: 12, color: STONE }}>
          {spec.event.venueLine} · {spec.event.format} · {spec.event.fieldSize} played
        </div>
      </div>

      {spec.raised ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 48,
            backgroundColor: CARD,
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
            padding: "30px 34px",
          }}
        >
          <Label color={t.onLight}>Played for</Label>
          <div
            style={{
              fontFamily: "Fraunces",
              fontWeight: 600,
              fontSize: 40,
              marginTop: 12,
              color: NAVY,
            }}
          >
            {spec.raised.beneficiary}
          </div>
          {spec.raised.amount.measured ? (
            <div style={{ display: "flex", fontSize: 26, marginTop: 10, color: INK_SOFT }}>
              {spec.raised.amount.value} raised
              {spec.raised.target ? ` · target ${spec.raised.target}` : ""}
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 21, marginTop: 10, color: STONE, maxWidth: 860, lineHeight: 1.5 }}>
              {spec.raised.amount.why}
            </div>
          )}
        </div>
      ) : null}

      {/* Follows the event rather than being pinned to the foot. Splitting the
          cover between a block at the top and a block at the bottom left most
          of an A4 page empty in the middle, which reads as unfinished rather
          than as composed. */}
      <div style={{ display: "flex", flexDirection: "column", marginTop: 60 }}>
        <Label color={t.onLight}>Where your name appeared</Label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginTop: 18,
          }}
        >
          {spec.placements.map((p) => (
            <div
              key={p}
              style={{
                display: "flex",
                borderRadius: 999,
                border: `1px solid ${BORDER}`,
                backgroundColor: CARD,
                padding: "10px 22px",
                fontSize: 21,
                color: INK_SOFT,
              }}
            >
              {SURFACE_LABEL[p] ?? p}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }} />
    </Page>
  );
}

const SURFACE_LABEL_TIER: Record<string, string> = {
  title: "Title sponsor",
  presenting: "Presenting sponsor",
  category: "Category sponsor",
  supporting: "Supporting sponsor",
};

/* ------------------------------------------------------------------ *
 * Page two: what was measured
 * ------------------------------------------------------------------ */

function FiguresPage({ spec }: { spec: RecapSpec }) {
  const t = tone(spec.sponsor.accent);
  return (
    <Page spec={spec} foot="Observed by Shimo, or named as not measured">
      <Label color={t.onLight}>What we measured</Label>
      <div
        style={{
          fontFamily: "Fraunces",
          fontWeight: 600,
          fontSize: 56,
          marginTop: 16,
          color: NAVY,
        }}
      >
        The day in numbers
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 22,
          lineHeight: 1.55,
          marginTop: 18,
          maxWidth: 900,
          color: INK_SOFT,
        }}
      >
        Only what was actually counted appears as a figure. Anything Shimo
        could not observe is named as such, with the reason, rather than
        estimated.
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
        {spec.figures.map((f) => (
          <Figure
            key={f.label}
            label={f.label}
            value={f.value}
            note={f.note}
            accent={t.onLight}
          />
        ))}
      </div>

      {spec.contests.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", marginTop: 46 }}>
          <Label color={t.onLight}>Your contest</Label>
          {spec.contests.map((c) => (
            <div
              key={c.name + c.hole}
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 18,
                backgroundColor: CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 20,
                padding: "26px 30px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 600, fontSize: 34, color: NAVY }}>
                  {c.name}
                </div>
                <div style={{ display: "flex", fontSize: 22, color: STONE }}>
                  Hole {c.hole}
                </div>
              </div>
              <div style={{ display: "flex", fontSize: 24, marginTop: 12, color: INK_SOFT }}>
                {c.winner
                  ? `Won by ${c.winner}${c.winnerDetail ? ` · ${c.winnerDetail}` : ""}`
                  : "Not won on the day"}
              </div>
              {c.faced.measured ? (
                <div style={{ display: "flex", fontSize: 21, marginTop: 8, color: STONE }}>
                  {c.faced.value} players played that hole
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", flex: 1 }} />
    </Page>
  );
}

/* ------------------------------------------------------------------ *
 * Page three: the result, and who played
 * ------------------------------------------------------------------ */

function ResultPage({ spec }: { spec: RecapSpec }) {
  const t = tone(spec.sponsor.accent);
  return (
    <Page spec={spec} foot={spec.url ?? "Prepared by the club"}>
      <Label color={t.onLight}>The result</Label>
      <div
        style={{
          fontFamily: "Fraunces",
          fontWeight: 600,
          fontSize: 56,
          marginTop: 16,
          color: NAVY,
        }}
      >
        {spec.winners.length ? "How it finished" : "The day"}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
        {spec.winners.map((w) => (
          <div
            key={w.position + w.name}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 26,
              borderTop: `1px solid ${BORDER}`,
              padding: "24px 0",
            }}
          >
            <div style={{ display: "flex", width: 60, fontFamily: "Fraunces", fontWeight: 600, fontSize: 34, color: t.onLight }}>
              {w.position}
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 34, color: NAVY }}>
                {w.name}
              </div>
              {w.detail ? (
                <div style={{ display: "flex", fontSize: 21, marginTop: 4, color: STONE }}>
                  {w.detail}
                </div>
              ) : null}
            </div>
            <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 600, fontSize: 34, color: NAVY }}>
              {w.score}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 46 }}>
        <Label color={t.onLight}>Who played</Label>
        {spec.participants.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 18, maxWidth: 1000 }}>
            {spec.participants.slice(0, 60).map((p) => (
              <div
                key={p.name}
                style={{
                  display: "flex",
                  borderRadius: 999,
                  backgroundColor: CARD,
                  border: `1px solid ${BORDER}`,
                  padding: "8px 18px",
                  fontSize: 20,
                  color: INK_SOFT,
                }}
              >
                {p.name}
                {p.company ? ` · ${p.company}` : ""}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 22, marginTop: 14, color: STONE, maxWidth: 900, lineHeight: 1.5 }}>
            No player agreed to be listed, so no names appear here.
          </div>
        )}
        <div
          style={{
            display: "flex",
            fontSize: 20,
            marginTop: 18,
            color: STONE,
            maxWidth: 940,
            lineHeight: 1.5,
          }}
        >
          {spec.participantsWithheld > 0
            ? `${spec.participantsWithheld} further ${
                spec.participantsWithheld === 1 ? "player" : "players"
              } played and did not agree to be listed, so they are not shown. Nobody's contact details or dietary notes are ever included.`
            : "Only players who agreed at registration are listed. Nobody's contact details or dietary notes are ever included."}
        </div>
      </div>

      <div style={{ display: "flex", flex: 1 }} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          backgroundColor: NAVY,
          borderRadius: 20,
          padding: "34px 38px",
        }}
      >
        <div style={{ fontFamily: "Fraunces", fontWeight: 600, fontSize: 40, color: CREAM }}>
          Thank you
        </div>
        <div style={{ display: "flex", fontSize: 23, marginTop: 12, color: "rgba(247,243,236,0.75)", maxWidth: 900, lineHeight: 1.55 }}>
          {spec.sponsor.name} backed {spec.event.title}
          {spec.raised ? ` in aid of ${spec.raised.beneficiary}` : ""}. The club
          is grateful, and so is everyone who played.
        </div>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ */

async function png(node: React.ReactElement) {
  const img = new ImageResponse(node, { width: W, height: H, fonts });
  return new Uint8Array(await img.arrayBuffer());
}

async function render(spec: RecapSpec) {
  /*
   * Each page is drawn to PNG and then embedded, rather than composed as
   * vector text. Satori's output is the same engine the poster and the
   * clubhouse screen use, so a club gets one visual language across all three,
   * and a PNG page is exactly what a sponsor's marketing team will lift into a
   * deck anyway.
   */
  const pages = [
    await png(<CoverPage spec={spec} />),
    await png(<FiguresPage spec={spec} />),
    await png(<ResultPage spec={spec} />),
  ];

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${spec.event.title} · ${spec.sponsor.name}`);
  pdf.setProducer("Shimo");
  pdf.setCreationDate(new Date(spec.generatedAt));
  for (const bytes of pages) {
    const img = await pdf.embedPng(bytes);
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return Buffer.from(await pdf.save());
}

export async function POST(req: Request) {
  try {
    const spec = (await req.json()) as RecapSpec;
    if (!spec?.sponsor?.name) return new Response("Bad spec", { status: 400 });

    const url = new URL(req.url);
    /* `?page=n` returns one page as a PNG, for the social assets the pack
       also has to produce. */
    const one = url.searchParams.get("page");
    if (one) {
      const idx = Number(one);
      const node =
        idx === 2 ? <FiguresPage spec={spec} /> : idx === 3 ? <ResultPage spec={spec} /> : <CoverPage spec={spec} />;
      const bytes = await png(node);
      return new Response(bytes, {
        headers: {
          "content-type": "image/png",
          "content-length": String(bytes.byteLength),
          "cache-control": "no-store",
        },
      });
    }

    const pdf = await render(spec);
    return new Response(pdf, {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(pdf.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("recap render failed", err);
    return new Response("Recap render failed", { status: 500 });
  }
}
