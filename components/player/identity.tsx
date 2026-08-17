"use client";

/**
 * A player as an object, not a string.
 *
 * The same face and name travel through pairings, the scoring desk, the
 * leaderboard and the roster, so a member reads as the same person everywhere
 * rather than being re-rendered from a name each time. A photo when the club
 * has one; otherwise the player's initials on a colour derived from their name,
 * so identity is still stable and distinct without a picture.
 *
 * Deliberately quiet: the tints are pale and warm, a way to tell two rows apart
 * at a glance, not a scatter of brand colours competing with the one accent.
 */

import { cn, initials } from "@/lib/utils";
import type { Player } from "@/lib/types";

type PlayerLike = Pick<Player, "name" | "photo">;

/** A stable hue from a name, so a member's colour never moves. */
function hueOf(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

const SIZE = {
  sm: { box: "size-6", text: "text-[9px]" },
  md: { box: "size-8", text: "text-[11px]" },
  lg: { box: "size-10", text: "text-[13px]" },
} as const;

type Size = keyof typeof SIZE;

export function PlayerAvatar({
  player,
  size = "md",
  className,
}: {
  player: PlayerLike;
  size?: Size;
  className?: string;
}) {
  const s = SIZE[size];
  if (player.photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.photo}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", s.box, className)}
      />
    );
  }
  const h = hueOf(player.name);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-medium",
        s.box,
        s.text,
        className,
      )}
      style={{ backgroundColor: `hsl(${h} 30% 85%)`, color: `hsl(${h} 44% 30%)` }}
    >
      {initials(player.name)}
    </span>
  );
}
