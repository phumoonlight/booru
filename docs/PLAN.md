# Booru — Implementation Plan (Master Document)

> **Purpose:** This is the entry point for every work session. Read this file first,
> then jump to the phase you're working on in [phases.md](./phases.md).
> Update the **Current Status** and **Session Log** sections at the end of every session.

## What we're building

A booru-style image board (reference: Danbooru — see [design/interface-example.png](./design/interface-example.png)):
tag-centric image gallery with multi-tag search, post detail pages, and admin-managed uploads.

## Hard requirements (user's conditions)

1. **Fullstack Next.js** — one project, App Router, Server Actions for all mutations.
2. **Supabase** — Postgres (database), Storage (images), Auth (login).
3. **Mobile-first** — the mobile experience is the priority; desktop adapts from it.
   Danbooru's desktop layout (fixed left sidebar) becomes a slide-in drawer / bottom
   sheet on mobile.

## Deferred by design (do NOT build these yet)

Documented in [future.md](./future.md) so current decisions don't block them later:

- **Community moderation** — for now only the admin (site owner) uploads/moderates.
  Schema still includes `status` and `uploader_id` columns so opening this up later
  is a policy change, not a migration.
- **Public API** — for now all data access goes through Server Actions / RSC.
  Keep data-access logic in `src/lib/data/` (not inline in actions) so route
  handlers can reuse it when the public API arrives.

## Document map

| File | Contents |
|---|---|
| [PLAN.md](./PLAN.md) | This file — status, conventions, session log |
| [architecture.md](./architecture.md) | Tech stack, folder structure, key patterns |
| [database-schema.md](./database-schema.md) | Full Postgres schema, RLS, indexes, search function |
| [phases.md](./phases.md) | Phase-by-phase checklists (the actual to-do list) |
| [future.md](./future.md) | Deferred features + how the current design accommodates them |

## Phase overview

| # | Phase | Status |
|---|---|---|
| 0 | Project scaffold (Next.js + Tailwind + Supabase client) | 🔲 not started |
| 1 | Database schema + migrations + admin auth | 🔲 not started |
| 2 | Upload pipeline (admin): file → dedup → thumbnail → tags | 🔲 not started |
| 3 | Browse: post grid, post detail page, pagination | 🔲 not started |
| 4 | Tag search: multi-tag query, autocomplete, tag drawer | 🔲 not started |
| 5 | Accounts: public signup, favorites | 🔲 not started |
| 6 | Polish: rating filter, infinite scroll, SEO, PWA basics | 🔲 not started |

Status legend: 🔲 not started · 🟡 in progress · ✅ done

## Current status

**Nothing implemented yet.** Repo contains only docs. Next step: Phase 0 in
[phases.md](./phases.md).

Blockers / decisions needed from user: none currently.

## Working conventions (for every session)

- Work through phases in order; within a phase, check off items in phases.md as you go.
- Database changes are **always** SQL migration files in `supabase/migrations/`
  (timestamped), never ad-hoc dashboard edits — the schema must be reproducible.
- Mutations = Server Actions. Reads = React Server Components calling `src/lib/data/`.
- Every UI is built mobile-first (design at ~375px width, then scale up with
  `sm:`/`md:`/`lg:` breakpoints).
- Before ending a session: update **Current status**, the phase table above, and
  append a **Session log** entry.

## Session log

_Newest first. Format: date — what was done, what's next, any decisions made._

- **2026-08-26** — Wrote the implementation plan (this document set). Next: Phase 0 scaffold.
