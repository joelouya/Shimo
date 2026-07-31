import { cn } from "@/lib/utils";

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 shrink-0 rounded-full bg-clay animate-live-pulse",
        className,
      )}
    />
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-clay px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-cream uppercase",
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-cream/90 animate-live-pulse" />
      Live
    </span>
  );
}
