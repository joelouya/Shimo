"use client";

/**
 * Claiming a membership.
 *
 * The one screen that turns an invitation into a member. It is reached from a
 * link the club sent by email or pasted into WhatsApp, so it has to work for
 * someone who has never seen Shimo, is standing outside the pro shop, and has
 * one hand free.
 *
 * Two things it deliberately does not do. It does not ask for a password,
 * because the club has already vouched for this person by putting them on the
 * roster and sending the link. And it does not explain why a bad token failed:
 * "already used" would tell a stranger the token was real.
 */

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import { Logo } from "@/components/logo";
import { SimGate } from "@/components/sim-gate";
import { Button } from "@/components/ui/button";
import { clubById } from "@/lib/data";
import { activateInvite, setDeviceIdentity, useSim } from "@/lib/sim/store";
import { initials } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-6 pb-10 pt-[max(env(safe-area-inset-top),24px)]">
      <div className="py-4">
        <Logo className="text-[17px]" />
      </div>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
    </div>
  );
}

function Claim({ token }: { token: string }) {
  const router = useRouter();
  const still = useReducedMotion();
  const roster = useSim((s) => s.roster);
  const [claimed, setClaimed] = useState(false);

  /*
   * Resolve the token against the roster we already hold. The row is looked up
   * for display only; activateInvite re-checks it at the moment of writing, so
   * a link opened twice on two devices cannot claim twice.
   */
  const member = useMemo(
    () => roster.find((p) => p.invite?.token === token),
    [roster, token],
  );
  const claimable = Boolean(member && !member.invite?.activatedAt && member.active !== false);

  if (!claimable && !claimed) {
    return (
      <Frame>
        <h1 className="font-serif text-[30px] leading-tight text-foreground">
          This link is not usable
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          It may have already been used, or the club may have issued a newer
          one. Ask the club to send you a fresh invitation and open that.
        </p>
        <div className="mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link href="/app">Go to Shimo</Link>
          </Button>
        </div>
      </Frame>
    );
  }

  const club = member ? clubById(member.clubId) : null;

  return (
    <Frame>
      <motion.div
        initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <p className="smallcaps text-muted-foreground">
          {club?.name ?? "Your club"}
        </p>
        <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
          {claimed ? "You're in" : "Claim your place"}
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          {claimed
            ? "Your membership is active on this device. Your card, your place on the board and your certification are all yours now."
            : "The club has kept a place for you on the roster. Check this is you, and it is yours."}
        </p>
      </motion.div>

      {member && (
        <motion.div
          initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
          className="mt-7 flex items-center gap-4 rounded-2xl bg-card p-5 shadow-card"
        >
          <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary font-serif text-lg text-primary-foreground">
            {initials(member.name)}
          </div>
          <div className="min-w-0">
            <p className="font-serif text-[19px] leading-tight text-foreground">
              {member.name}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {club?.name}
              {member.memberNo ? ` · ${member.memberNo}` : ""} · HC{" "}
              <span className="tnum">{member.handicap}</span>
            </p>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE, delay: 0.16 }}
        className="mt-8"
      >
        {claimed ? (
          <Button
            variant="clay"
            size="lg"
            className="w-full"
            onClick={() => router.push("/app")}
          >
            Open Shimo
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <>
            <Button
              variant="clay"
              size="lg"
              className="w-full"
              onClick={() => {
                if (!member) return;
                const ok = activateInvite(token, member.email);
                if (!ok) return;
                // The club vouched for this person; this device is now them.
                setDeviceIdentity(member.id);
                setClaimed(true);
              }}
            >
              <Check className="size-4" />
              Yes, this is me
            </Button>
            <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
              Not you? Do not use this link. Tell the club so they can send it
              to the right person.
            </p>
          </>
        )}
      </motion.div>
    </Frame>
  );
}

export default function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return (
    <SimGate
      fallback={
        <Frame>
          <Logo className="text-3xl opacity-40" />
        </Frame>
      }
    >
      <Claim token={token} />
    </SimGate>
  );
}
