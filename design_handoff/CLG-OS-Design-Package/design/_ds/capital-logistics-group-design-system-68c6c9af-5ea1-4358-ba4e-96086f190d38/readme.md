# Capital Logistics Group — Design System

Capital Logistics Group (CLG) is a Jacksonville, Florida trucking and logistics carrier. Its
positioning line is **"Dedicated & Driven to Deliver"** — it appears on trailer wraps as the
company's public promise. The brand presents itself as authoritative, patriotic, and dependable:
a royal-blue/navy core, a scarlet accent, and a five-point star mark applied at scale across
tractors, trailers, signage, and print collateral.

Two identities live in the same system:

- **Capital Logistics Group** — the corporate/parent lockup (star + `CAPITAL` wordmark with
  `LOGISTICS GROUP` beneath). Used on trailers, letterhead, signage.
- **CLG Transportation** — the operating/fleet lockup (star + `CLG` with a smaller line beneath).
  Used on tractor doors and as the compact/secondary mark.

## Sources given to me

| Source | What it is | Notes |
| --- | --- | --- |
| `uploads/CapitalLogistics_VisualBrandGuide.pdf` | 19-page Visual Brand Guide, © 2023 Capital Logistics Group, published June | Sole source of truth for this system. Sections: Colors (p.3), Logos (p.7), Icons (p.17), Typography (p.21), Imagery (p.25), Usage (p.29), Brand In-Use (p.33) |
| `uploads/Montserrat-Regular.otf` | Heading typeface, regular weight | Shipped in `assets/fonts/` |
| `uploads/Poppins-Regular.otf` | Body typeface, regular weight | Shipped in `assets/fonts/` |

**No codebase, Figma file, website, or slide template was provided.** There is therefore no
product UI to recreate faithfully. Everything in `components/` and `ui_kits/` is built from the
brand guide's rules and the collateral it depicts — see "What is extrapolated" below.

Every colour hex, every logo path, and the heading size ladder in this system were read
programmatically out of the PDF's own vector art and text metrics, not eyeballed from a
screenshot. Values are exact.

### Missing / requested

- `Primary_3Color.png` and the full Montserrat + Poppins families were listed in the original
  upload but did not arrive. Missing binaries: **Montserrat Bold, Poppins Italic, Poppins Bold,
  Poppins Bold Italic** — all four are named in the guide. They currently load from Google Fonts
  (same families, so metrics match); drop the `.otf` files into `assets/fonts/` and add the
  matching `@font-face` rules in `tokens/fonts.css` to remove the CDN dependency.
- The guide references a metal-texture background ("low-contrast metal textures") and web icon
  artwork (Metro tiles, Safari tab, favicon) that are rendered as page mockups rather than
  placed images, so they could not be extracted. Send the source files if they should live here.

---

## CONTENT FUNDAMENTALS

The brand guide contains little running copy, so the voice below is drawn from the wordmarks,
the tagline, the guide's own section prose, and the collateral it shows. Where a rule is an
extension rather than a quotation, it is marked *(inferred)*.

**Voice.** Plain, declarative, operational. Statements of capability, not persuasion. The guide
describes its own colours the way an operator would describe equipment — "trustworthy and
steady", "authoritative and regal", "perfect for accents and CTAs". Short sentences. No hedging.

**Casing is the loudest voice cue.** The brand shouts in tracked uppercase and speaks in
sentence case:

- Tagline, on-vehicle and on-cover: `DEDICATED & DRIVEN TO DELIVER` — uppercase, italic, tracked.
- Section and eyebrow labels: `PRIMARY PALETTE`, `LOGO CLEARSPACE`, `BRAND IN-USE`, `FEATURE
  IMAGERY` — uppercase with wide letterspacing (~0.18em).
- Body copy and letters: normal sentence case, e.g. "We love the look of this stationery…",
  "Dear Recipient:".

**Ampersands.** The tagline uses `&`, not "and" — keep it in short display lines.

**Person.** Third person for the company ("CLG's active fleet"), second person for the reader in
correspondence ("your own personal touch"). Avoid first-person plural marketing ("we're
passionate about…") — the guide's own prose never does this. *(inferred)*

**Numbers and identifiers are shown, not hidden.** Fleet copy carries real operational data:
tractor number `3303`, trailer number `100096`, DOT/MC/KYU/VIN plates on the door. When you need
specificity in a mock, use plausible operational identifiers rather than lorem placeholders.

**Emoji: never.** None appear anywhere in the guide, and they would undercut the patriotic,
industrial register. Do not use them.

**Vibe.** American highway freight — dawn light on chrome, flags-and-stars patriotism, quiet
authority. Confident but not swaggering; the mark does the shouting, the sentences stay level.

**Copy examples in-brand:**

- Eyebrow / label: `FLEET CAPABILITY`
- Display line: `Dedicated & Driven to Deliver`
- Body: "Every load moves on a dedicated tractor with a named driver. Dispatch stays on the same
  phone number from pickup to delivery."
- CTA (link style): `Click Here To Learn More` — this exact title-case link phrasing is the
  guide's own hyperlink specimen (p.21).

Avoid: exclamation marks, superlatives ("world-class", "best-in-class"), startup register
("supercharge", "seamless"), and any lowercase-only styling of the wordmarks.

---

## VISUAL FOUNDATIONS

### Colour

Primary palette (p.3) — four colours, two blues and two reds:

| Name | Hex | CMYK | Role per the guide |
| --- | --- | --- | --- |
| Royal | `#1155A1` | 96/75/4/0 | "An authoritative and regal blue leads the primary color palette" |
| Navy | `#223B62` | 96/81/36/25 | "Trustworthy and steady… underscores the brand's core value" |
| Scarlet | `#EB2127` | 1/99/97/0 | "Vibrant and patriotic… perfect for accents and CTAs" |
| Ruby | `#BE202E` | 18/100/91/8 | Accent shade that "underscores and emphasizes vital messaging" |

Neutral palette, dark to light: Granite `#485767`, Pewter `#5A6D80`, Cool `#7A8B99`,
Mercury `#A3BACB`, Moon `#BFD3E1`, Reflection `#DAE7F1`, Smoke `#E7EDF1`, White `#FFFFFF`.
Every neutral is a *blue* grey — none are neutral-warm. Do not introduce a warm or pure grey.

Working rules:

- Blue carries structure (headers, large fields, wordmark); red carries attention (CTAs, rules,
  the star's leading arm). Red is never a background for long copy.
- Body copy sits in Granite `#485767` on white — the guide's own typography page sets specimens
  in Granite, not black. Pure black is not a brand colour.
- Headings in Navy; brand emphasis in Royal.
- Links: Ruby `#BE202E` at rest, Scarlet `#EB2127` on hover/active (the guide's "Hyperlink" and
  "Active Hyperlink" specimens, p.21).
- One accent colour per surface. A page with a scarlet CTA does not also get ruby rules.
- The PDF's Ruby swatch renders `#BD202E` while its stated RGB is 190/32/46 → `#BE202E`. This
  system uses `#BE202E`.

### Gradient

The guide ships one gradient plate (p.25): a diagonal navy-to-royal blend, dark at the
bottom-left corner (`#0B1B32`) opening to a brighter royal at the top-right (`#29459B`).
Tokenised as `--clg-gradient-brand`. Use it as a full-bleed field behind reversed lockups and
display type. It is a *dark* gradient — never place Granite body copy on it.

### Type

Montserrat for headings, Poppins for body copy (p.21). Both are geometric sans faces; the
pairing is deliberately low-contrast, so hierarchy comes from size and case, not from mixing
personalities.

The guide's own ladder, in points: H1 40 · H2 36 · H3 30 · H4 24 · H5 18 · tracked caps
"HEADING" 14. Body specimens are set at 15. The guide names **Montserrat Regular and Montserrat
Bold** for headings and **Poppins Regular / Italic / Bold / Bold Italic** for body — it does not
state which weight belongs to which heading level. This system assigns Bold to H1, H2 and H5,
Regular to H3 and H4, matching how the guide's own pages are set *(interpretation — adjust if
the brand team has a rule)*. Line-heights (1.05 display / 1.18 heading / 1.6 body) and tracking
are likewise this system's choices.

The wordmark is a heavy italic condensed face with a hard forward slant; it is **art, not type**.
Never re-set "CAPITAL" or "CLG" in Montserrat — use the SVG lockups.

### Logo & clearspace

Clearspace equals **half the wordmark height** on all four edges (p.29). One documented
exception: "The icon's top, left, and bottom right points are permitted to eclipse the clear
space" — the star's arms may break the margin.

Disapproved (p.29), verbatim: never squish, skew, or rotate the logo; always observe proper
contrast ratios; never alter the orientation of elements within a mark; always observe proper
margins.

Reverse lockups exist for dark fields: the wordmark and the star's contrast points go white
while the star's leading arm stays scarlet/ruby.

### Imagery

Three image categories, per the guide:

1. **Feature imagery** — "kinetic and static fleet shots… the most straightforward method to
   convey scale, agility, and dependability." Real tractors and trailers, shot low, wide, and
   full-bleed. Colour vibe: cool blue metal against warm dawn/dusk sky; high chrome specular
   highlights; no grain, no filters, no black-and-white.
2. **Background imagery** — "low-contrast metal textures that allow higher contrast copy and
   imagery over the top." Texture is a substrate, never a subject.
3. **Textures** — a tone-on-tone tiled star pattern, "reserved for empty spaces that could
   benefit from a bold wash of color with minimal imagery." Shipped as
   `assets/img/pattern-stars-ruby.png`: ruby field, slightly lighter stars, and a single
   light-blue star as the accent.

Photography is always full-bleed or edge-anchored, never a floating rounded thumbnail.

### Layout motifs

- **Oversized star, cropped by the edge.** The letterhead (p.33) places a huge two-tone star
  bleeding off the bottom-right corner at low contrast. This is the brand's signature empty-space
  device: scale the mark up past the trim and let the frame cut it.
- **Corner discipline.** Logo top-left, contact/meta block top-right in small tracked caps,
  content in a single left-aligned column.
- Left-aligned everything. No centred body copy.
- Generous white space; the guide's own pages run wide margins with one idea per spread.

### Surfaces, borders, radii

The brand reads angular — an angular star, an italic wordmark, squared collateral. Radii stay at
**0–4px**; `--clg-radius-pill` exists only for small status chips. Cards are white on Smoke,
separated by a hairline in Moon `#BFD3E1` rather than by a heavy shadow. Where emphasis is
needed, lead the card with a 4px Scarlet rule (`--clg-rule-accent`) rather than a coloured
left border on a rounded box.

Shadows are navy-tinted and shallow (`--clg-shadow-sm/md`); the deep drop shadows in the guide
are print-mockup artifacts, not a brand elevation system. *(inferred)*

### Transparency, blur, protection

Copy over photography gets a **navy scrim**, not a black one: `--clg-scrim-navy` (a 92%→0%
horizontal navy wash) or `--clg-scrim-bottom`. Reversed lockups need the scrim to satisfy the
guide's "always observe proper contrast ratios" rule. Blur (`--clg-blur-panel`) is reserved for
panels floating over fleet photography and used sparingly — the guide shows none.

### Motion, hover, press

The guide is print-first and specifies no animation. Defaults here are deliberately restrained:
120/180/280ms with `cubic-bezier(.2,.7,.3,1)`. Fades and short translations only — no bounce, no
overshoot, no spring. *(inferred)*

- **Hover:** shift to the adjacent brand colour rather than tint or fade — Scarlet→Ruby on
  primary buttons, Royal→Navy on secondary, Ruby→Scarlet on links. Quiet/ghost controls take a
  Smoke wash.
- **Press:** darken one more step and drop the shadow; no scale-down.
- **Focus:** 3px Royal ring at 35% (`--clg-focus-ring`).
- **Disabled:** Moon background, Cool text — never opacity alone.

---

## ICONOGRAPHY

**The star is the only proprietary icon.** The guide's "Icons" section (p.17) is entirely about
the star mark at applied sizes — web icons (144px Metro Large, 114px Metro Wide, 72px Metro
Medium, 57px Safari Touch Bar, browser favicon, Safari Tab) and standalone icons (3-Color
Standard, 3-Color Reverse, 1-Color Light Standard/Reverse, 3-Color Light Standard/Reverse). It
defines **no UI icon set** — no glyph library, no icon font, no sprite sheet.

Shipped star assets: `assets/mark-star.svg` (royal contrast points) and
`assets/mark-star-white.svg` (white contrast points), both with the scarlet/ruby leading arm.
These are the extracted vector paths from the guide, not redraws.

For interface glyphs (chevrons, close, search, truck, package) the brand supplies nothing, so
this system uses **Lucide** from CDN — 2px round-cap outline geometry, which sits closest to the
guide's clean industrial feel — wrapped by the `Icon` component. **This is a substitution, not a
brand asset.** If CLG has a real icon set, replace it and drop the CDN link.

Unicode characters are not used as icons. Emoji are never used.

---

## Index

Root

- `styles.css` — the single entry point; `@import`s everything below.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `surface.css`,
  `motion.css`, `semantic.css`, `base.css`.
- `assets/` — `logo-primary.svg`, `logo-reverse.svg`, `logo-white.svg`, `logo-clg.svg`,
  `logo-clg-reverse.svg`, `mark-star.svg`, `mark-star-white.svg`, `fonts/`, `img/`.
- `thumbnail.html` — homepage tile.
- `SKILL.md` — portable skill wrapper for Claude Code.
- `scraps/` — extraction working files and reference crops from the PDF. Not part of the system.

`assets/img/` — `fleet-sunset.png`, `fleet-sunset-wide.png` (tractor-trailer at dawn),
`fleet-front.png` (tractor head-on, rail crossing), `signage-window.png` (etched window lockup),
`gradient-blue.png` (the guide's gradient plate), `pattern-stars-ruby.png` (tiled star texture).

Guidelines / specimen cards — `guidelines/*.card.html`, grouped as Brand, Colors, Type, Spacing.

### Components

- `components/brand/` — **Logo**, **StarMark**, **Eyebrow**
- `components/actions/` — **Button**, **IconButton**, **Link**, **Icon**
- `components/forms/` — **Field**, **Input**, **Select**, **Checkbox**, **Radio**, **Switch**
- `components/display/` — **Card**, **Badge**, **Divider**, **StatBlock**, **Table**, **Alert**

19 components in four groups, each with a `.d.ts` props contract and a `.prompt.md` usage note.

UI kits — **not yet built.** `ui_kits/collateral/` (letterhead, business card, folder cover —
recreations of the guide's Brand In-Use spread, p.33) and `ui_kits/web/` (marketing surfaces)
are planned; nothing has been authored yet.

### What is extrapolated

The brand guide defines colour, type, logo, imagery, and usage. It does **not** define a UI
component library, a website, or an application. So:

- `components/` is a from-scratch primitive set, styled strictly from the guide's tokens.
- Planned `ui_kits/collateral/` will be a faithful recreation of artifacts the guide depicts.
- Planned `ui_kits/web/` would apply the brand to web surfaces the guide implies (it specifies
  favicons, Metro tiles, and hyperlink states) but does not show — a proposal, not a record of
  an existing site.

#### Intentional additions

- `Icon` — a wrapper around the substituted Lucide set, so a real CLG glyph set can be swapped
  in one place later.
- `StarMark` / `Logo` — thin components over the extracted SVG assets, enforcing the
  half-wordmark clearspace rule automatically.
