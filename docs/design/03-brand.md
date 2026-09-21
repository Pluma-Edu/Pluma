# Brand and design system

Source: the **Pluma Design System** export (`Pluma Foundations`, `Pluma Logo`,
`Pluma Worksheet Detail`, `Pluma Worksheet`, `Pluma Landing`, `Pluma Brand Deck`).
`support.js` in that export is the Claude Design canvas runtime, not product
code, and was not ported.

Tokens live in `src/app/globals.css` as Tailwind v4 `@theme` entries, so they
generate real utilities (`bg-paper`, `text-ink-muted`, `border-rule`) rather
than sitting in a variables file nobody reads.

## What the palette is actually for

Two properties are load-bearing rather than decorative, and both come straight
from the foundations file:

**Every colour declares the grey it becomes on a school copier.** This product's
main output is photocopied, usually twice. A palette that only works in colour
is not a palette for it.

**The performance scale carries meaning three times over** — lightness, glyph
and number. Lightness falls monotonically as mastery rises, so the ramp is
already a greyscale ramp; hue warms as scores drop, so the grid reads as a mood
at a glance; and the glyph and number carry it when neither is available. The
teacher grid renders all three (`src/lib/design/performance.ts`). Never render a
band by colour alone.

## Where I deviated, and why

| | design | here |
|---|---|---|
| Answer-key card | two variants, signed-out and signed-in | one variant. Rendering the signed-in card means reading the session, which makes the page uncacheable for the anonymous visitors it exists to serve. The copy is true either way and `/answer-key` sends a signed-in teacher straight to the file. |
| Band names | Secure / Proficient / Developing / Needs work | kept ours (secure / developing / shaky / needs help) and borrowed the ramp. Ours are defined by evidence thresholds in `skill_state`, not by a score range. |
| `stale` band | no equivalent | added. A static mock has no concept of evidence decaying; we do. Dotted border, no score colour — it is neither a score nor "no data". |
| Worksheet language | directions in Spanish | directions in English, matching what the PDFs actually contain. The preview must not describe a document that does not exist. |
| Printed mark | brand azure | ink. A copier turns azure into a mid grey that loses the feather's interior cut. |
| Fonts | Google Fonts `<link>` | `next/font`, self-hosted at build. A render-blocking font request is the most common reason a worksheet page is slow on school wifi, and the print renderer must never race a font load. |

## Not yet adopted

The teacher and student surfaces still use stock neutral utilities outside the
mastery grid. They read acceptably against the warm paper background, but they
are not on the token system, and `Pluma Landing` and `Pluma Brand Deck` have not
been implemented at all.
