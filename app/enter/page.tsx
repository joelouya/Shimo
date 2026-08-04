"use client";

/**
 * A guest opening their scorecard with the code from their registration.
 *
 * This is the guest equivalent of signing in, and it is deliberately not
 * signing in. There is no account, no password and no email round-trip: a
 * corporate day starts at 07:00 with a hundred people who registered weeks ago
 * on a form they have forgotten, and any flow requiring them to find an email
 * on the first tee is a flow the caddymaster ends up doing by hand.
 *
 * What the code is worth is bounded on purpose. It opens one scorecard in one
 * tournament. It is not a password, it cannot reach a different event, and it
 * grants nothing after the day.
 */

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Logo } from "@/components/logo";
import { SimGate } from "@/components/sim-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normaliseCode } from "@/lib/guests";
import { guestForCode, setDeviceIdentity, simStore } from "@/lib/sim/store";

const EASE = [0.23, 1, 0.32, 1] as const;

function Enter() {
  const router = useRouter();
  const params = useSearchParams();
  const still = useReducedMotion();
  /*
   * A code can arrive in the URL, which is what the QR on a registration
   * carries. Someone who scanned a card at the first tee should not then be
   * asked to type the thing they just scanned.
   */
  const fromLink = params.get("code") ?? "";
  const [code, setCode] = useState(fromLink);
  const [failed, setFailed] = useState(false);
  /* A ref, not state: this only records that the one automatic attempt has
     been made, and writing state inside the effect that reads it is how you
     get cascading renders. */
  const tried = useRef(false);

  const submit = useCallback(
    (raw: string) => {
      const found = guestForCode(simStore.getState(), raw);
      if (!found) {
        setFailed(true);
        return;
      }
      // The code is proof enough for the one thing it opens.
      setDeviceIdentity(found.player.id);
      router.push("/app/live");
    },
    [router],
  );

  /*
   * Open it straight away when the code came from a link, but only once. A
   * code that does not resolve falls back to the form with the value filled
   * in, so a mistyped forward is fixable rather than a dead end.
   */
  useEffect(() => {
    if (tried.current || !fromLink) return;
    tried.current = true;
    submit(fromLink);
  }, [fromLink, submit]);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-12 pt-[max(env(safe-area-inset-top),24px)]">
      <div className="py-4">
        <Logo className="text-[17px]" />
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <p className="smallcaps text-muted-foreground">Guest</p>
          <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
            Open your scorecard
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
            Use the code from your registration. Six characters, and it works on
            any phone.
          </p>
        </motion.div>

        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
          className="mt-8 space-y-2"
        >
          <Label htmlFor="guest-code">Your code</Label>
          <Input
            id="guest-code"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            value={code}
            placeholder="abc-123"
            onChange={(e) => {
              setCode(e.target.value);
              setFailed(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit(code)}
            aria-invalid={failed}
            className="h-14 text-center font-serif text-[30px] tracking-[0.2em] tnum"
          />
          {failed && (
            <p className="text-[13px] leading-relaxed text-red-flag">
              That code did not open anything. Check it against your
              registration, or ask the desk.
            </p>
          )}
        </motion.div>

        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.16 }}
          className="mt-6"
        >
          <Button
            variant="clay"
            size="lg"
            className="w-full"
            disabled={normaliseCode(code).length !== 7}
            onClick={() => submit(code)}
          >
            Open my card
            <ArrowRight className="size-4" />
          </Button>
          <Link
            href="/app"
            className="mt-5 block text-center text-[13px] text-muted-foreground underline-offset-4 hover:underline"
          >
            I am a club member
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Logo className="text-3xl opacity-40" />
    </div>
  );
}

export default function EnterPage() {
  return (
    <SimGate fallback={<Loading />}>
      {/* useSearchParams needs a boundary, and a scanned link is exactly the
          case that arrives with one. */}
      <Suspense fallback={<Loading />}>
        <Enter />
      </Suspense>
    </SimGate>
  );
}
