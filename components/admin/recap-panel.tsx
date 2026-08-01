"use client";

/**
 * Delivering the recap packs.
 *
 * The research puts sponsor fulfilment at four to twelve hours a club and
 * calls it the least systematised part of the whole workflow. This is that
 * work: one row per sponsor, one button, a PDF, and a pre-addressed email.
 *
 * On delivery: Shimo does not send the email. The pack downloads and the club
 * sends it from their own address, because a sponsor who receives a recap from
 * a name they have never heard of treats it as spam, and because a
 * transactional email provider is infrastructure and a commercial decision
 * this product has not made. A caddymaster who cares enough to generate eight
 * packs cares enough to send eight emails, and the club keeps the relationship
 * it already has. See docs/COMMITMENTS.md.
 */

import { useMemo, useState } from "react";
import { Check, Download, Loader2, Mail, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COURSES, clubById } from "@/lib/data";
import { exposureFor, roundScores, useSim } from "@/lib/sim/store";
import { dateSpan } from "@/lib/poster/spec";
import { recapFileName, recapSpec, type RecapWinner } from "@/lib/recap/spec";
import { inBillingOrder, TIER_LABEL } from "@/lib/sponsors";
import { sponsorListable } from "@/lib/guests";
import { roundKey, roundsOf, tournamentDates } from "@/lib/rounds";
import { normaliseTier } from "@/lib/sponsors";
import type { Sponsor, Tournament } from "@/lib/types";

type State = "idle" | "working" | "done" | "failed";

export function RecapPanel({
  tournament,
  winners,
}: {
  tournament: Tournament;
  /** the top of the board, already computed by the summary page */
  winners: RecapWinner[];
}) {
  const guests = useSim((s) => s.guests);
  const guestEntries = useSim((s) => s.guestEntries);
  const exposure = useSim((s) => s.exposure);
  const scores = useSim((s) => s.scores);
  const roster = useSim((s) => s.roster);

  const [state, setState] = useState<Record<string, State>>({});

  const sponsors = useMemo(
    () => inBillingOrder(tournament.sponsors ?? []),
    [tournament.sponsors],
  );

  const inThisEvent = useMemo(() => {
    const ids = new Set(
      guestEntries
        .filter((e) => e.tournamentId === tournament.id)
        .map((e) => e.guestId),
    );
    return guests.filter((g) => ids.has(g.id));
  }, [guests, guestEntries, tournament.id]);

  const consented = useMemo(() => sponsorListable(inThisEvent), [inThisEvent]);
  const withheld = inThisEvent.length - consented.length;

  async function generate(sponsor: Sponsor) {
    setState((s) => ({ ...s, [sponsor.id]: "working" }));
    try {
      const club = clubById(tournament.clubId);
      const { start, end } = tournamentDates(tournament);
      const first = roundsOf(tournament)[0];
      const course = COURSES.find((c) => c.id === first.courseId);

      const spec = recapSpec({
        sponsor,
        tournament,
        club: { name: club.name },
        events: exposureFor({ exposure } as never, tournament.id),
        /* Round one carries the contests; a corporate day is one round. */
        cards: scores[roundKey(tournament.id, 1)] ?? {},
        winners,
        consented,
        withheld,
        nameOf: (pid) =>
          inThisEvent.find((g) => g.id === pid)?.name ??
          roster.find((p) => p.id === pid)?.name,
        dateLine: dateSpan(start, end),
        venueLine: `${club.name}${course ? ` · ${course.name}` : ""}${
          first.tees ? ` · ${first.tees} tees` : ""
        }`,
        url:
          typeof window !== "undefined"
            ? `${window.location.origin}/recap/${tournament.id}/${sponsor.id}`
            : undefined,
      });

      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(spec),
      });
      if (!res.ok) throw new Error(await res.text());

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = recapFileName(spec);
      a.click();
      URL.revokeObjectURL(url);

      setState((s) => ({ ...s, [sponsor.id]: "done" }));
    } catch (e) {
      console.error("recap failed", e);
      setState((s) => ({ ...s, [sponsor.id]: "failed" }));
    }
  }

  /**
   * A pre-addressed email the club sends from their own account.
   *
   * The pack is attached by hand, which is the one manual step left and the
   * one worth keeping: it is also the moment a caddymaster checks that the
   * right pack is going to the right person.
   */
  function mailto(sponsor: Sponsor) {
    const to = sponsor.contact?.email ?? "";
    const subject = `${tournament.name} · your sponsor recap`;
    const body = [
      `Dear ${sponsor.contact?.name ?? "there"},`,
      "",
      `Thank you for backing ${tournament.name}. Attached is your recap: where your name appeared, what we measured, how the day finished, and the result of your contest.`,
      "",
      "Please attach the PDF you just downloaded before sending.",
      "",
      clubById(tournament.clubId).name,
    ].join("\n");
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  }

  if (!sponsors.length) return null;

  return (
    <section className="mt-10">
      <div className="flex items-end justify-between">
        <div>
          <p className="smallcaps text-muted-foreground">After the day</p>
          <h2 className="mt-2 font-serif text-[30px] leading-tight text-foreground">
            Sponsor recap packs
          </h2>
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        One pack per sponsor, featuring them. Every figure in it was observed;
        anything Shimo could not see is named as not measured rather than
        estimated. The pack downloads to this computer and you send it from the
        club&apos;s own address.
      </p>

      <div className="mt-6 divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-card">
        {sponsors.map((sp) => {
          const s = state[sp.id] ?? "idle";
          const reachable = Boolean(sp.contact?.email);
          return (
            <div key={sp.id} className="flex items-center gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2.5">
                  <p className="truncate text-[15px] font-medium text-foreground">
                    {sp.name}
                  </p>
                  <Badge variant="outline">
                    {TIER_LABEL[normaliseTier(sp.tier)]}
                  </Badge>
                  {sp.category && (
                    <Badge variant="secondary">{sp.category}</Badge>
                  )}
                </div>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  {reachable ? (
                    <>
                      {sp.contact!.name} · {sp.contact!.email}
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-flag">
                      <TriangleAlert className="size-3.5" />
                      No contact person, so there is nobody to send this to
                    </span>
                  )}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant={s === "done" ? "outline" : "clay"}
                  size="sm"
                  disabled={s === "working"}
                  onClick={() => generate(sp)}
                >
                  {s === "working" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : s === "done" ? (
                    <Check className="size-3" />
                  ) : (
                    <Download className="size-3" />
                  )}
                  {s === "working"
                    ? "Building"
                    : s === "done"
                      ? "Downloaded"
                      : s === "failed"
                        ? "Try again"
                        : "Generate"}
                </Button>
                {reachable && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={mailto(sp)}>
                      <Mail className="size-3" />
                      Email {sp.contact!.name.split(" ")[0]}
                    </a>
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        {consented.length} of {inThisEvent.length}{" "}
        guests agreed to appear in a sponsor&apos;s participant list. The rest are counted in each pack but
        not named, and nobody&apos;s contact details or dietary notes are ever
        included.
      </p>
    </section>
  );
}
