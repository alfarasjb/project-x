---
name: handoff
description: >-
  Write a Project X session handoff — a dated bridge note so a fresh session or
  teammate can pick up exactly where this one left off. Use when the user asks
  to "create/write a handoff", "hand off", or wrap up a session.
---

# Session Handoff

Produce a handoff document that summarizes the session, the current state of
the work, and what to do next — concise enough to read in a minute, complete
enough to resume cold.

## Steps

1. **Get the timestamp.** Run `date "+%Y-%m-%d-%H%M"`. If the system clock's
   year looks wrong, trust the date from the session context for the date part
   and take only the time-of-day from `date`.
2. **Read for continuity.** Read `MEMORY.md` and the most recent existing
   `.internal/handoff*.md` — match their structure and don't repeat what's
   already durably recorded.
3. **Write a NEW file** at `.internal/handoff-<YYYY-MM-DD-HHMM>.md`. The
   timestamp keeps every handoff unique — never overwrite or delete an existing
   handoff; they're an append-only trail.
4. Keep it tight. A bridge note, not a transcript — link to `MEMORY.md`,
   `CLAUDE.md`, the PRD, and the prior handoff rather than restating them.

## Structure

Use these sections (drop any that don't apply):

- **Read first** — pointers: `MEMORY.md`, the prior handoff, `README.md`,
  `CLAUDE.md`, the PRD.
- **Build state** — what's done and working, by area.
- **Repo / infra** — branch, open PRs, config or tooling changes.
- **Currently working on → next steps** — the agreed next move.
- **Known issues / caveats** — anything unverified, fragile, or flagged.
- **Parked ideas** — deliberately deferred, not scheduled.
- **This session, in brief** — one paragraph: where it started, what was done.
- **Start here** — a short numbered list for the next session's first actions.

## Notes

- Convert relative dates ("today", "yesterday") to absolute ones.
- Be honest about state: if something is unverified or skipped, say so.
- Note the active branch and any open PR so the next session doesn't re-push or
  duplicate work.
