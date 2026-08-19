---
name: Shimo
description: Tournament golf, beautifully run.
colors:
  clay: "#b84a2e"
  clay-deep: "#96371f"
  clay-wash: "#f1e0d8"
  ink: "#1a2332"
  ink-soft: "#414b5e"
  cream: "#f7f3ec"
  card: "#fffdf8"
  sand: "#ece5d6"
  muted: "#efe9dd"
  accent-wash: "#f0e9db"
  border: "#e4ddce"
  input: "#d9d1bf"
  stone: "#736d61"
  warm-grey: "#69655a"
  amber-flag: "#856010"
  amber-wash: "#f4ead2"
  red-flag: "#8e2a21"
  red-wash: "#f0dcd7"
  gold: "#9a7d2e"
  gold-deep: "#7c6320"
  gold-bright: "#c69a3a"
  gold-wash: "#f0e6cc"
  broadcast-ink: "#101722"
  clay-lift: "#d4744f"
  cream: "#f7f3ec"
typography:
  display-lg:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "34px"
    fontWeight: 400
    lineHeight: 1.05
    fontVariation: "opsz, SOFT"
  display:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "normal"
    fontVariation: "opsz, SOFT"
  headline:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.3
  standfirst:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.6
  body-lg:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 560
    letterSpacing: "0.14em"
  figure:
    fontFamily: "Fraunces, Georgia, 'Times New Roman', serif"
    fontSize: "17px"
    fontWeight: 400
    fontFeature: "tabular-nums lining-nums"
rounded:
  sm: "8px"
  md: "10px"
  control: "12px"
  surface: "16px"
  pill: "9999px"
spacing:
  tight: "8px"
  row: "12px"
  card: "16px"
  panel: "20px"
  section: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "40px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.ink-soft}"
  button-clay:
    backgroundColor: "{colors.clay}"
    textColor: "#ffffff"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "40px"
  button-clay-hover:
    backgroundColor: "{colors.clay-deep}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "40px"
  button-outline-hover:
    backgroundColor: "{colors.accent-wash}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 20px"
    height: "40px"
  input-field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    height: "40px"
    typography: "{typography.body}"
  badge-clay-soft:
    backgroundColor: "{colors.clay-wash}"
    textColor: "{colors.clay-deep}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    typography: "{typography.label}"
  badge-amber:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber-flag}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  card-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "24px"
  tab-pill-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.cream}"
    rounded: "{rounded.pill}"
    padding: "0 14px"
    height: "36px"
---

# Design System: Shimo

## Overview

**Creative North Star: "The Returned Card"**

A golf scorecard is not a form. It is a document: kept by a marker, attested,
signed, returned, and filed. It is printed on warm paper, filled in with ink,
and marked in one other colour only when something happened. Shimo behaves the
same way. Every surface is a record being kept properly, and the interface
carries itself like a document rather than an application.

That metaphor explains nearly every decision in the system without needing a
rule for each one. The paper grain over every surface. Cream rather than white,
because paper is not white. Navy rather than black, because ink is not black.
Tabular figures everywhere, because a column of numbers in a document lines up.
Circles and squares around scores, because that is how a card has been marked
for a century and no member needs it explained. And a single terracotta, used
about as often as a starter reaches for the red pencil.

The system is deliberately unhurried. It is read in direct sunlight, on a
mid-range phone, over four hours, and then on a television across a room for
four more. Nothing in it competes for attention, because attention here is
scarce and already spent on the golf. Brand lives in precision rather than in
volume: the exact figure, aligned, in the right weight, unmoving.

**Key Characteristics:**

- Warm paper ground, navy ink, one red mark
- Editorial serif for anything a person reads; sans for anything they scan
- Tabular numerals without exception on scores, positions and totals
- Flat at rest, with depth reserved as a response to the user
- Motion that answers immediately and settles slowly, or is absent entirely
- Classic scorecard notation preserved rather than reinvented

## Colors

A warm paper ground carrying navy ink, with exactly one accent and a small set
of flags that only appear when a state genuinely demands attention.

### Primary

- **Burnt Terracotta** (`{colors.clay}`): the only accent in the system. The
  leader on a board, live status, the primary action, the ring around a birdie,
  the club's own colour when they have not set one. Its scarcity is the point.
- **Terracotta Deep** (`{colors.clay-deep}`): pressed and hovered states of the
  accent, and accent text on pale washes where the base tone would fail contrast.
- **Terracotta Wash** (`{colors.clay-wash}`): the palest accent tint. Selection
  highlight, soft badges, the momentary confirmation after a score commits.

### Neutral

- **Deep Navy Ink** (`{colors.ink}`): all primary text, the dark button surface,
  and the shadow hue. Never pure black. Ink on paper is blue-black.
- **Soft Ink** (`{colors.ink-soft}`): secondary text and the hover state of the
  dark button. Present, quieter.
- **Cream** (`{colors.cream}`): the page. Warm, low glare, readable in sun.
- **Card** (`{colors.card}`): the sheet resting on the page. Barely lighter than
  cream, which is the whole trick: separation without a border.
- **Sand** (`{colors.sand}`): grouped rows, tab tracks, and the foot of a poster.
- **Accent Wash** (`{colors.accent-wash}`): the quiet hover fill on menu rows and
  ghost buttons.
- **Border** (`{colors.border}`) and **Input** (`{colors.input}`): hairlines and
  field strokes, both warm rather than grey.
- **Stone** (`{colors.stone}`) and **Warm Grey** (`{colors.warm-grey}`): muted
  labels, disabled figures, and any text that must recede without disappearing.

### Tertiary

Three flags, and no more. Each means one thing.

- **Amber Flag** (`{colors.amber-flag}`) on **Amber Wash**
  (`{colors.amber-wash}`): something needs a human. A marker discrepancy, a held
  announcement, an incomplete card.
- **Red Flag** (`{colors.red-flag}`) on **Red Wash** (`{colors.red-wash}`):
  something is wrong or destructive. Disputes, deletion, failure.
- **Gold** (`{colors.gold}` / `gold-deep` / `gold-bright` / `gold-wash`): the
  champion and the winner. Elevated from an icon-only tint into a real second
  accent, but a scarce one: it marks the exceptional (the champion podium, a
  division winner, a course record), never the everyday. Terracotta still rules
  the ordinary screen under the Red Pencil Rule; gold answers only to a result
  that has been won. `gold-bright` is the leaf itself, for large figures and
  seals on the navy ground; `gold` and `gold-deep` carry text on paper.

### The broadcast ground

- **Broadcast Ink** (`{colors.broadcast-ink}`): the one dark surface in the
  system, used by the clubhouse screen alone. A television in a lit room needs a
  dark ground; every other surface in Shimo is paper.
- **Cream** (`{colors.cream}`) is also named in its own right, for the places
  where it is not the page: a label on a terracotta button, text on the navy
  rail, a row on the clubhouse screen.
- **Terracotta Lift** (`{colors.clay-lift}`): the accent for a dark ground. The
  base clay measures 3.47:1 on broadcast ink, which is legible on an actual
  television, where every figure is large text, and not legible anywhere the
  same surface is drawn small. This tint is 5.49:1. It is the same colour a
  shade further up, not a second accent, and it never appears on paper.

### Named Rules

**The Red Pencil Rule.** One mark per card. Terracotta appears where something
is true and consequential: the leader, the live state, the primary action, the
ring around a birdie. Never as decoration, and never twice competing on one
screen. If two things on a screen are terracotta, one of them is wrong.

**The No-Black Rule.** There is no `#000000` and no `#ffffff` in this system.
Text is navy ink, ground is cream, and every shadow is tinted with the ink hue
rather than with black. A pure value anywhere is a bug.

**The Three Flags Rule.** Amber means a human is needed. Red means wrong or
destructive. Gold means champion. A new colour requires a new meaning, and there
are no new meanings.

**The Legible Quiet Rule.** Every muted tone in this system is set so that it
clears 4.5:1 on cream, on card and on sand alike, and none of them is ever
given an opacity modifier on top. `text-muted-foreground/60` is not a quieter
label, it is an illegible one: the token is already the quiet step, and
stacking transparency on it is how small print silently falls below AA. Gold is
the one exception and is an icon colour only, where the 3:1 threshold applies.
Verified by measurement across every route, not by eye.

## Typography

**Display Font:** Fraunces (variable, `opsz` and `SOFT` axes), falling back to
Georgia and Times New Roman
**Body Font:** Inter, falling back to the system sans stack

**Character:** A soft-edged editorial serif against a neutral, highly legible
sans. Fraunces carries anything a person reads and anything that should feel
like a result: names, headlines, scores, totals. Inter carries anything a person
scans: labels, controls, metadata, small print. The pairing is what makes a
scoring grid read as a document rather than a spreadsheet.

### Hierarchy

- **Display** (Fraunces, amplified, line-height ~1.0, tracking -0.012 to
  -0.018em, weight 500): page titles and the subject of an announcement, given
  their full editorial weight. On the desk they run fluid, `clamp(34px, 4.4vw,
  46px)` for a section index and `clamp(30px, 3.6vw, 40px)` for a page within
  it, so a heading fills a wide desk without a fixed cap. The landing hero goes
  further still, to `clamp(46px, 8vw, 88px)`. The phone, capped at 430px, uses
  fixed steps rather than viewport units, so a heading never oversizes when the
  column sits on a large screen: **38px** for the home greeting, **32px** for a
  board or index. The in-round golfer screens hold at **24px**, where density is
  the point and legibility of the score outranks the size of its title. A tight
  negative tracking on the large sizes is what keeps Fraunces from loosening as
  it grows.
- **Headline** (Fraunces, 22px): section and card titles.
- **Title** (Fraunces, 17px): the most common serif size in the system. Row
  headings, player names, panel titles.
- **Standfirst** (Fraunces, 19px, line-height 1.6): the serif paragraph that
  introduces a page or a section. Long enough to be read as prose, large enough
  to be read before the body text under it.
- **Body Large** (Inter, 15px, weight 500): the label of a large control, one step
  up from body text for a target that must read as the primary action on its
  screen.
- **Body** (Inter, 14px, line-height 1.55): prose, descriptions, help text.
- **Label** (Inter, 11px, weight 560, letter-spacing 0.14em, uppercase): the
  `.smallcaps` class. Section eyebrows and field labels.
- **Figure** (Fraunces with `tabular-nums lining-nums`): every score, position,
  total and stroke count.

### Named Rules

**The Tabular Rule.** Any number that appears in a column, or that a reader will
compare against another number, uses tabular figures. Scores, positions,
handicaps, totals, times. A proportional digit in a scoring column is a defect,
not a preference.

**The Serif Carries the Result Rule.** Fraunces is for what happened: the name,
the score, the total, the title. Inter is for the apparatus around it: what
things are called, what a control does, what state something is in. When unsure,
ask whether the text is the outcome or the label for it.

## Layout

Two distinct spatial models, because the two primary surfaces are read from
different distances.

**Phone and desk (Operate).** A standard fluid layout on Tailwind's default
breakpoints (`sm` 640, `md` 768, `lg` 1024, `xl` 1280). The golfer app is
built mobile-first and constrained to a 430px column so it holds its proportions
when installed to a home screen; the admin desk is desktop-first with a fixed
navigation rail and a fluid working area. Rhythm is the 4px base: 8px inside a
row, 16px inside a card, 20-24px inside a panel, 24px between sections.

Density rises where the task demands it. The desk scoring grid is deliberately
tighter than anything else in the product, with frozen player and total columns
and 18 hole columns between them, because a caddymaster entering forty cards
needs the whole field visible more than they need air.

**Television (broadcast).** The clubhouse screen abandons pixels entirely.
Everything is sized in `cqw` against a single container query on the root, so
one composition holds from a 720p projector to a 4K panel with no breakpoints
at all. This is verified rather than assumed: the title measures 2.700% of
viewport width at 1280, 1920 and 3840 alike.

### Named Rules

**The One Container Rule.** The television has no breakpoints. If a value on a
broadcast surface is expressed in pixels, it is wrong. A clubhouse screen is
whatever the club already owns, and asking which one has never produced a useful
answer.

## Elevation & Depth

**Paper on paper, lifting when it responds.** The ground is not a flat screen
colour: it carries a faint paper grain, a fixed film under the chrome and well
below any dialog, so cream reads as stock rather than fill. A sheet rests on
that ground with a gentle, real lift (the amplified shadow-card), enough to
separate as paper on paper; depth then answers the user on top of that, a card
rising further under the cursor, a dialog arriving above the page, a menu
separating from what it covers. Where separation is needed without interaction,
the system still reaches first for a tonal step between cream, card and sand.
Every shadow stays tinted with the ink hue, never black.

Every shadow is tinted with the ink hue (`rgb(26 35 50 / …)`) rather than with
black, so it reads as paper shading rather than as a drop shadow floating over a
background.

### Shadow Vocabulary

- **Card** (`0 1px 2px rgb(26 35 50 / 0.04), 0 6px 20px rgb(26 35 50 / 0.06)`):
  a sheet at rest on the page. The lightest step in the system.
- **Lift** (`0 2px 4px rgb(26 35 50 / 0.06), 0 12px 32px rgb(26 35 50 / 0.1)`):
  the hovered state of anything that is also a link or a target.
- **Pane** (`0 1px 0 rgb(26 35 50 / 0.03), 0 16px 48px rgb(26 35 50 / 0.08)`):
  dialogs and anything that covers the page. Wide, soft, and clearly above.

### Named Rules

**The Tinted Shadow Rule.** No shadow in this system uses black. Every one is
mixed from the ink hue. A neutral grey shadow on a warm ground reads as dirt.

## Shapes

Three tiers of corner, assigned by what a thing is rather than by how large it
is. The tiers exist so that a control never looks like a surface, which is the
distinction that makes an interface read as designed rather than assembled.

- **Pill** (`{rounded.pill}`): badges, status dots, avatars, tab pills, the
  toggle. Anything round on purpose.
- **Surface** (`{rounded.surface}`): cards, panels, dialogs, sheets. Anything you
  put content on.
- **Control** (`{rounded.control}`): buttons, inputs, selects. Anything you
  touch. Steps down to `{rounded.sm}` at small sizes, where the control radius
  reads as too generous against a shorter edge.

Borders are hairlines in warm tones (`{colors.border}` on surfaces,
`{colors.input}` on fields), never grey, and never doubled: a bordered surface
does not also carry a resting shadow.

### Named Rules

**The Scorecard Notation Rule.** A score is marked the way a card is marked. One
ring for a birdie, two for an eagle or better, one box for a bogey, two for
worse. Terracotta on the rings, stone on the boxes, and nothing at all on a par.
This is a century-old convention that every golfer already reads, and it is not
to be replaced with colour coding, arrows, or plus and minus signs.

## Components

Character across the whole set: **precise and unhurried**. Tight radii, exact
spacing, nothing bouncy. A control answers the finger immediately and settles
slowly. Confidence through accuracy rather than through weight.

### Buttons

- **Shape:** control radius (12px), stepping to 8px at small size and 16px at
  large. Height 40px default, 32px small, 48px large.
- **Primary:** navy ink ground, cream label. Hovers to soft ink.
- **Clay:** the accent action. One per screen at most, under the Red Pencil Rule.
- **Outline / Secondary / Ghost:** transparent or sand ground with a warm
  hairline, hovering to the accent wash.
- **Press:** every variant compresses to 97% over 120ms. Scale rather than a
  downward nudge, so the label and icon travel with the control and it moves as
  one object. The link variant is the sole exception: it is text, and text does
  not compress.
- **Transitions** name their properties. `transition: all` is not used anywhere
  in this system.

### Badges

- **Style:** pill, 11px, tracked, with a hairline in a tint of its own colour
  rather than a neutral.
- **Variants:** solid navy, solid clay, soft clay, sand, outline, amber, red.
  Amber and red follow the Three Flags Rule and never appear decoratively.

### Cards and Containers

- **Corner:** surface radius (16px).
- **Background:** card (`{colors.card}`) on the cream page. The separation is
  tonal, roughly two percent of lightness, and deliberately almost invisible.
- **Shadow:** the card step at rest where the card is a target, none where it is
  merely a container. Hover raises to lift.
- **Padding:** 16px on a compact row, 20-24px on a panel.

### Inputs and Fields

- **Style:** card ground, warm hairline stroke, control radius, 40px high.
- **Focus:** the stroke shifts to a 50% terracotta and a 2px ring at 25% opacity
  appears outside it. No glow.
- **Label placement:** always above the field, never inside it. Placeholder text
  is an example, never a label.

### Navigation

- **Admin:** a fixed navy rail, cream labels at 15px, the active item carried on
  a raised sand block.
- **Golfer:** a bottom tab bar of five items, icon over an 11px label, the active
  item in terracotta.

### The default transition

Tailwind's own default is 150ms on its `ease` curve, and it is what every bare
`transition-colors` in a codebase silently inherits. It is close enough to the
system's 160ms that nobody notices the duration and far enough from
`--ease-out` that the interface loses the arrive-fast-settle-slow character
the token block exists to create. So the default itself is set to
`--dur-hover` and `--ease-out`, and the whole product moves on one curve
without naming it at sixty call sites. Name the duration explicitly only where
a component departs from the default.

### Tabs

The selected pill travels between triggers rather than appearing and vanishing.
It is a shared element on a spring (`stiffness 420, damping 36, mass 0.7`)
rather than a duration, because a tab set is the one control a person clicks
twice in a second, and a spring keeps its velocity when interrupted: the second
click redirects the pill from wherever it has reached instead of restarting it
from a tab it never arrived at.

### Score Cell (signature)

The component that most defines the system. A single gross figure, marked in
classic card notation: a terracotta ring for a birdie, a double ring for an
eagle or better, a stone box for a bogey, a double box for worse, and no
decoration at all on a par. 24px square, tabular figure, centred.

### Clubhouse Board (signature)

The television surface. Broadcast ink ground under a two-layer scrim weighted
downward, so a club's own photograph stays legible as a photograph at the top of
the frame while text below sits on a field dark enough to read against. Ten rows
at a time; the field scrolls only when it does not fit, and rows dissolve at the
top and bottom edges rather than being cut by them.

## Do's and Don'ts

### Do:

- **Do** use tabular figures (`.tnum`) on every score, position, total and time.
- **Do** tint every shadow with the ink hue, never with black.
- **Do** give every interactive control a press state. A ghost button that does
  not answer the finger reads as not having heard.
- **Do** name transition properties explicitly rather than using `all`.
- **Do** size broadcast surfaces in `cqw` against the root container query.
- **Do** put field labels above their input.
- **Do** let a menu grow from the control that opened it, using the Radix
  transform-origin variable. Dialogs are the exception and stay centred, because
  they are anchored to nothing.
- **Do** reach for a tonal step between cream, card and sand before reaching for
  a shadow.

### Don't:

- **Don't** use pure black or pure white anywhere.
- **Don't** put two terracotta elements in competition on one screen.
- **Don't** animate an action a person performs hundreds of times. The desk
  score cell acknowledges a commit instantly and fades over 300ms; it does not
  perform.
- **Don't** replace scorecard notation with arrows, plus-minus signs, or a colour
  scale. Golfers already read circles and squares.
- **Don't** reach for sports broadcast language. No neon, no outer glow, no
  gradient swooshes, no chunky drop shadows, no scorebug. The clubhouse screen is
  editorial, and this is a binding anti-reference.
- **Don't** reach for generic SaaS language either. No purple-blue gradient hero,
  no row of three identical feature cards, no glassmorphism, no default sans on
  slate. This is the second binding anti-reference, and it is what most golf
  software already looks like.
- **Don't** use em dashes in any user-facing string.
- **Don't** show a player's worst moments in public. No triple bogeys, penalties
  or disqualifications on the clubhouse screen, and no correction that implies an
  earlier celebration was wrong.
- **Don't** let a decorative overlay block input. Anything covering the page that
  a person never needs to click is `pointer-events-none`.
