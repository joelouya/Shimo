/**
 * WCAG contrast, used to keep a club's accent colour legible.
 *
 * A club picks one brand colour and it lands on buttons and highlights across
 * the surfaces that belong to them. Shimo's own two backgrounds never change,
 * so the accent has to work on both the cream field and the navy panels.
 *
 * Demanding that a single colour clear AA on both is close to impossible:
 * cream and navy sit at opposite ends, leaving a very narrow band in the
 * middle. Shimo's own terracotta only just clears navy at 3.0:1, and ordinary
 * club colours (a deep green, a mid blue) fail outright. Rejecting those would
 * make the feature useless.
 *
 * So the club's colour is judged where it is read most, the cream field, and
 * the dark-surface tone is derived by lightening until it clears. Same result
 * for legibility, without refusing colours a club is entitled to use.
 */

/** Shimo's two fixed backgrounds. */
export const CREAM = "#F7F3EC";
export const NAVY = "#1A2332";

/** WCAG AA for normal text and UI. */
export const AA_TEXT = 4.5;
/** WCAG AA for large text and solid fills. */
export const AA_LARGE = 3;

/* ------------------------------------------------------------------ */
/* Colour maths                                                        */
/* ------------------------------------------------------------------ */

export function normalizeHex(input: string): string | null {
  const v = (input ?? "").trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(v))
    return "#" + v.split("").map((c) => c + c).join("").toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(v)) return "#" + v.toLowerCase();
  return null;
}

function toRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** RGB to HSL, so a shade can be adjusted without losing the hue. */
function rgbToHsl(hex: string): [number, number, number] {
  const [r0, g0, b0] = toRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r0, g0, b0);
  const min = Math.min(r0, g0, b0);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r0) h = ((g0 - b0) / d + (g0 < b0 ? 6 : 0)) / 6;
  else if (max === g0) h = ((b0 - r0) / d + 2) / 6;
  else h = ((r0 - g0) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  if (s === 0) return toHex(l * 255, l * 255, l * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return toHex(f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255);
}

export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------------ */
/* Derived tones                                                       */
/* ------------------------------------------------------------------ */

/**
 * The same colour, darkened just enough to be readable on cream. Hue and
 * saturation are kept, so it still reads as the club's colour.
 */
export function accentOnLight(hex: string, target = AA_TEXT): string {
  const [h, s] = rgbToHsl(hex);
  let [, , l] = rgbToHsl(hex);
  let out = hslToHex(h, s, l);
  for (let i = 0; i < 100 && contrastRatio(out, CREAM) < target; i++) {
    l = Math.max(0, l - 0.01);
    out = hslToHex(h, s, l);
  }
  return out;
}

/**
 * The same colour, lightened just enough to sit on the navy panels. This is
 * why a club is never refused for picking something dark.
 */
export function accentOnDark(hex: string, target = AA_LARGE): string {
  const [h, s] = rgbToHsl(hex);
  let [, , l] = rgbToHsl(hex);
  let out = hslToHex(h, s, l);
  for (let i = 0; i < 100 && contrastRatio(out, NAVY) < target; i++) {
    l = Math.min(1, l + 0.01);
    out = hslToHex(h, s, l);
  }
  return out;
}

/** Whether white or navy text is more legible on a solid fill of this colour. */
export function textOnAccent(hex: string): "#ffffff" | typeof NAVY {
  return contrastRatio(hex, "#ffffff") >= contrastRatio(hex, NAVY)
    ? "#ffffff"
    : NAVY;
}

/* ------------------------------------------------------------------ */
/* The check the admin sees                                            */
/* ------------------------------------------------------------------ */

export interface AccentCheck {
  ok: boolean;
  hex: string | null;
  /** the tone actually used on cream surfaces */
  onLight: string;
  /** the tone actually used on navy surfaces */
  onDark: string;
  /** text colour for a solid button in this accent */
  onAccentText: string;
  ratioOnCream: number;
  ratioOnNavy: number;
  /** set when the colour was refused */
  reason?: string;
  /** a nearby shade that would pass, offered as a one-tap fix */
  suggestion?: string;
}

/**
 * Judge a candidate accent.
 *
 * Refused only when the colour cannot be read on the cream field even after
 * darkening, which in practice means something with almost no depth to it at
 * all. Everything else is accepted, with the dark-surface tone derived.
 */
export function checkAccent(input: string): AccentCheck {
  const hex = normalizeHex(input);
  if (!hex) {
    return {
      ok: false,
      hex: null,
      onLight: DEFAULT_ACCENT,
      onDark: DEFAULT_ACCENT,
      onAccentText: "#ffffff",
      ratioOnCream: 0,
      ratioOnNavy: 0,
      reason: "That isn't a colour Shimo can read. Use a hex value like #B84A2E.",
    };
  }

  const ratioOnCream = contrastRatio(hex, CREAM);
  const ratioOnNavy = contrastRatio(hex, NAVY);
  const onLight = accentOnLight(hex);
  const onDark = accentOnDark(hex);
  const round = (n: number) => Math.round(n * 10) / 10;

  // As given, is it readable on the cream field? That is where members read
  // the most, and where a washed-out colour fails in sunlight.
  if (ratioOnCream < AA_TEXT) {
    const passes = contrastRatio(onLight, CREAM) >= AA_TEXT;
    return {
      ok: false,
      hex,
      onLight,
      onDark,
      onAccentText: textOnAccent(hex),
      ratioOnCream,
      ratioOnNavy,
      reason: `On the cream background this is ${round(ratioOnCream)}:1, under the ${AA_TEXT}:1 WCAG AA asks for. Members would struggle to read it in sunlight.`,
      suggestion: passes ? onLight : undefined,
    };
  }

  return {
    ok: true,
    hex,
    onLight,
    onDark,
    onAccentText: textOnAccent(hex),
    ratioOnCream,
    ratioOnNavy,
  };
}

/** Shimo's own terracotta, the fallback when a club has not chosen one. */
export const DEFAULT_ACCENT = "#b84a2e";
