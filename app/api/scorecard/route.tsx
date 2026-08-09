/**
 * Printable scorecards.
 *
 * A blank card per group, drawn to PNG with Satori and bound into one PDF with
 * pdf-lib, the same pipeline the poster and recap use - no headless browser, so
 * it runs on the serverless the rest of the app deploys to. The client builds
 * the ScorecardSpec from the store and POSTs it here; `?card=n` returns a single
 * card as a PNG for a quick preview.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PDFDocument } from "pdf-lib";

import { parTotals, type ScorecardSpec } from "@/lib/scorecard/spec";

export const runtime = "nodejs";

// A4 landscape at 150dpi, so the hole grid runs 1..18 across the page
const W = 1754;
const H = 1240;

const CREAM = "#f7f3ec";
const CARD = "#fcfaf5";
const NAVY = "#1a2332";
const INK_SOFT = "#414b5e";
const STONE = "#736d61";
const BORDER = "#d9d1bf";
const SHADE = "#efe9dc";
const CLAY = "#b84a2e";

const fontDir = join(process.cwd(), "assets", "fonts");
const fonts = [
  { name: "Fraunces", data: readFileSync(join(fontDir, "fraunces-600.ttf")), weight: 600 as const, style: "normal" as const },
  { name: "Inter", data: readFileSync(join(fontDir, "inter-400.ttf")), weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: readFileSync(join(fontDir, "inter-600.ttf")), weight: 600 as const, style: "normal" as const },
];

const LABEL_W = 320;
const CELL_W = 62;
const INFO_H = 44; // hole / yards / SI / par rows
const WRITE_MIN = 92; // a writing row's floor; it grows to fill the card

/* ------------------------------------------------------------------ */

function Cell({
  children,
  w = CELL_W,
  shaded,
  header,
  align = "center",
}: {
  children?: React.ReactNode;
  w?: number;
  shaded?: boolean;
  header?: boolean;
  align?: "center" | "flex-start";
}) {
  return (
    <div
      style={{
        display: "flex",
        width: w,
        // no fixed height: the cell stretches to its row, so writing rows can
        // grow to fill the card the way a real scorecard's do
        alignItems: "center",
        justifyContent: align,
        paddingLeft: align === "flex-start" ? 14 : 0,
        borderRight: `1px solid ${BORDER}`,
        borderBottom: `1px solid ${BORDER}`,
        background: shaded ? SHADE : "transparent",
        fontFamily: "Inter",
        fontWeight: header ? 600 : 400,
        fontSize: header ? 19 : 22,
        color: header ? INK_SOFT : NAVY,
      }}
    >
      {children}
    </div>
  );
}

/** One grid row: a label cell, holes 1-9, OUT, holes 10-18, IN, TOT. */
function Row({
  label,
  front,
  back,
  out,
  inn,
  tot,
  header,
  write,
}: {
  label: React.ReactNode;
  front: (React.ReactNode | undefined)[];
  back: (React.ReactNode | undefined)[];
  out?: React.ReactNode;
  inn?: React.ReactNode;
  tot?: React.ReactNode;
  header?: boolean;
  /** a player's writing row: grows to fill the card and floors at WRITE_MIN */
  write?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        ...(write
          ? { flexGrow: 1, flexBasis: 0, minHeight: WRITE_MIN }
          : { height: INFO_H }),
      }}
    >
      <Cell w={LABEL_W} shaded={header} header={header} align="flex-start">
        {label}
      </Cell>
      {front.map((c, i) => (
        <Cell key={`f${i}`} shaded={header} header={header}>{c}</Cell>
      ))}
      <Cell shaded header>{out}</Cell>
      {back.map((c, i) => (
        <Cell key={`b${i}`} shaded={header} header={header}>{c}</Cell>
      ))}
      <Cell shaded header>{inn}</Cell>
      <Cell shaded header>{tot}</Cell>
    </div>
  );
}

function Card({ spec, cardIndex }: { spec: ScorecardSpec; cardIndex: number }) {
  const card = spec.cards[cardIndex];
  const holes = spec.holes;
  const front = holes.slice(0, 9);
  const back = holes.slice(9, 18);
  const par = parTotals(holes);
  const nums = (a: typeof holes, f: (h: (typeof holes)[number]) => React.ReactNode) => a.map(f);
  const empty = Array.from({ length: 9 }, () => "");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: W,
        height: H,
        background: CREAM,
        padding: 48,
        fontFamily: "Inter",
      }}
    >
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 19, letterSpacing: 2, textTransform: "uppercase", color: STONE }}>
            {spec.event.club}
          </div>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 600, fontSize: 40, color: NAVY, marginTop: 5 }}>
            {spec.event.title}
          </div>
          <div style={{ display: "flex", fontSize: 21, color: INK_SOFT, marginTop: 5 }}>
            {spec.event.course} · {spec.event.tees} tees · {spec.event.date}
          </div>
        </div>
        {card.qr ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={card.qr} width={132} height={132} alt="" />
            {card.code ? (
              <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 22, letterSpacing: 3, color: NAVY, marginTop: 4 }}>
                {card.code}
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: 15, color: STONE, marginTop: 2 }}>
              Scan to score
            </div>
          </div>
        ) : null}
      </div>

      {/* the group / team band */}
      <div
        style={{
          display: "flex",
          marginTop: 20,
          padding: "10px 16px",
          background: NAVY,
          color: CREAM,
          fontFamily: "Fraunces",
          fontWeight: 600,
          fontSize: 26,
        }}
      >
        {card.label}
      </div>

      {/* the grid - flex:1 so the writing rows grow to fill the card */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: 14, borderTop: `1px solid ${BORDER}`, borderLeft: `1px solid ${BORDER}` }}>
        <Row header label="Hole"
          front={nums(front, (h) => h.n)} back={nums(back, (h) => h.n)}
          out="OUT" inn="IN" tot="TOT" />
        <Row header label="Yards"
          front={nums(front, (h) => h.yards || "")} back={nums(back, (h) => h.yards || "")}
          out="" inn="" tot="" />
        <Row header label="Stroke index"
          front={nums(front, (h) => h.si)} back={nums(back, (h) => h.si)}
          out="" inn="" tot="" />
        <Row header label="Par"
          front={nums(front, (h) => h.par)} back={nums(back, (h) => h.par)}
          out={par.out} inn={par.in} tot={par.tot} />
        {card.entrants.map((e, i) => (
          <Row
            key={i}
            write
            label={
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 22, fontWeight: 600, color: NAVY }}>{e.name}</div>
                {e.hcp != null ? (
                  <div style={{ display: "flex", fontSize: 15, color: STONE }}>CH {e.hcp}</div>
                ) : null}
              </div>
            }
            front={empty}
            back={empty}
            out=""
            inn=""
            tot=""
          />
        ))}
      </div>

      {/* signatures */}
      <div style={{ display: "flex", gap: 40, marginTop: 18 }}>
        {["Scorer", "Marker", "Date"].map((s) => (
          <div key={s} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", height: 40, borderBottom: `1px solid ${STONE}` }} />
            <div style={{ display: "flex", fontSize: 15, color: STONE, marginTop: 6 }}>{s}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", fontSize: 15, color: STONE, marginTop: 10 }}>
        {card.link ? `${card.link} · ` : ""}Shimo
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

async function png(node: React.ReactElement) {
  const img = new ImageResponse(node, { width: W, height: H, fonts });
  return new Uint8Array(await img.arrayBuffer());
}

async function render(spec: ScorecardSpec) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${spec.event.title} · scorecards`);
  pdf.setProducer("Shimo");
  for (let i = 0; i < spec.cards.length; i++) {
    const bytes = await png(<Card spec={spec} cardIndex={i} />);
    const img = await pdf.embedPng(bytes);
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return Buffer.from(await pdf.save());
}

export async function POST(req: Request) {
  try {
    const spec = (await req.json()) as ScorecardSpec;
    if (!spec?.holes?.length || !spec?.cards?.length) {
      return new Response("Bad spec", { status: 400 });
    }
    const url = new URL(req.url);
    const one = url.searchParams.get("card");
    if (one != null) {
      const idx = Math.max(0, Math.min(spec.cards.length - 1, Number(one) || 0));
      const bytes = await png(<Card spec={spec} cardIndex={idx} />);
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
    console.error("scorecard render failed", err);
    return new Response("Scorecard render failed", { status: 500 });
  }
}
