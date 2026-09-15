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

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check } from "lucide-react";

import { Logo } from "@/components/logo";
import { SimGate } from "@/components/sim-gate";
import { Button } from "@/components/ui/button";
import { findClub } from "@/lib/data";
import {
  activateInvite,
  activateInviteById,
  applyRemoteEntity,
  setDeviceIdentity,
  useSim,
} from "@/lib/sim/store";
import { REMOTE_CONFIGURED, supabase } from "@/lib/sync/client";
import type { Player } from "@/lib/types";
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
  const localMember = useMemo(
    () => roster.find((p) => p.invite?.token === token),
    [roster, token],
  );

  /*
   * The cloud keeps only a hash of the token, so it is asked who this
   * invitation is for (lookup_invite) and later to claim it (claim_invite);
   * neither call can list invitations. The roster on this device answers
   * only when it minted the token itself, which is the demo and the desk.
   * A fresh phone opening the link from WhatsApp holds no roster, so the
   * first paint waits for the cloud rather than showing the failure screen.
   */
  const [remote, setRemote] = useState<
    | { state: "pending" }
    | { state: "none" }
    | { state: "found"; player: Player; activated: boolean; active: boolean }
  >(REMOTE_CONFIGURED ? { state: "pending" } : { state: "none" });
  useEffect(() => {
    if (localMember || !REMOTE_CONFIGURED) return;
    let live = true;
    (async () => {
      try {
        const sb = await supabase();
        const { data } = await sb.rpc("lookup_invite", { p_token: token });
        const row = Array.isArray(data) ? data[0] : data;
        if (!live) return;
        if (!row) {
          setRemote({ state: "none" });
          return;
        }
        const player: Player = {
          id: row.id as string,
          clubId: row.club_id as string,
          name: row.name as string,
          handicap: Number(row.handicap ?? 0),
          gender: "M",
          memberNo: (row.member_no as string) ?? undefined,
        };
        setRemote({
          state: "found",
          player,
          activated: Boolean(row.activated),
          active: row.active !== false,
        });
      } catch {
        if (live) setRemote({ state: "none" });
      }
    })();
    return () => {
      live = false;
    };
  }, [localMember, token]);

  const member: Player | undefined =
    localMember ?? (remote.state === "found" ? remote.player : undefined);
  const looked = Boolean(localMember) || remote.state !== "pending";
  const claimable = localMember
    ? Boolean(!localMember.invite?.activatedAt && localMember.active !== false)
    : remote.state === "found" && !remote.activated && remote.active;
  const [claimError, setClaimError] = useState<string | null>(null);

  const claim = async () => {
    if (!member) return;
    setClaimError(null);
    if (localMember) {
      const ok = activateInvite(token, localMember.email);
      if (!ok) return;
    } else {
      try {
        const sb = await supabase();
        const { data, error } = await sb.rpc("claim_invite", { p_token: token });
        const row = Array.isArray(data) ? data[0] : data;
        if (error || !row) {
          setClaimError("That did not go through. Check your signal and try again.");
          return;
        }
        // the row is now ours: put it in the roster here, marked claimed
        applyRemoteEntity("players", {
          id: row.id,
          club_id: row.club_id,
          name: row.name,
          handicap: row.handicap,
          member_no: row.member_no,
          invite_activated_at: row.activated_at,
          invite_claimed_by: row.claimed_by,
          active: true,
          updated_at: row.activated_at,
        });
        activateInviteById(row.id as string);
      } catch {
        setClaimError("That did not go through. Check your signal and try again.");
        return;
      }
    }
    // The club vouched for this person; this device is now them.
    setDeviceIdentity(member.id);
    setClaimed(true);
  };

  if (!member && !looked) {
    return (
      <Frame>
        <p className="smallcaps text-muted-foreground">Your club</p>
        <h1 className="mt-3 font-serif text-[30px] leading-tight text-foreground">
          Checking your invitation
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          One moment while we find your place on the roster.
        </p>
      </Frame>
    );
  }

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

  const club = member ? (findClub(member.clubId) ?? null) : null;

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
            <Button variant="clay" size="lg" className="w-full" onClick={claim}>
              <Check className="size-4" />
              Yes, this is me
            </Button>
            {claimError && (
              <p className="mt-3 text-[13px] text-red-flag">{claimError}</p>
            )}
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
