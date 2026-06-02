# Product

## Register

product

## Users

Developers and engineering leads working on a real codebase — reading dense
architecture data (graph nodes, import edges, audit issues) in deep-focus
sessions. A second consumer is AI coding agents, which read the same graph
through the MCP server. The human is usually mid-task: inspecting how the
codebase is actually wired versus how it was intended to be.

## Product Purpose

Project X is an Architectural Co-Pilot. A ReactFlow canvas captures _intended_
architecture; a ts-morph parser produces the _actual_ graph from the code; the
divergence between them is surfaced as drift. An MCP server lets AI agents read
the graph and propose changes. Success: developers trust the graph enough to
catch architectural drift early and steer large changes from it.

## Brand Personality

A precision instrument with attitude. Three words: **technical, electric,
disciplined.** It should feel like a real operator's console — confident,
high-signal, a little underground — not a friendly consumer SaaS app. Cyberpunk
in palette, restrained in execution.

## Anti-references

- **Default shadcn / "vibe coded."** Untouched neutral-gray shadcn, default
  radius, zero accent, the "every AI app looks like this" sameness. This is the
  exact problem we're fixing.
- **Costume / gimmicky terminal.** Heavy CRT scanlines, flicker, and glow piled
  on until it's a theme-park ride that fights the legibility of dense data.
  Lean into the vibe, stay a usable tool.
- **Generic SaaS dark mode.** The safe purple/blue-accent dark dashboard
  (Linear-clone). We want terminal character, not another dark template.
- **Cluttered / loud.** Many competing colors, heavy chrome, visual noise.

## Design Principles

1. **Green leads; color carries meaning.** The green accent is the primary
   voice (actions, focus, selection). A small disciplined semantic set —
   amber = warning, teal = info, red = destructive — carries state. No
   decorative color beyond meaning; the base stays quiet near-black.
2. **Instrument, not costume.** Terminal character serves the data. Effects
   (glow, vignette, faint scanlines) are surgical — focus and active states,
   not everywhere — and never cost legibility.
3. **Earned intensity.** Spend contrast and glow only where action matters:
   primary/high-priority actions (Crawl, Analyze), focus rings, active state.
   Everything else recedes.
4. **High signal, low chrome.** The graph and the data are the hero; chrome
   drops back toward the background so the content reads first.
5. **Reject the category reflex.** Don't land on the obvious "AI dev tool →
   SaaS dark" answer, or its second-order trap. The terminal direction is the
   deliberate anti-reflex; keep it specific.

## Accessibility & Inclusion

- **WCAG AA contrast.** Body text ≥ 4.5:1, large/bold ≥ 3:1. Neon-green-on-black
  vibrates and can fail at small sizes — body text stays a calm off-white/light
  green, with saturated neon reserved for accents and large elements. Verify,
  don't eyeball.
- **Never state-by-color-alone.** Green is the brand and also reads as "go";
  destructive is red. Pair every state with an icon, label, or shape so
  red/green colorblind users aren't stranded.
- **Reduced motion is required.** Every scanline / glow-pulse / flicker /
  caret has a `prefers-reduced-motion: reduce` fallback (static or crossfade).
