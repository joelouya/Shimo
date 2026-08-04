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

import { useMemo, useRef, useState } from "react";
import {
  Check,
  Download,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  Mail,
  TriangleAlert,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COURSES, clubById } from "@/lib/data";
import {
  exposureFor,
  setTournamentPhotos,
  setTournamentSponsors,
  useSim,
} from "@/lib/sim/store";
import { REMOTE_CONFIGURED } from "@/lib/sync/client";
import { uploadEventPhoto } from "@/lib/sync/storage";
import { dateSpan } from "@/lib/poster/spec";
import {
  newRecapToken,
  recapFileName,
  recapPath,
  recapSpec,
  type RecapWinner,
} from "@/lib/recap/spec";
import { publishPack } from "@/lib/recap/publish";
import { inBillingOrder, TIER_LABEL } from "@/lib/sponsors";
import { sponsorListable } from "@/lib/guests";
import { roundKey, roundsOf, tournamentDates } from "@/lib/rounds";
import { normaliseTier } from "@/lib/sponsors";
import type { EventPhoto, Sponsor, Tournament } from "@/lib/types";

type State = "idle" | "working" | "done" | "failed";
type LinkState =
  | { kind: "none" }
  | { kind: "working" }
  | { kind: "ready"; url: string }
  | { kind: "failed"; why: string };

/**
 * The club's photographs of the day.
 *
 * A club takes these anyway and currently emails them to sponsors separately
 * from the recap, which is precisely the manual step the pack exists to
 * remove. Four make a page; beyond that a club is choosing an album rather
 * than a recap, so the rest are kept and the page uses the first four.
 *
 * Uploading is optional and the pack is worth sending without it: photographs
 * arrive days later, and a recap that waits for them arrives after the
 * sponsor has stopped caring.
 */
function PhotoStrip({ tournament }: { tournament: Tournament }) {
  const photos = tournament.photos ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setProblem(null);
    if (!REMOTE_CONFIGURED) {
      setProblem(
        "Photographs need the club's database configured, because they have to be reachable from the sponsor's own browser.",
      );
      return;
    }
    setBusy(true);
    try {
      const added: EventPhoto[] = [];
      for (const file of Array.from(files)) {
        if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) continue;
        const { url } = await uploadEventPhoto(
          tournament.clubId,
          tournament.id,
          file,
        );
        added.push({ id: `ph-${Date.now().toString(36)}-${added.length}`, url });
      }
      if (!added.length) {
        setProblem("Those files were not photographs Shimo can use. PNG or JPEG.");
      } else {
        setTournamentPhotos(tournament.id, [...photos, ...added]);
      }
    } catch (e) {
      console.error("photo upload failed", e);
      setProblem("The upload did not finish. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl bg-card p-5 shadow-card">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="smallcaps text-muted-foreground">Photographs</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            {photos.length
              ? `${photos.length} uploaded. The first four appear in every sponsor's pack.`
              : "Optional. Add them and every pack gains a page of the day."}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => add(e.target.files)}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <ImagePlus className="size-3" />
          )}
          {busy ? "Uploading" : "Add photographs"}
        </Button>
      </div>

      {problem && (
        <p className="mt-3 text-[13px] leading-relaxed text-amber-flag">
          {problem}
        </p>
      )}

      {photos.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {photos.map((ph, i) => (
            <div key={ph.id} className="relative">
              {/* the club's own photograph; nothing for the optimiser to do */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={ph.url}
                alt=""
                className="h-20 w-28 rounded-lg object-cover"
              />
              {i < 4 && (
                <span className="absolute left-1 top-1 rounded bg-primary/85 px-1.5 py-px text-[10px] text-primary-foreground">
                  In the pack
                </span>
              )}
              <button
                aria-label="Remove this photograph"
                onClick={() =>
                  setTournamentPhotos(
                    tournament.id,
                    photos.filter((x) => x.id !== ph.id),
                  )
                }
                className="absolute -right-1.5 -top-1.5 rounded-full bg-card p-1 text-muted-foreground shadow-card transition-colors hover:text-destructive cursor-pointer"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const deskName = useSim((s) => s.deskName);

  const [state, setState] = useState<Record<string, State>>({});
  const [links, setLinks] = useState<Record<string, LinkState>>({});

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

  /**
   * One token per sponsor, minted once and kept.
   *
   * Held in a ref rather than state because re-minting on a re-render would
   * hand a club a link that stops matching the one they already emailed.
   */
  const tokens = useRef<Record<string, string>>({});
  const tokenFor = (sponsor: Sponsor) =>
    (tokens.current[sponsor.id] ??=
      sponsor.recapToken ?? newRecapToken());

  /**
   * The pack, as it will be published.
   *
   * Built once and used for both the PDF and the sponsor's page, so the
   * document a club forwards and the page a sponsor opens can never disagree.
   * The token comes in from the caller because a link that has already been
   * published must keep the token it was published with.
   */
  function buildSpec(sponsor: Sponsor, token: string) {
    const club = clubById(tournament.clubId);
    const { start, end } = tournamentDates(tournament);
    const first = roundsOf(tournament)[0];
    const course = COURSES.find((c) => c.id === first.courseId);

    return recapSpec({
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
      /*
       * The sponsor's own copy. Addressed by an unguessable token rather than
       * by ids: the first version of this was /recap/<tournament>/<sponsor>,
       * and a corporate day routinely has two banks on it, either of whom
       * could have read the other's participant list by editing a URL.
       */
      url:
        typeof window !== "undefined"
          ? `${window.location.origin}${recapPath(token)}`
          : undefined,
    });
  }

  async function generate(sponsor: Sponsor) {
    setState((s) => ({ ...s, [sponsor.id]: "working" }));
    try {
      const spec = buildSpec(sponsor, tokenFor(sponsor));

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
   * Publish the sponsor's own copy and put the link on the clipboard.
   *
   * Separate from generating the PDF on purpose: a club that only wants to
   * forward a file should not have to put anything on the internet, and a club
   * that wants a shareable page should have to press something that says so.
   */
  async function publish(sponsor: Sponsor) {
    setLinks((l) => ({ ...l, [sponsor.id]: { kind: "working" } }));
    try {
      const token = tokenFor(sponsor);
      const spec = buildSpec(sponsor, token);
      await publishPack({
        token,
        tournamentId: tournament.id,
        sponsorId: sponsor.id,
        spec,
        actor: deskName ?? "",
      });
      /* Remember it on the sponsor, so a later publish keeps the same address
         rather than orphaning the link the club already sent. */
      setTournamentSponsors(
        tournament.id,
        (tournament.sponsors ?? []).map((x) =>
          x.id === sponsor.id ? { ...x, recapToken: token } : x,
        ),
      );
      const url = `${window.location.origin}${recapPath(token)}`;
      await navigator.clipboard.writeText(url);
      setLinks((l) => ({ ...l, [sponsor.id]: { kind: "ready", url } }));
    } catch (e) {
      /*
       * A club should never read a Postgres message. The raw error goes to the
       * console for whoever is debugging; the desk gets told what happened and
       * who can fix it.
       */
      console.error("publishing the sponsor link failed", e);
      const raw = (e as Error)?.message ?? "";
      setLinks((l) => ({
        ...l,
        [sponsor.id]: {
          kind: "failed",
          why: /recap_packs|schema cache|relation/i.test(raw)
            ? "The sponsor page is not set up on this club's database yet. Run the latest migration and try again."
            : raw.includes("database configured")
              ? raw
              : "The link could not be published. Check the connection and try again.",
        },
      }));
    }
  }

  /**
   * A pre-addressed email the club sends from their own account.
   *
   * The pack is attached by hand, which is the one manual step left and the
   * one worth keeping: it is also the moment a caddymaster checks that the
   * right pack is going to the right person.
   */
  function mailto(sponsor: Sponsor, link?: string) {
    const to = sponsor.contact?.email ?? "";
    const subject = `${tournament.name} · your sponsor recap`;
    const body = [
      `Dear ${sponsor.contact?.name ?? "there"},`,
      "",
      `Thank you for backing ${tournament.name}. Attached is your recap: where your name appeared, what we measured, how the day finished, and the result of your contest.`,
      "",
      "Please attach the PDF you just downloaded before sending.",
      "",
      ...(link
        ? ["You can also view it online here:", link, ""]
        : []),
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
          const link: LinkState = links[sp.id] ?? { kind: "none" };
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
                {link.kind === "failed" && (
                  <p className="mt-1 text-[13px] leading-relaxed text-amber-flag">
                    {link.why}
                  </p>
                )}
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
                <Button
                  variant="outline"
                  size="sm"
                  disabled={link.kind === "working"}
                  onClick={() => publish(sp)}
                >
                  {link.kind === "working" ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : link.kind === "ready" ? (
                    <Check className="size-3" />
                  ) : (
                    <LinkIcon className="size-3" />
                  )}
                  {link.kind === "ready"
                    ? "Link copied"
                    : link.kind === "failed"
                      ? "Try again"
                      : "Sponsor link"}
                </Button>
                {reachable && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={mailto(
                        sp,
                        link.kind === "ready" ? link.url : undefined,
                      )}
                    >
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

      <PhotoStrip tournament={tournament} />

      <p className="mt-4 text-[13px] leading-relaxed text-muted-foreground">
        {consented.length} of {inThisEvent.length}{" "}
        guests agreed to appear in a sponsor&apos;s participant list. The rest are counted in each pack but
        not named, and nobody&apos;s contact details or dietary notes are ever
        included.
      </p>
    </section>
  );
}
