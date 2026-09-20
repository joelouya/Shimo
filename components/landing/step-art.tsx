"use client";

/**
 * The four step illustrations on the "How it works" cards, drawn in Shimo's
 * own vocabulary rather than borrowed from an icon set: a tee sheet, a phone
 * with a scorecard strip, a returned card with its seal, and the clubhouse
 * board. Each is a fragment of the product the step describes, kept flat and
 * quiet (paper, ink, sand, one clay mark, gold only on the seal) so the card
 * reads as a plate with something on it rather than a box with a symbol.
 *
 * All four share one 200x150 canvas so they sit identically on the cards.
 */

const INK = "var(--foreground)";
const SOFT = "var(--ink-soft)";
const STONE = "var(--stone)";
const SAND = "var(--sand)";
const BORDER = "var(--border)";
const PAPER = "var(--card)";
const CLAY = "var(--clay)";
const CLAY_WASH = "var(--clay-wash)";
const GOLD = "var(--gold)";
const GOLD_DEEP = "var(--gold-deep)";
const GOLD_WASH = "var(--gold-wash)";
const NAVY = "var(--broadcast-ink)";
const CREAM = "var(--cream)";

const font = { fontFamily: "Fraunces, Georgia, serif" } as const;
const sans = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" } as const;

function Canvas({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 200 150"
      className={className}
      aria-hidden="true"
      focusable="false"
      shapeRendering="geometricPrecision"
    >
      {children}
    </svg>
  );
}

/** 01: the tee sheet. Three groups going out, times down the left, a code
 *  and its QR on the right; the top row carries the clay mark. */
export function TeeSheetArt({ className }: { className?: string }) {
  const rows = [
    { t: "07:00", names: [78, 60, 70] },
    { t: "07:10", names: [64, 74, 56] },
    { t: "07:20", names: [72, 58, 66] },
  ];
  return (
    <Canvas className={className}>
      <rect x="4" y="6" width="192" height="138" rx="10" fill={PAPER} stroke={BORDER} />
      <text x="16" y="26" fontSize="7.5" letterSpacing="1.4" fill={STONE} style={sans}>
        TEE SHEET
      </text>
      <text x="184" y="26" fontSize="8" textAnchor="end" fill={STONE} style={{ ...font, fontStyle: "italic" }}>
        Round 1
      </text>
      <line x1="16" y1="33" x2="184" y2="33" stroke={BORDER} strokeDasharray="2 2" />
      {rows.map((r, i) => {
        const y = 44 + i * 33;
        const first = i === 0;
        return (
          <g key={r.t}>
            <text x="16" y={y + 9} fontSize="13" fill={first ? CLAY : INK} style={font}>
              {r.t}
            </text>
            {r.names.map((w, j) => (
              <rect
                key={j}
                x="58"
                y={y - 2 + j * 7}
                width={w}
                height="3.2"
                rx="1.6"
                fill={first && j === 0 ? INK : SAND}
              />
            ))}
            {/* the group's code */}
            <rect x="148" y={y - 3} width="36" height="14" rx="3" fill={first ? CLAY_WASH : SAND} />
            <text
              x="166"
              y={y + 7}
              fontSize="7.5"
              textAnchor="middle"
              letterSpacing="1.6"
              fill={first ? "var(--clay-deep)" : SOFT}
              style={sans}
            >
              {["K7QM", "R2XN", "M9HC"][i]}
            </text>
            {i < rows.length - 1 && (
              <line x1="16" y1={y + 24} x2="184" y2={y + 24} stroke={BORDER} />
            )}
          </g>
        );
      })}
    </Canvas>
  );
}

/** 02: the phone on the course. The hole strip across the top, the player's
 *  own row and the row they keep for a partner, one birdie circled. */
export function PhoneArt({ className }: { className?: string }) {
  const own = [4, 5, 3, 4, 5];
  const mark = [4, 5, 4, 4, null];
  const cell = (x: number, y: number, v: number | null, tone: "own" | "mark", i: number) => {
    const birdie = tone === "own" && i === 2;
    return (
      <g key={`${tone}${i}`}>
        <rect x={x} y={y} width="20" height="18" rx="4" fill={v == null ? "transparent" : tone === "own" ? PAPER : SAND} stroke={v == null ? BORDER : "transparent"} strokeDasharray={v == null ? "2 2" : undefined} />
        {birdie && <circle cx={x + 10} cy={y + 9} r="7.2" fill="none" stroke={CLAY} strokeWidth="1.2" />}
        {v != null && (
          <text x={x + 10} y={y + 13} fontSize="11" textAnchor="middle" fill={birdie ? "var(--clay-deep)" : INK} style={font}>
            {v}
          </text>
        )}
      </g>
    );
  };
  return (
    <Canvas className={className}>
      {/* the phone */}
      <rect x="40" y="2" width="120" height="146" rx="18" fill={INK} />
      <rect x="45" y="7" width="110" height="136" rx="14" fill={CREAM} />
      <rect x="84" y="11" width="32" height="4" rx="2" fill={INK} opacity="0.85" />
      {/* hole strip */}
      {[3, 4, 5, 6, 7].map((h, i) => (
        <g key={h}>
          <circle cx={62 + i * 19} cy="34" r="7" fill={i === 2 ? CLAY : i < 2 ? SAND : "transparent"} stroke={i > 2 ? BORDER : "transparent"} />
          <text x={62 + i * 19} y="37" fontSize="7.5" textAnchor="middle" fill={i === 2 ? CREAM : i < 2 ? SOFT : STONE} style={sans}>
            {h}
          </text>
        </g>
      ))}
      {/* your ball */}
      <text x="54" y="58" fontSize="6.5" letterSpacing="1.2" fill={STONE} style={sans}>
        YOUR BALL
      </text>
      {own.map((v, i) => cell(52 + i * 21, 63, v, "own", i))}
      {/* you mark */}
      <text x="54" y="100" fontSize="6.5" letterSpacing="1.2" fill={STONE} style={sans}>
        YOU MARK
      </text>
      {mark.map((v, i) => cell(52 + i * 21, 105, v, "mark", i))}
      <text x="54" y="136" fontSize="7" fill={SOFT} style={{ ...font, fontStyle: "italic" }}>
        matches your marker
      </text>
      <circle cx="146" cy="133" r="2.2" fill={CLAY} />
    </Canvas>
  );
}

/** 03: the returned card. Nine figures on paper, two signature lines each
 *  with its mark, and the gold seal pressed over the corner. */
export function SealedCardArt({ className }: { className?: string }) {
  const scores = [4, 5, 4, 3, 5, 4, 4, 2, 5];
  return (
    <Canvas className={className}>
      <g transform="rotate(-2 100 78)">
        <rect x="14" y="14" width="160" height="124" rx="6" fill={PAPER} stroke={BORDER} />
        <text x="26" y="32" fontSize="7" letterSpacing="1.4" fill={STONE} style={sans}>
          SCORECARD
        </text>
        <line x1="26" y1="38" x2="162" y2="38" stroke={BORDER} strokeDasharray="2 2" />
        {scores.map((s, i) => (
          <g key={i}>
            <text x={32 + i * 15} y="49" fontSize="6" textAnchor="middle" fill={STONE} style={sans}>
              {i + 1}
            </text>
            <text x={32 + i * 15} y="64" fontSize="11" textAnchor="middle" fill={INK} style={font}>
              {s}
            </text>
          </g>
        ))}
        <line x1="26" y1="74" x2="162" y2="74" stroke={BORDER} strokeDasharray="2 2" />
        {/* marker, then player */}
        <text x="26" y="90" fontSize="6.5" fill={STONE} style={sans}>
          Marker
        </text>
        <path d="M70 90 c6 -9 10 -2 15 -5 c5 -3 8 5 14 1" fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
        <line x1="66" y1="93" x2="120" y2="93" stroke={BORDER} />
        <text x="26" y="112" fontSize="6.5" fill={STONE} style={sans}>
          Player
        </text>
        <path d="M70 112 c4 -8 9 -4 13 -6 c6 -3 10 4 18 0" fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
        <line x1="66" y1="115" x2="120" y2="115" stroke={BORDER} />
        {/* the seal hash, in the same mono the returned card shows it in */}
        <text x="26" y="130" fontSize="6" fill={STONE} className="font-mono">
          sha256 · 9f3a…c41e
        </text>
      </g>
      {/* the seal, over the corner, gold */}
      <g transform="translate(150 104)">
        <circle r="24" fill={GOLD_WASH} stroke={GOLD} strokeWidth="1.5" />
        <circle r="19" fill="none" stroke={GOLD} strokeWidth="0.8" strokeDasharray="1.5 2" />
        <path d="M-8 1 l5 5 l11 -11" fill="none" stroke={GOLD_DEEP} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <text y="14" fontSize="4.6" textAnchor="middle" letterSpacing="1.2" fill={GOLD_DEEP} style={sans}>
          CERTIFIED
        </text>
      </g>
    </Canvas>
  );
}

/** 04: the clubhouse board. Navy, the live dot, four rows with the leader
 *  in clay, the figures aligned the way a board keeps them. */
export function BoardArt({ className }: { className?: string }) {
  const rows = [
    { pos: "1", w: 58, thru: "F", score: "-4" },
    { pos: "2", w: 50, thru: "17", score: "-2" },
    { pos: "3", w: 62, thru: "16", score: "-1" },
    { pos: "4", w: 46, thru: "18", score: "E" },
  ];
  return (
    <Canvas className={className}>
      <rect x="4" y="8" width="192" height="134" rx="10" fill={NAVY} />
      <circle cx="18" cy="24" r="2.5" fill={CLAY} />
      <text x="26" y="27" fontSize="7" letterSpacing="1.4" fill={CREAM} opacity="0.7" style={sans}>
        LIVE
      </text>
      <text x="184" y="27" fontSize="7" letterSpacing="1.2" textAnchor="end" fill={CREAM} opacity="0.5" style={sans}>
        THRU
      </text>
      <line x1="16" y1="34" x2="184" y2="34" stroke={CREAM} opacity="0.12" />
      {rows.map((r, i) => {
        const y = 52 + i * 24;
        const lead = i === 0;
        return (
          <g key={r.pos}>
            <text x="18" y={y} fontSize="12" fill={lead ? "var(--clay-lift)" : CREAM} opacity={lead ? 1 : 0.7} style={font}>
              {r.pos}
            </text>
            <rect x="34" y={y - 8} width={r.w} height="4" rx="2" fill={CREAM} opacity={lead ? 0.9 : 0.4} />
            <text x="150" y={y} fontSize="8" textAnchor="end" fill={CREAM} opacity="0.5" style={sans}>
              {r.thru}
            </text>
            <text x="184" y={y} fontSize="12" textAnchor="end" fill={lead ? "var(--clay-lift)" : CREAM} opacity={lead ? 1 : 0.8} style={font}>
              {r.score}
            </text>
            {i < rows.length - 1 && (
              <line x1="16" y1={y + 9} x2="184" y2={y + 9} stroke={CREAM} opacity="0.08" />
            )}
          </g>
        );
      })}
    </Canvas>
  );
}
