"use client";

/**
 * Tabs, with the selected pill travelling between them.
 *
 * The pill used to appear under whichever tab you clicked and vanish from the
 * one you left, which reads as two separate events rather than one thing
 * moving. Sliding it says what actually happened: the same selection, now
 * somewhere else. This is the one place in the app where a shared element is
 * worth the measurement cost, because the movement is the meaning.
 *
 * Knowing which trigger is selected needs the current value during render, and
 * Radix only exposes it afterwards as a `data-state` attribute on the DOM. So
 * the root mirrors the value into a small context. Both call sites are already
 * controlled, so this costs nothing and the public API is unchanged.
 */

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

const TabsValueContext = React.createContext<string | undefined>(undefined);
/** Distinct per Tabs instance, so two tab sets on a page do not share one pill. */
const TabsIdContext = React.createContext<string>("tabs");

function Tabs({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [internal, setInternal] = React.useState(defaultValue);
  const current = value ?? internal;
  const id = React.useId();

  return (
    <TabsIdContext.Provider value={id}>
      <TabsValueContext.Provider value={current}>
        <TabsPrimitive.Root
          data-slot="tabs"
          className={cn("flex flex-col gap-2", className)}
          value={value}
          defaultValue={defaultValue}
          onValueChange={(v) => {
            // tracked either way, so an uncontrolled Tabs slides as well
            setInternal(v);
            onValueChange?.(v);
          }}
          {...props}
        />
      </TabsValueContext.Provider>
    </TabsIdContext.Provider>
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center justify-center rounded-full bg-secondary p-[3px] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  value,
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const selected = React.useContext(TabsValueContext) === value;
  const groupId = React.useContext(TabsIdContext);

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      value={value}
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-medium whitespace-nowrap cursor-pointer",
        // named, not `all`: the pill behind does the moving, the label only tints
        "transition-[color] duration-[var(--dur-hover)] ease-[var(--ease-out)]",
        "text-muted-foreground hover:text-foreground",
        "focus-visible:ring-2 focus-visible:ring-ring/35 outline-none",
        "data-[state=active]:text-primary-foreground",
        "active:scale-[0.97] active:duration-[var(--dur-press)] motion-reduce:active:scale-100",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {selected && (
        <motion.span
          layoutId={`tab-pill-${groupId}`}
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-primary shadow-sm"
          /*
           * A spring, not a duration. A tab set is the one control someone will
           * click twice in a second, and a spring keeps its velocity when it is
           * interrupted: the second click redirects the pill from wherever it
           * has got to, rather than restarting it from a tab it never reached.
           */
          transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.7 }}
        />
      )}
      {children}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
