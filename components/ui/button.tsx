import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/*
 * Two things here are deliberate and easy to undo by accident.
 *
 * The transition names its properties instead of saying `all`. `all` animates
 * whatever happens to change, which on a button means colour, shadow, border,
 * and anything a parent hands down; it is why buttons in most apps feel
 * slightly soft rather than sharp.
 *
 * And every variant presses. A ghost button is still a button: if it does not
 * answer the finger, the interface reads as not having heard. Scale rather
 * than a downward nudge, because scale takes the label and icon with it, so
 * the whole control compresses as one object instead of sliding.
 */
const PRESS =
  "active:scale-[0.97] active:duration-[var(--dur-press)] motion-reduce:active:scale-100";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium",
    "transition-[transform,background-color,border-color,color,box-shadow,opacity]",
    "duration-[var(--dur-hover)] ease-[var(--ease-out)]",
    PRESS,
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "cursor-pointer",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-ink-soft",
        clay: "bg-clay text-white shadow-xs hover:bg-clay-deep",
        outline:
          "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        // a link is text, not a surface: it should not compress
        link: "text-clay underline-offset-4 hover:underline active:scale-100",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-12 rounded-xl px-7 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
