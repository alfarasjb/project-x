# Design

> Visual system for Project X. A dark-only "terminal": neutral cool near-black
> base, a calmed green accent as the primary voice, a small semantic color set,
> square corners, monospace throughout. See PRODUCT.md for the why.

## Color

OKLCH throughout. The base is near-neutral cool near-black (hue 250, chroma
≤ 0.008) so it reads as a neutral terminal, not a color wash. Green is the
primary accent; amber/teal/red carry meaning. Tokens live in
`src/app/globals.css` (`:root` and `.dark` are identical — dark-only).

| Role               | Token                     | Value                    | Use                                                                |
| ------------------ | ------------------------- | ------------------------ | ------------------------------------------------------------------ |
| Background         | `--background`            | `oklch(0.155 0.005 250)` | App base, deepest surface                                          |
| Surface +1         | `--card`                  | `oklch(0.185 0.006 250)` | Cards, panels, slide-over                                          |
| Surface +2         | `--popover`               | `oklch(0.205 0.007 250)` | Popovers, menus                                                    |
| Surface +3         | `--secondary` / `--muted` | `oklch(0.235 …)`         | Toolbars, quiet fills                                              |
| Hover/active fill  | `--accent`                | `oklch(0.27 0.01 250)`   | Row hover, active surface                                          |
| **Primary accent** | `--primary` / `--ring`    | `oklch(0.72 0.13 158)`   | Primary/high-priority actions, focus, selection. Calmed from neon. |
| Body text          | `--foreground`            | `oklch(0.93 0.005 250)`  | Calm near-white, legible                                           |
| Muted text         | `--muted-foreground`      | `oklch(0.7 0.012 250)`   | Secondary text, labels                                             |
| Critical           | `--destructive`           | `oklch(0.62 0.2 22)`     | Critical issues / destructive                                      |
| Warning            | `--warning`               | `oklch(0.8 0.15 75)`     | Amber — warning severity / caution                                 |
| Info               | `--info`                  | `oklch(0.76 0.1 195)`    | Teal — info severity / neutral highlight (not blue)                |

**Elevation = lightness, not shadow.** Surfaces step up in L (0.155 → 0.185 →
0.205 → 0.235).

**Discipline:**

- Green leads (actions / focus / selection). Amber, teal, red are semantic —
  meaning, never decoration. No other hues.
- Saturated accent colors are reserved for accents, actions, focus, large /
  interactive elements — never small body copy (it vibrates / fails contrast).
- Never state-by-color-alone (red/green colorblind): pair with icon/label/shape.

## Typography

**Monospace throughout** — the whole UI is JetBrains Mono (body, headings,
data, labels, buttons). This is the terminal signature, category-idiomatic for
a dev tool, not a decorative display face. `--font-sans` / `--font-display` /
`--font-mono` all resolve to JetBrains Mono; loaded via Google Fonts `<link>`
in `index.html`. Fixed rem scale (product register), tight ratio ~1.125–1.2.

## Shape & Radius

**Zero radius across the entire scale** (`--radius` and every `--radius-*` = 0).
Every `rounded-*` utility collapses to a hard 90° corner — square is the
identity. `rounded-full` (avatars, status dots) is intentionally exempt.

## Effects (surgical, never costume)

- **Glow** — `@utility glow-accent`: a green ring + bloom box-shadow at
  `oklch(0.72 0.13 158)`. The only place the accent leaves the flat plane.
  Reserved for high-priority actions (Crawl, Analyze hover) and focus.
- **Body atmosphere** — a faint corner vignette + ~2% neutral scanlines, static
  (no flicker), fixed to the viewport, decorative only.
- **Caret** — the QA-agent caret blinks in accent green like a live cursor.

## Motion

- 150–250 ms transitions; motion conveys state (hover, focus, slide-over,
  reveal), never decoration.
- **Reduced motion required:** every animation (caret blink, graph edge flow,
  the dashboard slide-over) has a `prefers-reduced-motion: reduce` fallback.

## Layout notes

- **Project dashboard:** an overview band (issue health + topology + Analyze)
  above a full-width issue feed; the issue detail panel is a right-edge
  slide-over (mounted, translated off-screen until selected) rather than a
  permanent column.

## Components

shadcn/ui primitives, re-themed via tokens — standard affordances preserved
(earned familiarity). The primary `Button` variant is electric green
automatically (it maps to `--primary`). Square corners everywhere.

## Accessibility

- WCAG AA: body ≥ 4.5:1, large/UI ≥ 3:1. Saturated accent reserved for
  large/accent so small text never rides full-saturation color.
- State never by color alone; pair with icon/label/shape.
