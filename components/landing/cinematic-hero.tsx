"use client";

/**
 * The cinematic opening.
 *
 * A pinned, scroll-driven sequence that plays before the editorial landing:
 * the headline resolves, a navy card rises and fills the frame, the golfer app
 * assembles inside a phone with the leader's figure counting up, Shimo's
 * moments float in, and a single Get started CTA lands before the card lifts
 * away into the page below.
 *
 * The mechanics are borrowed from a generic product hero; everything visible is
 * rebuilt in Shimo's world. Warm paper ground, ink navy card, Fraunces for
 * anything read, terracotta for the one live mark, gold for the seal. No app
 * store, no glass-tech chrome, no silver sans: the phone shows the real product
 * on real paper.
 *
 * Reduced motion is honoured by rendering nothing at all, so those visitors
 * land straight on the fast editorial page beneath this component.
 */

import React, { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Check, ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const INJECTED_STYLES = `
  .cin-reveal { visibility: hidden; }

  .cin-grain {
    position: absolute; inset: 0; pointer-events: none; z-index: 50;
    opacity: 0.05; mix-blend-mode: multiply;
    background: url('data:image/svg+xml;utf8,<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)"/></svg>');
  }

  /* faint warm rule-grid on the paper, masked to the centre */
  .cin-grid {
    background-size: 64px 64px;
    background-image:
      linear-gradient(to right, color-mix(in srgb, var(--color-foreground) 4%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--color-foreground) 4%, transparent) 1px, transparent 1px);
    mask-image: radial-gradient(ellipse at center, black 0%, transparent 68%);
    -webkit-mask-image: radial-gradient(ellipse at center, black 0%, transparent 68%);
  }

  /* headline on paper: navy ink with a soft paper shadow */
  .cin-ink {
    color: var(--color-foreground);
    text-shadow:
      0 12px 34px color-mix(in srgb, var(--color-foreground) 16%, transparent),
      0 2px 4px color-mix(in srgb, var(--color-foreground) 10%, transparent);
  }

  /* brand set inside the dark card: cream leaf, deep shadow */
  .cin-cream-emboss {
    background: linear-gradient(180deg, #f7f3ec 0%, color-mix(in srgb, #f7f3ec 42%, transparent) 100%);
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent;
    transform: translateZ(0);
    filter: drop-shadow(0 12px 24px rgba(10,14,26,0.7)) drop-shadow(0 4px 8px rgba(10,14,26,0.6));
  }

  /* the navy sheet: a lifted ink gradient with a warm gold hairline */
  .cin-card {
    background: linear-gradient(150deg, #26324f 0%, #131c30 46%, #0d1422 100%);
    box-shadow:
      0 44px 110px -22px rgba(13, 18, 32, 0.85),
      0 20px 44px -20px rgba(13, 18, 32, 0.7),
      inset 0 1px 2px rgba(247, 243, 236, 0.14),
      inset 0 -2px 6px rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(198, 154, 58, 0.14);
    position: relative;
  }

  .cin-sheen {
    position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 50;
    background: radial-gradient(760px circle at var(--mx, 50%) var(--my, 50%), rgba(247,243,236,0.06) 0%, transparent 42%);
    mix-blend-mode: screen;
  }

  /* iPhone hardware (universal) */
  .cin-bezel {
    background-color: #0e0e12;
    box-shadow:
      inset 0 0 0 2px #3f434d,
      inset 0 0 0 7px #000,
      0 40px 80px -15px rgba(0,0,0,0.85),
      0 15px 25px -5px rgba(0,0,0,0.6);
    transform-style: preserve-3d;
  }
  .cin-hardware-btn {
    background: linear-gradient(90deg, #3a3a40 0%, #141418 100%);
    box-shadow: -2px 0 5px rgba(0,0,0,0.8), inset -1px 0 1px rgba(255,255,255,0.12), inset 1px 0 2px rgba(0,0,0,0.8);
    border-left: 1px solid rgba(255,255,255,0.05);
  }
  .cin-screen-glare {
    background: linear-gradient(110deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 44%);
  }

  /* floating Shimo moments: warm cream glass */
  .cin-badge {
    background: linear-gradient(135deg, rgba(247,243,236,0.94) 0%, rgba(247,243,236,0.82) 100%);
    backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
    box-shadow:
      0 0 0 1px rgba(26,35,50,0.06),
      0 24px 48px -12px rgba(13,18,32,0.55),
      inset 0 1px 1px rgba(255,255,255,0.7);
  }

  .cin-ring {
    transform: rotate(-90deg); transform-origin: center;
    stroke-dasharray: 402; stroke-dashoffset: 402; stroke-linecap: round;
  }
`;

export interface CinematicHeroProps
  extends React.HTMLAttributes<HTMLDivElement> {
  onGetStarted?: () => void;
  clubHref?: string;
}

export function CinematicHero({
  onGetStarted,
  clubHref = "/admin",
  className,
  ...props
}: CinematicHeroProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // Honour reduced motion: render nothing, and the editorial page below serves
  // these visitors directly.
  useEffect(() => {
    setEnabled(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Mouse: light on the card, a gentle parallax tilt on the phone.
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (!cardRef.current || !phoneRef.current) return;
        const r = cardRef.current.getBoundingClientRect();
        cardRef.current.style.setProperty("--mx", `${e.clientX - r.left}px`);
        cardRef.current.style.setProperty("--my", `${e.clientY - r.top}px`);
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        gsap.to(phoneRef.current, {
          rotationY: x * 11,
          rotationX: -y * 11,
          ease: "power3.out",
          duration: 1.2,
        });
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(rafRef.current);
    };
  }, [enabled]);

  // The pinned scroll timeline.
  useEffect(() => {
    if (!enabled) return;
    const isMobile = window.innerWidth < 768;
    const LEADER_PTS = 41;

    const ctx = gsap.context(() => {
      gsap.set(".cin-track", { autoAlpha: 0, y: 60, scale: 0.86, filter: "blur(20px)", rotationX: -18 });
      gsap.set(".cin-track-2", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".cin-main-card", { yPercent: 120, autoAlpha: 1 });
      gsap.set([".cin-left", ".cin-right", ".cin-phone-wrap", ".cin-badge-fl", ".cin-widget"], { autoAlpha: 0 });
      gsap.set(".cin-cta", { autoAlpha: 0, scale: 0.82, filter: "blur(26px)" });

      const intro = gsap.timeline({ delay: 0.25 });
      intro
        .to(".cin-track", { duration: 1.7, autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", rotationX: 0, ease: "expo.out" })
        .to(".cin-track-2", { duration: 1.3, clipPath: "inset(0 0% 0 0)", ease: "power4.inOut" }, "-=1.0");

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=7000",
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      tl
        .to([".cin-hero-text", ".cin-grid"], { scale: 1.14, filter: "blur(18px)", opacity: 0.18, ease: "power2.inOut", duration: 2 }, 0)
        .to(".cin-main-card", { yPercent: 0, ease: "power3.inOut", duration: 2 }, 0)
        .to(".cin-main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1.5 })
        .fromTo(".cin-phone-wrap",
          { y: 300, z: -500, rotationX: 50, rotationY: -28, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 2.5 }, "-=0.8"
        )
        .fromTo(".cin-widget", { y: 40, autoAlpha: 0, scale: 0.95 }, { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: "back.out(1.2)", duration: 1.4 }, "-=1.5")
        .to(".cin-ring", { strokeDashoffset: 78, duration: 2, ease: "power3.inOut" }, "-=1.2")
        .to(".cin-counter", { innerHTML: LEADER_PTS, snap: { innerHTML: 1 }, duration: 2, ease: "expo.out" }, "-=2.0")
        .fromTo(".cin-badge-fl", { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -8 }, { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1.4, stagger: 0.2 }, "-=2.0")
        .fromTo(".cin-left", { x: -50, autoAlpha: 0 }, { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1.4 }, "-=1.4")
        .fromTo(".cin-right", { x: 50, autoAlpha: 0, scale: 0.82 }, { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.4 }, "<")
        .to({}, { duration: 2.4 })
        .set(".cin-hero-text", { autoAlpha: 0 })
        .set(".cin-cta", { autoAlpha: 1 })
        .to({}, { duration: 1.4 })
        .to([".cin-phone-wrap", ".cin-badge-fl", ".cin-left", ".cin-right"], { scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: "power3.in", duration: 1.2, stagger: 0.05 })
        .to(".cin-main-card", { width: isMobile ? "92vw" : "86vw", height: isMobile ? "90vh" : "84vh", borderRadius: isMobile ? "30px" : "40px", ease: "expo.inOut", duration: 1.8 }, "pull")
        .to(".cin-cta", { scale: 1, filter: "blur(0px)", ease: "expo.inOut", duration: 1.8 }, "pull")
        .to(".cin-main-card", { yPercent: -145, ease: "power3.in", duration: 1.5 });
    }, containerRef);

    // The pane can mount at zero height (fonts still loading, tab not yet laid
    // out), which starves ScrollTrigger's start/end math. Recompute once layout
    // has settled and again after web fonts land, so the pin distance and the
    // yPercent offsets resolve against the real viewport.
    const refresh = () => ScrollTrigger.refresh();
    const raf = requestAnimationFrame(() => requestAnimationFrame(refresh));
    window.addEventListener("load", refresh);
    if (document.fonts?.ready) document.fonts.ready.then(refresh);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("load", refresh);
      ctx.revert();
    };
  }, [enabled]);

  if (enabled === false) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-screen w-full items-center justify-center overflow-hidden bg-background text-foreground antialiased",
        className,
      )}
      style={{ perspective: "1500px" }}
      {...props}
    >
      <style dangerouslySetInnerHTML={{ __html: INJECTED_STYLES }} />
      <div className="cin-grain" aria-hidden="true" />
      <div className="cin-grid pointer-events-none absolute inset-0 z-0 opacity-60" aria-hidden="true" />

      {/* Intro headline (Fraunces on paper) */}
      <div className="cin-hero-text absolute z-10 flex w-full flex-col items-center justify-center px-4 text-center">
        <h1 className="cin-track cin-reveal cin-ink font-serif text-[clamp(40px,8vw,92px)] font-medium leading-[0.98] tracking-[-0.02em]">
          Every card
        </h1>
        <h1 className="cin-track-2 cin-reveal font-serif text-[clamp(40px,8vw,92px)] font-medium italic leading-[0.98] tracking-[-0.02em] text-clay">
          comes back signed.
        </h1>
        <p className="cin-track mt-6 max-w-md font-serif text-[clamp(16px,2vw,20px)] leading-relaxed text-ink-soft">
          A club&apos;s whole tournament day, kept like a document.
        </p>
      </div>

      {/* CTA scene */}
      <div className="cin-cta cin-reveal pointer-events-auto absolute z-10 flex w-full flex-col items-center justify-center px-4 text-center">
        <p className="smallcaps mb-4 flex items-center gap-3 text-muted-foreground">
          <span className="h-px w-8 bg-clay/60" /> Tournament golf, beautifully run
        </p>
        <h2 className="font-serif text-[clamp(34px,6vw,68px)] font-medium leading-[1.0] tracking-[-0.02em] text-foreground text-balance">
          Start your tournament day.
        </h2>
        <p className="mx-auto mt-5 max-w-xl font-serif text-[clamp(17px,2.2vw,21px)] leading-relaxed text-ink-soft">
          Entries and tee sheets, live scoring on the course, cards certified to
          the Rules of Golf, and a clubhouse screen worth watching.
        </p>
        <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onGetStarted}
            className="group inline-flex items-center gap-2.5 rounded-xl bg-clay px-7 py-3.5 font-medium text-cream shadow-lift transition-[transform,background-color] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:bg-clay-deep active:scale-[0.98]"
          >
            <span className="size-1.5 rounded-full bg-cream animate-live-pulse" />
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </button>
          <a
            href={clubHref}
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-7 py-3.5 font-medium text-foreground shadow-card transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-lift"
          >
            See the club
          </a>
        </div>
      </div>

      {/* The navy sheet */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center" style={{ perspective: "1500px" }}>
        <div
          ref={cardRef}
          className="cin-main-card cin-card cin-reveal pointer-events-auto relative flex h-[92vh] w-[92vw] items-center justify-center overflow-hidden rounded-[30px] md:h-[84vh] md:w-[86vw] md:rounded-[40px]"
        >
          <div className="cin-sheen" aria-hidden="true" />

          <div className="relative z-10 mx-auto flex h-full w-full max-w-7xl flex-col items-center justify-evenly px-4 py-6 lg:grid lg:grid-cols-3 lg:gap-8 lg:px-12 lg:py-0">
            {/* brand */}
            <div className="cin-right cin-reveal order-1 z-20 flex w-full justify-center lg:order-3 lg:justify-end">
              <h2 className="cin-cream-emboss font-serif text-[clamp(56px,12vw,132px)] font-medium leading-none tracking-[-0.03em]">
                Shimo
              </h2>
            </div>

            {/* phone with the golfer app */}
            <div className="cin-phone-wrap order-2 z-10 flex h-[380px] w-full items-center justify-center lg:order-2 lg:h-[600px]" style={{ perspective: "1000px" }}>
              <div className="relative flex h-full w-full scale-[0.65] items-center justify-center md:scale-[0.85] lg:scale-100">
                <div
                  ref={phoneRef}
                  className="cin-bezel relative flex h-[580px] w-[280px] flex-col rounded-[3rem]"
                  style={{ willChange: "transform", transformStyle: "preserve-3d" }}
                >
                  <div className="cin-hardware-btn absolute top-[120px] -left-[3px] z-0 h-[25px] w-[3px] rounded-l-md" aria-hidden="true" />
                  <div className="cin-hardware-btn absolute top-[160px] -left-[3px] z-0 h-[45px] w-[3px] rounded-l-md" aria-hidden="true" />
                  <div className="cin-hardware-btn absolute top-[220px] -left-[3px] z-0 h-[45px] w-[3px] rounded-l-md" aria-hidden="true" />
                  <div className="cin-hardware-btn absolute top-[170px] -right-[3px] z-0 h-[70px] w-[3px] scale-x-[-1] rounded-r-md" aria-hidden="true" />

                  {/* screen: the Shimo app, on cream paper */}
                  <div className="absolute inset-[7px] overflow-hidden rounded-[2.5rem] bg-[#f7f3ec] text-[#1a2332] shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]">
                    <div className="cin-screen-glare pointer-events-none absolute inset-0 z-40" aria-hidden="true" />

                    {/* dynamic island with a live (clay) dot */}
                    <div className="absolute top-[5px] left-1/2 z-50 flex h-[28px] w-[100px] -translate-x-1/2 items-center justify-end rounded-full bg-black px-3">
                      <div className="size-1.5 animate-live-pulse rounded-full bg-clay" />
                    </div>

                    <div className="relative flex h-full w-full flex-col px-4 pt-12 pb-6">
                      <div className="cin-widget flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#96371f]">Live · R1</span>
                          <span className="font-serif text-[17px] leading-tight tracking-[-0.01em]">Captain&apos;s Prize</span>
                        </div>
                        <div className="flex size-8 items-center justify-center rounded-full bg-[#ece5d6] font-serif text-[12px] text-[#414b5e]">JO</div>
                      </div>

                      {/* leader ring + count-up */}
                      <div className="cin-widget relative mx-auto mt-5 mb-4 flex size-32 items-center justify-center">
                        <svg className="absolute inset-0 size-full" aria-hidden="true">
                          <circle cx="64" cy="64" r="52" fill="none" stroke="rgba(26,35,50,0.08)" strokeWidth="9" />
                          <circle className="cin-ring" cx="64" cy="64" r="52" fill="none" stroke="#b8462b" strokeWidth="9" />
                        </svg>
                        <div className="z-10 flex flex-col items-center">
                          <span className="cin-counter font-serif text-[36px] leading-none tracking-[-0.02em] text-[#1a2332] tnum">0</span>
                          <span className="mt-1 text-[7.5px] font-semibold uppercase tracking-[0.14em] text-[#736d61]">Leader · pts</span>
                        </div>
                      </div>

                      {/* mini leaderboard */}
                      <div className="cin-widget overflow-hidden rounded-2xl bg-white/70 shadow-[0_8px_18px_rgba(26,35,50,0.06)]">
                        {[
                          { p: "1", n: "S. Gitau", s: "41", lead: true },
                          { p: "2", n: "D. Mutua", s: "38", lead: false },
                          { p: "3", n: "I. Fraser", s: "35", lead: false },
                        ].map((r, i) => (
                          <div key={r.n} className={cn("flex items-center gap-2 px-3 py-2", i > 0 && "border-t border-[#e4ddce]")}>
                            <span className={cn("w-5 font-serif text-[11px] tnum", r.lead ? "text-[#96371f]" : "text-[#736d61]")}>{r.p}</span>
                            <span className="flex-1 truncate text-[12px] text-[#414b5e]">{r.n}</span>
                            <span className="font-serif text-[13px] text-[#1a2332] tnum">{r.s}</span>
                          </div>
                        ))}
                      </div>

                      {/* sealed chip */}
                      <div className="cin-widget mt-3 flex items-center gap-2 rounded-xl bg-[#ece5d6]/70 px-3 py-2">
                        <Check className="size-3 shrink-0 text-[#96371f]" />
                        <span className="text-[10px] text-[#414b5e]">Card sealed</span>
                        <span className="ml-auto font-mono text-[9px] text-[#736d61] tnum">a3f9c2e1b7</span>
                      </div>

                      <div className="absolute bottom-2 left-1/2 h-[4px] w-[120px] -translate-x-1/2 rounded-full bg-[#1a2332]/20" />
                    </div>
                  </div>
                </div>

                {/* floating Shimo moments */}
                <div className="cin-badge-fl cin-badge absolute top-6 left-[-15px] z-30 flex items-center gap-3 rounded-xl p-3 lg:top-12 lg:left-[-80px] lg:gap-4 lg:rounded-2xl lg:p-4">
                  <div className="flex size-8 items-center justify-center rounded-full bg-clay-wash lg:size-10">
                    <Check className="size-4 text-clay-deep lg:size-5" />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold tracking-tight text-foreground lg:text-[13.5px]">Card sealed</p>
                    <p className="text-[10px] text-muted-foreground lg:text-[11px]">Marker attested, player certified</p>
                  </div>
                </div>

                <div className="cin-badge-fl cin-badge absolute bottom-12 right-[-15px] z-30 flex items-center gap-3 rounded-xl p-3 lg:bottom-20 lg:right-[-80px] lg:gap-4 lg:rounded-2xl lg:p-4">
                  <div className="flex size-8 items-center justify-center rounded-full bg-gold-wash lg:size-10">
                    <span className="font-serif text-[13px] font-medium text-gold-deep lg:text-[15px]">◎</span>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold tracking-tight text-foreground lg:text-[13.5px]">Eagle · 8th</p>
                    <p className="text-[10px] text-muted-foreground lg:text-[11px]">On the clubhouse screen</p>
                  </div>
                </div>
              </div>
            </div>

            {/* accountability copy */}
            <div className="cin-left cin-reveal order-3 z-20 flex w-full flex-col justify-center px-4 text-center lg:order-1 lg:px-0 lg:text-left">
              <h3 className="font-serif text-[clamp(24px,3vw,40px)] font-medium leading-tight tracking-[-0.01em] text-cream">
                The card, kept properly.
              </h3>
              <p className="mx-auto mt-0 max-w-sm text-[13px] leading-relaxed text-cream/70 lg:mx-0 lg:mt-4 lg:max-w-none lg:text-[15px]">
                Dual entry under Rule 3.3b, a marker&apos;s attestation, the
                player&apos;s certification, and a tamper-evident seal over every
                figure. A result that holds up.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
