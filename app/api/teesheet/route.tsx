/**
 * Printable tee sheet.
 *
 * The tournament-day sheet: one page of groups, each with its tee time, its
 * players and its own QR and code, drawn to PNG with Satori and bound into a
 * PDF with pdf-lib - the same pipeline the scorecard, poster and recap use, so
 * it runs on serverless with no headless browser. The client builds the
 * TeeSheetSpec from the store, draws a QR per group, and POSTs it here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PDFDocument } from "pdf-lib";

import type { TeeSheetSpec, TeeSheetRow } from "@/lib/teesheet/spec";

export const runtime = "nodejs";

// A4 portrait at 150dpi
const W = 1240;
const H = 1754;

const CREAM = "#f7f3ec";
const NAVY = "#1a2332";
const INK_SOFT = "#414b5e";
const STONE = "#736d61";
const BORDER = "#d9d1bf";
const SHADE = "#efe9dc";

const PAD = 64;
const ROWS_PER_PAGE = 11;

const fontDir = join(process.cwd(), "assets", "fonts");
const fonts = [
  { name: "Fraunces", data: readFileSync(join(fontDir, "fraunces-600.ttf")), weight: 600 as const, style: "normal" as const },
  { name: "Inter", data: readFileSync(join(fontDir, "inter-400.ttf")), weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: readFileSync(join(fontDir, "inter-600.ttf")), weight: 600 as const, style: "normal" as const },
];

/* ------------------------------------------------------------------ */

function GroupRow({ row }: { row: TeeSheetRow }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        borderBottom: `1px solid ${BORDER}`,
        paddingTop: 18,
        paddingBottom: 18,
        minHeight: 118,
      }}
    >
      {/* tee time + group number */}
      <div style={{ display: "flex", flexDirection: "column", width: 168 }}>
        <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 600, fontSize: 34, color: NAVY }}>
          {row.teeTime || "-"}
        </div>
        <div style={{ display: "flex", fontSize: 17, color: STONE, marginTop: 3 }}>
          Group {row.number}
        </div>
      </div>

      {/* players */}
      <div style={{ display: "flex", flex: 1, flexWrap: "wrap", paddingRight: 24 }}>
        {row.players.map((p, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              fontSize: 23,
              color: INK_SOFT,
              width: "50%",
              paddingBottom: 4,
            }}
          >
            {p}
          </div>
        ))}
      </div>

      {/* QR + code */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 132 }}>
        {row.qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.qr} width={98} height={98} alt="" />
        ) : (
          <div style={{ display: "flex", width: 98, height: 98 }} />
        )}
        {row.code ? (
          <div
            style={{
              display: "flex",
              fontFamily: "Inter",
              fontWeight: 600,
              fontSize: 24,
              letterSpacing: 3,
              color: NAVY,
              marginTop: 6,
            }}
          >
            {row.code}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Page({
  spec,
  rows,
  page,
  pages,
}: {
  spec: TeeSheetSpec;
  rows: TeeSheetRow[];
  page: number;
  pages: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: W,
        height: H,
        background: CREAM,
        padding: PAD,
        fontFamily: "Inter",
      }}
    >
      {/* header, on every page so a loose sheet still reads */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 19, letterSpacing: 2, textTransform: "uppercase", color: STONE }}>
            {spec.event.club}
          </div>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 600, fontSize: 48, color: NAVY, marginTop: 6 }}>
            {spec.event.title}
          </div>
          <div style={{ display: "flex", fontSize: 22, color: INK_SOFT, marginTop: 6 }}>
            {spec.event.course} · {spec.event.date}
            {spec.event.round ? ` · ${spec.event.round}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: 260 }}>
          <div style={{ display: "flex", fontFamily: "Fraunces", fontWeight: 600, fontSize: 26, color: NAVY }}>
            Tee sheet
          </div>
          <div style={{ display: "flex", fontSize: 16, color: STONE, marginTop: 4, textAlign: "right" }}>
            Scan your group to score
          </div>
        </div>
      </div>

      {/* column heads */}
      <div
        style={{
          display: "flex",
          marginTop: 26,
          paddingBottom: 10,
          borderBottom: `2px solid ${NAVY}`,
          fontFamily: "Inter",
          fontWeight: 600,
          fontSize: 15,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: STONE,
        }}
      >
        <div style={{ display: "flex", width: 168 }}>Tee</div>
        <div style={{ display: "flex", flex: 1 }}>Players</div>
        <div style={{ display: "flex", width: 132, justifyContent: "center" }}>Scan</div>
      </div>

      {/* rows */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <GroupRow key={`${r.number}-${r.code}`} row={r} />
        ))}
      </div>

      {/* footer */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 15, color: STONE }}>
        <div style={{ display: "flex" }}>
          The code opens your group only. Members sign in, guests use their
          registration code.
        </div>
        <div style={{ display: "flex" }}>
          {pages > 1 ? `${page} / ${pages} · ` : ""}Shimo
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

async function png(node: React.ReactElement) {
  const img = new ImageResponse(node, { width: W, height: H, fonts });
  return new Uint8Array(await img.arrayBuffer());
}

function paginate(rows: TeeSheetRow[]): TeeSheetRow[][] {
  if (!rows.length) return [[]];
  const out: TeeSheetRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
    out.push(rows.slice(i, i + ROWS_PER_PAGE));
  }
  return out;
}

async function render(spec: TeeSheetSpec) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${spec.event.title} · tee sheet`);
  pdf.setProducer("Shimo");
  const chunks = paginate(spec.rows);
  for (let i = 0; i < chunks.length; i++) {
    const bytes = await png(
      <Page spec={spec} rows={chunks[i]} page={i + 1} pages={chunks.length} />,
    );
    const img = await pdf.embedPng(bytes);
    const page = pdf.addPage([W, H]);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return Buffer.from(await pdf.save());
}

export async function POST(req: Request) {
  try {
    const spec = (await req.json()) as TeeSheetSpec;
    if (!spec?.rows) {
      return new Response("Bad spec", { status: 400 });
    }
    const url = new URL(req.url);
    const one = url.searchParams.get("page");
    if (one != null) {
      const chunks = paginate(spec.rows);
      const idx = Math.max(0, Math.min(chunks.length - 1, Number(one) || 0));
      const bytes = await png(
        <Page spec={spec} rows={chunks[idx]} page={idx + 1} pages={chunks.length} />,
      );
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
    console.error("tee sheet render failed", err);
    return new Response("Tee sheet render failed", { status: 500 });
  }
}
