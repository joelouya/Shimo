import { cn } from "@/lib/utils";

/**
 * SHIMO wordmark. The "O" is drawn as a thin ring — the golf hole.
 * Sized via fontSize on the wrapper (em-based internals scale with it).
 */
export function Logo({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "cream" | "clay";
}) {
  const color =
    tone === "cream"
      ? "text-primary-foreground"
      : tone === "clay"
        ? "text-clay"
        : "text-ink";
  return (
    <span
      className={cn(
        "font-serif font-medium tracking-[0.22em] leading-none select-none inline-flex items-baseline",
        color,
        className,
      )}
      aria-label="Shimo"
    >
      SHIM
      <span
        aria-hidden
        className="relative inline-block size-[0.68em] translate-y-[-0.014em] rounded-full border-current"
        style={{ borderWidth: "0.075em" }}
      >
        {/* the ball at the lip of the cup */}
        <span className="absolute left-1/2 bottom-[0.045em] size-[0.14em] -translate-x-1/2 rounded-full bg-clay" />
      </span>
    </span>
  );
}
