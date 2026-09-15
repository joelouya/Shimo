"use client";

/**
 * The last resort: the root layout itself failed, so this page brings its own
 * html and body and a little inline dress, because nothing else is left to
 * dress it. Same message as the ordinary error screen: the round is safe.
 */

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f3ec",
          color: "#1a2332",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: "48px 24px",
        }}
      >
        <div style={{ maxWidth: 360 }}>
          <p
            style={{
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#69655a",
            }}
          >
            Shimo could not load
          </p>
          <h1
            style={{
              fontFamily: "Fraunces, Georgia, serif",
              fontWeight: 400,
              fontSize: 30,
              lineHeight: 1.1,
              margin: "12px 0 0",
            }}
          >
            Your scores are safe on this device.
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.55, color: "#414b5e", marginTop: 12 }}>
            Everything entered so far is saved here. Reload to carry on; if it
            keeps happening, tell the desk and carry on with the paper card.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 28,
              height: 48,
              padding: "0 24px",
              borderRadius: 12,
              border: 0,
              background: "#b84a2e",
              color: "#f7f3ec",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: 28, fontSize: 11, color: "#69655a", fontFamily: "ui-monospace, monospace" }}>
              Ref {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
