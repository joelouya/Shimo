"use client";

/**
 * The signature artifact, three ways (all valid under Kenya's KICA and
 * R&A 3.3b's "means to certify"):
 *  - PIN (default): 4 digits, set on first use, no permissions needed
 *  - finger-drawn signature: captured as SVG path, stored with the record
 *  - biometric: WebAuthn platform authenticator, entirely on-device
 */

import { useEffect, useRef, useState } from "react";
import { Check, Delete, Fingerprint, PenLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  setUserPin,
  useSim,
  type SignatureArtifact,
  type SignMethod,
} from "@/lib/sim/store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */

async function tryBiometric(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    const available =
      await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (!available) return false;
    await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(16)),
        rp: { name: "Shimo" },
        user: {
          id: crypto.getRandomValues(new Uint8Array(8)),
          name: "shimo-golfer",
          displayName: "Shimo golfer",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        timeout: 30000,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */

function PinPad({
  onDone,
  actionLabel,
}: {
  onDone: () => void;
  actionLabel: string;
}) {
  const storedPin = useSim((s) => s.userPin);
  const [entry, setEntry] = useState("");
  const [firstPass, setFirstPass] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settingUp = !storedPin;
  const prompt = settingUp
    ? firstPass
      ? "Confirm your new PIN"
      : "Set a 4-digit PIN for signing cards"
    : `Enter your PIN to ${actionLabel}`;

  const press = (d: string) => {
    setError(null);
    const next = (entry + d).slice(0, 4);
    setEntry(next);
    if (next.length < 4) return;
    setTimeout(() => {
      if (settingUp) {
        if (!firstPass) {
          setFirstPass(next);
          setEntry("");
        } else if (firstPass === next) {
          setUserPin(next);
          onDone();
        } else {
          setError("PINs didn't match. Start again.");
          setFirstPass(null);
          setEntry("");
        }
      } else if (next === storedPin) {
        onDone();
      } else {
        setError("Wrong PIN. Try again.");
        setEntry("");
      }
    }, 150);
  };

  return (
    <div>
      <p className="text-center text-[15px] text-ink-soft">{prompt}</p>
      <div className="mt-4 flex justify-center gap-3">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full border-2 transition-colors",
              entry.length > i ? "border-clay bg-clay" : "border-border",
            )}
          />
        ))}
      </div>
      {error && (
        <p className="mt-2 text-center text-[13px] text-red-flag">{error}</p>
      )}
      <div className="mx-auto mt-5 grid w-56 grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map(
          (k, i) =>
            k === "" ? (
              <span key={i} />
            ) : (
              <button
                key={i}
                onClick={() =>
                  k === "⌫" ? setEntry((e) => e.slice(0, -1)) : press(k)
                }
                className="flex h-13 min-h-11 items-center justify-center rounded-xl bg-secondary/70 text-[19px] font-medium text-foreground tnum transition-colors hover:bg-secondary cursor-pointer"
              >
                {k === "⌫" ? <Delete className="size-5" /> : k}
              </button>
            ),
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DrawPad({ onDone }: { onDone: (svg: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathRef = useRef<string[]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const scale = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * scale;
    c.height = c.offsetHeight * scale;
    const x = c.getContext("2d")!;
    x.scale(scale, scale);
    x.strokeStyle = "#1A2332";
    x.lineWidth = 2.2;
    x.lineCap = "round";
    x.lineJoin = "round";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <p className="text-center text-[15px] text-ink-soft">
        Sign with your finger, as you would the paper card
      </p>
      <canvas
        ref={canvasRef}
        className="mt-4 h-32 w-full touch-none rounded-xl border border-dashed border-border bg-card"
        onPointerDown={(e) => {
          drawing.current = true;
          canvasRef.current?.setPointerCapture(e.pointerId);
          const p = pos(e);
          const x = canvasRef.current!.getContext("2d")!;
          x.beginPath();
          x.moveTo(p.x, p.y);
          pathRef.current.push(`M${p.x.toFixed(1)},${p.y.toFixed(1)}`);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = pos(e);
          const x = canvasRef.current!.getContext("2d")!;
          x.lineTo(p.x, p.y);
          x.stroke();
          pathRef.current.push(`L${p.x.toFixed(1)},${p.y.toFixed(1)}`);
          if (pathRef.current.length > 12) setHasInk(true);
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
      />
      <div className="mt-3 flex gap-2">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={() => {
            const c = canvasRef.current!;
            c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
            pathRef.current = [];
            setHasInk(false);
          }}
        >
          Clear
        </Button>
        <Button
          variant="clay"
          className="flex-1"
          disabled={!hasInk}
          onClick={() => onDone(pathRef.current.join(" "))}
        >
          <Check className="size-4" />
          Use this signature
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function SignatureCapture({
  actionLabel,
  onSign,
}: {
  /** e.g. "attest David's card" / "certify your card" */
  actionLabel: string;
  onSign: (artifact: SignatureArtifact) => void;
}) {
  const pref = useSim((s) => s.signMethod);
  const [method, setMethod] = useState<SignMethod>(
    pref === "committee" ? "pin" : pref,
  );
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState(false);

  return (
    <div>
      <div className="mx-auto flex w-fit rounded-full bg-secondary p-1">
        {(
          [
            { m: "pin", label: "PIN" },
            { m: "signature", label: "Signature" },
            { m: "biometric", label: "Biometric" },
          ] as const
        ).map(({ m, label }) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={cn(
              "min-h-10 rounded-full px-4 text-[13px] font-medium transition-colors cursor-pointer",
              method === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {method === "pin" && (
          <PinPad
            actionLabel={actionLabel}
            onDone={() => onSign({ method: "pin" })}
          />
        )}
        {method === "signature" && (
          <DrawPad onDone={(svg) => onSign({ method: "signature", svg })} />
        )}
        {method === "biometric" && (
          <div className="text-center">
            <p className="text-[15px] text-ink-soft">
              Face ID or fingerprint, handled entirely on this device. Nothing
              is transmitted.
            </p>
            <Button
              variant="clay"
              size="lg"
              className="mt-5"
              disabled={bioBusy}
              onClick={async () => {
                setBioBusy(true);
                setBioError(false);
                const ok = await tryBiometric();
                setBioBusy(false);
                if (ok) onSign({ method: "biometric" });
                else setBioError(true);
              }}
            >
              <Fingerprint className="size-5" />
              {bioBusy ? "Waiting for device…" : `Use biometric to ${actionLabel}`}
            </Button>
            {bioError && (
              <p className="mt-3 text-[13px] text-muted-foreground">
                Biometrics aren&apos;t available on this device. Use your PIN
                or a finger-drawn signature instead.
              </p>
            )}
          </div>
        )}
      </div>
      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted-foreground">
        <PenLine className="size-3" />
        Legally valid under KICA · satisfies R&A Rule 3.3b
      </p>
    </div>
  );
}
