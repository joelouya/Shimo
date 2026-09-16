"use client";

/**
 * One person as a card: who they are at the top, a status, the ways to
 * reach them, and two facts that matter on the day. A grid of these is how
 * a roster reads when the desk wants faces rather than rows; the ledger is
 * one toggle away.
 */

import { PlayerAvatar } from "@/components/player/identity";
import { cn } from "@/lib/utils";

export interface EntityFact {
  icon?: React.ReactNode;
  text: React.ReactNode;
}

export function EntityCard({
  player,
  name,
  sub,
  status,
  facts = [],
  pairs = [],
  menu,
  footer,
  selected,
  onClick,
  className,
}: {
  player: { id: string; name: string; photo?: string; handicap?: number };
  name?: React.ReactNode;
  sub?: React.ReactNode;
  status?: React.ReactNode;
  facts?: EntityFact[];
  pairs?: { k: React.ReactNode; v: React.ReactNode }[];
  /** the ellipsis menu, top right */
  menu?: React.ReactNode;
  /** actions along the foot of the card */
  footer?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "relative flex flex-col rounded-2xl bg-card p-4 text-left shadow-card transition-shadow",
        onClick && "focus-ring cursor-pointer hover:shadow-lift",
        selected && "ring-2 ring-ink",
        className,
      )}
    >
      {menu && <div className="absolute right-2 top-2">{menu}</div>}
      <div className="flex flex-col items-center pt-2 text-center">
        <PlayerAvatar player={player} size="lg" />
        <p className="mt-3 max-w-full truncate text-[15px] font-medium text-foreground">
          {name ?? player.name}
        </p>
        {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
        {status && <div className="mt-2.5">{status}</div>}
      </div>
      {facts.length > 0 && (
        <div className="mt-4 space-y-1.5 rounded-xl bg-secondary/50 px-3 py-2.5">
          {facts.map((f, i) => (
            <p key={i} className="flex min-w-0 items-center gap-2 text-[12px] text-ink-soft">
              {f.icon && <span className="shrink-0 text-muted-foreground">{f.icon}</span>}
              <span className="truncate">{f.text}</span>
            </p>
          ))}
        </div>
      )}
      {pairs.length > 0 && (
        <div className="mt-2 space-y-1.5 rounded-xl bg-clay-wash/40 px-3 py-2.5">
          {pairs.map((p, i) => (
            <p key={i} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-muted-foreground">{p.k}</span>
              <span className="font-medium text-foreground tnum">{p.v}</span>
            </p>
          ))}
        </div>
      )}
      {footer && <div className="mt-3 flex items-center justify-end gap-2">{footer}</div>}
    </Tag>
  );
}
