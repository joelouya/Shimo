"use client";

/**
 * A QR code, drawn in the system's own ink.
 *
 * This exists because of one moment: 07:00 on a corporate day, a hundred and
 * twenty people on a first tee, half of whom registered six weeks ago and
 * cannot find the email. Typing a six-character code with one thumb while
 * holding a driver is a worse experience than pointing a camera at a card the
 * starter is holding, and the difference across a field of that size is the
 * caddymaster's whole morning.
 *
 * Rendered as an SVG rather than a canvas so it stays sharp when a club prints
 * it at A4 and props it on the first tee, which is what they will do.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { cn } from "@/lib/utils";

export function QrCode({
  value,
  size = 160,
  className,
  label,
}: {
  /**
   * What to encode. A path is resolved against the current origin here rather
   * than by the caller: a camera has no notion of origin, and every caller
   * otherwise ends up keeping window.location in state purely to build a
   * string this component is about to consume.
   */
  value: string;
  size?: number;
  className?: string;
  /** what a screen reader should say, since a QR is meaningless to one */
  label?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const absolute = /^https?:\/\//.test(value)
      ? value
      : `${window.location.origin}${value.startsWith("/") ? "" : "/"}${value}`;
    QRCode.toString(absolute, {
      type: "svg",
      margin: 1,
      /*
       * Medium correction. A clubhouse print gets thumbed, rained on and
       * propped against a bucket of range balls, and the payload here is short
       * enough that the extra redundancy costs no meaningful density.
       */
      errorCorrectionLevel: "M",
      color: {
        /* Ink, not black. The No-Black Rule holds here too, and scanners care
           about contrast rather than hue. */
        dark: "#1a2332ff",
        light: "#fcfaf5ff",
      },
      width: size,
    })
      .then((out) => live && setSvg(out))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value, size]);

  return (
    <div
      role="img"
      aria-label={label ?? "QR code"}
      className={cn(
        "overflow-hidden rounded-xl bg-card p-2 shadow-card [&_svg]:block [&_svg]:h-auto [&_svg]:w-full",
        className,
      )}
      style={{ width: size, height: size }}
      // qrcode returns a complete SVG document; there is no user input in it
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
