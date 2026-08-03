"use client";

/**
 * A sponsor's own copy of their recap.
 *
 * The audience here is not a golfer and not a club: it is a marketing manager
 * at a bank, on a laptop, three weeks after the day, who has been asked what
 * the sponsorship got them. So the page opens with the answer rather than with
 * a login, and every asset on it is one click from a slide.
 *
 * Nothing here is recomputed. The pack was published by the club and is served
 * exactly as published, because a document whose numbers move between readings
 * is worth nothing to the person who paid for the day.
 */

import { use, useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Download, FileText, ImageDown } from "lucide-react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { resolvePack } from "@/lib/recap/publish";
import { recapFileName, type RecapSpec } from "@/lib/recap/spec";

const EASE = [0.23, 1, 0.32, 1] as const;

const PAGES = [
  { n: 1, label: "The day", hint: "Your billing, and where your name appeared" },
  { n: 2, label: "The numbers", hint: "What was measured, and what was not" },
  { n: 3, label: "The result", hint: "How it finished, and who played" },
];

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6 pb-20 pt-[max(env(safe-area-inset-top),28px)]">
      <div className="py-4">
        <Logo className="text-[17px]" />
      </div>
      {children}
    </main>
  );
}

/**
 * A rendered page of the pack.
 *
 * The image is produced by the same route that builds the PDF, so what a
 * sponsor sees on screen and what they hand their agency are the same artwork.
 * Fetched as a blob rather than pointed at with a src, because the route takes
 * the spec as a POST body.
 */
function PackPage({
  spec,
  page,
  label,
  hint,
}: {
  spec: RecapSpec;
  page: number;
  label: string;
  hint: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetch(`/api/recap?page=${page}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(spec),
        });
        if (!res.ok) throw new Error(await res.text());
        const blob = await res.blob();
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [spec, page]);

  const download = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = recapFileName(spec).replace(/\.pdf$/, `-${page}.png`);
    a.click();
  };

  return (
    <div className="mt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="smallcaps text-muted-foreground">{label}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{hint}</p>
        </div>
        <Button variant="outline" size="sm" disabled={!url} onClick={download}>
          <ImageDown className="size-3" />
          Image
        </Button>
      </div>
      <div className="mt-3 overflow-hidden rounded-2xl bg-card shadow-card">
        {url ? (
          // the pack's own artwork, already rendered; nothing for the optimiser
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`${label} page of the recap`} className="w-full" />
        ) : (
          <div className="flex aspect-[1240/1754] items-center justify-center">
            <p className="text-[13px] text-muted-foreground">
              {failed ? "This page could not be drawn." : "Drawing this page…"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Pack({ token }: { token: string }) {
  const still = useReducedMotion();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "missing" }
    | { kind: "error" }
    | { kind: "ready"; spec: RecapSpec }
  >({ kind: "loading" });

  useEffect(() => {
    let live = true;
    resolvePack(token)
      .then((p) => {
        if (!live) return;
        setState(p ? { kind: "ready", spec: p.spec } : { kind: "missing" });
      })
      .catch(() => live && setState({ kind: "error" }));
    return () => {
      live = false;
    };
  }, [token]);

  if (state.kind === "loading") {
    return (
      <Frame>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-[15px] text-muted-foreground">Opening your recap…</p>
        </div>
      </Frame>
    );
  }

  /*
   * A link that does not resolve and a read that failed are different things
   * and are told apart, because one is the reader's problem and the other is
   * ours. Neither says whether the token was real.
   */
  if (state.kind !== "ready") {
    return (
      <Frame>
        <div className="flex flex-1 flex-col justify-center">
          <h1 className="font-serif text-[30px] leading-tight text-foreground">
            {state.kind === "missing"
              ? "We could not open this recap"
              : "Something went wrong loading this"}
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-ink-soft">
            {state.kind === "missing"
              ? "The link may be out of date, or the club may have published a newer one. Ask them to send it again."
              : "This is our side, not yours. Try again in a moment, and tell the club if it keeps happening."}
          </p>
        </div>
      </Frame>
    );
  }

  const { spec } = state;

  const downloadPdf = async () => {
    const res = await fetch("/api/recap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = recapFileName(spec);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Frame>
      <motion.div
        initial={still ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="mt-4"
      >
        <p className="smallcaps text-muted-foreground">
          {spec.sponsor.name}
        </p>
        <h1 className="mt-3 font-serif text-[34px] leading-tight text-foreground">
          {spec.event.title}
        </h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          {spec.event.dateLine} · {spec.event.venueLine}
        </p>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-ink-soft">
          Your recap from {spec.event.club.name}. Every figure in it was
          observed on the day; anything that could not be measured says so
          rather than being estimated.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <Button variant="clay" size="lg" onClick={downloadPdf}>
            <FileText className="size-4" />
            Download the pack
          </Button>
          <span className="text-[13px] text-muted-foreground">
            PDF, three pages. Individual images are below.
          </span>
        </div>
      </motion.div>

      {PAGES.map((p) => (
        <PackPage
          key={p.n}
          spec={spec}
          page={p.n}
          label={p.label}
          hint={p.hint}
        />
      ))}

      <div className="mt-12 border-t border-border pt-6">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Prepared by {spec.event.club.name} and published on{" "}
          {new Date(spec.generatedAt).toLocaleDateString("en-KE", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          . The figures are fixed as published and do not change.
        </p>
      </div>
    </Frame>
  );
}

export default function RecapPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  return <Pack token={token} />;
}
