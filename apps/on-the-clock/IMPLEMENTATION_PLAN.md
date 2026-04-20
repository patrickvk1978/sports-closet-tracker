# On the Clock — Implementation Plan (Tiers A → C)

Eight core sessions + one parallel cleanup. ~2 weeks part-time. Each session ships in one sitting with a clear checkpoint.

---

## Session 1 — A1 + A2 Combined (~3.5h)

**Why combined:** both touch `LiveStage.jsx` + `LiveDraftView.jsx` and share the "pick is in" state. Fixing the locked screen while adding the 15s window transforms the worst screen into the most alive in one pass.

### A1: 15-second pool submit window
- **Migration:** add `pick_is_in_at timestamptz` to `draft.feed`
- **RPC:** `finalize_pick(pick_number int)` — idempotent. Resolves unlocked pool members via fallback logic, advances `status → 'revealed'`. Safe to call from any client.
- **Hook:** `src/hooks/useSubmitWindow.js` — subscribes to `pick_is_in_at`, returns `{ secondsLeft, tier, allLocked }`
- **Component:** `SubmitWindowBanner.jsx` with three tiers:
  - **calm** (you locked, pool locked): small badge, "Pool ready · 8s"
  - **active** (you unlocked OR pool unlocked): medium banner, amber
  - **urgent** (<5s AND someone unlocked): full-width red, pulsing digits, "FALLBACK IN 3…"
- First client whose timer hits 0 calls `finalize_pick`. RPC is idempotent so races are fine.

### A2: Locked-state fixes
- Remove duplicate pool panel (keep right rail, drop LiveStage's inline one)
- `change pick` button: promote from text link to secondary button, visible weight
- Keep submit timer running (currently hidden when locked — wrong signal)
- Monogram avatar in locked card replaces 🏈 emoji

**Checkpoint:** submit a pick, watch 15s ticker, let it expire, verify unlocked teammate gets fallback pick written to `user_live_cards`.

**Decision needed before starting:** confirm client-triggered `finalize_pick` (recommended) vs pg_cron scheduled job. Client-triggered is simpler, idempotent, no infra.

---

## Session 2 — Tier A polish sweep (~3h)

Grouped because they're all small, all visual, all in `LiveDraftView.jsx` + `index.css`.

- **A4** Under-30s urgency on main NFL timer — pulsing digits + red vignette on `.ls-timer-val`
- **A5** Dim completed picks in left rail — `opacity: 0.55` + strike on player name
- **A6** Auto-pick labels — `✨ auto` tag on fallback-resolved cards (reads from `user_live_cards.source = 'auto'`)
- **A7** Standings reorder — wrap standings rows in `<motion.div layout>`, install `framer-motion`
- **A8** Pick reveal micro-animation — player name scale-in + confetti burst on hit badge

**Checkpoint:** run a 3-pick sequence, confirm every transition feels intentional.

---

## Session 3 — A3 Center-column slot + first content (~2h)

This session exists to **create the slot** that B1 will plug into, with a fallback implementation that's useful on its own.

- New component `CenterFeed.jsx` in middle column of LiveDraftView
- Ships with `WaitingInsight` — reads from new `draft.admin_notes` table (admin-authored rumor lines, one per pick)
- Structured so B1's Bluesky feed can slot in as a second card type without layout churn

**Checkpoint:** admin writes a note, it appears on all clients within 2s via realtime.

---

## Session 4 — B1 Bluesky Feed (~7h, biggest session)

**Pre-check (30m):** verify `app.bsky.feed.searchPosts` returns useful content for `#NFLDraft` on a normal weekday. If sparse, pivot to allowlisted accounts only.

- **Edge Function** `bluesky-feed` — hits `public.api.bsky.app`, caches 8s in KV, returns normalized `{ posts: [...] }`
- **Allowlist table** `draft.bluesky_accounts` — curated reporters (Schefter, Rapoport, Pelissero mirrors, Pauline, etc.)
- **Prioritization:** allowlisted first, then `#NFLDraft` hashtag, dedupe by URI
- **Content safety:** hide posts with reply count > 200 to their parent (likely dunks, not news)
- **UI:** BlueskyCard component in CenterFeed, polls Edge Function every 10s
- **Footer credit** linking to Bluesky (ATProto ToS)

**Checkpoint:** feed renders 8 fresh posts on draft day with <2s latency from post to display.

---

## Session 5 — B2 Pool Activity feed + B4 polish (~5h)

- **B2:** new `draft.pool_events` table (`type`, `actor_id`, `pick_number`, `payload jsonb`). Insert on: member locks in, member changes pick, auto-pick fires. Realtime sub feeds a second card in CenterFeed alongside Bluesky.
- **B4:** always show queue pick (even if not top of board), collapse consensus suggestions into expandable row — reduces stage clutter in on_clock.

**Checkpoint:** two users in different browsers, locks from one show as activity event in other's center feed.

---

## Session 6 — B3 Scoring decision + Prospect headshots (~4h)

**B3 (1h):** commit to a scoring model. Recommend keeping +5/+2/0 for simplicity unless we want playoff-bracket-style escalation (+10 exact, +3 position, +1 round). Decision gates C3.

**Headshots (3h):**
- Add `photo_url text` to `public.prospects`
- Manually curate top 32 headshots (ESPN/NFL.com public press photos, ~10min each)
- Upload to Supabase Storage `prospect-photos/` bucket
- Render in locked card, reveal card, suggestions bar, board rows. Fallback to monogram when null.

**Checkpoint:** every top-32 prospect has a face on every surface that mentions them.

---

## Session 7 — C1 Mobile layout (~full day, 6-8h)

- Breakpoints at 768px and 1024px
- Left rail (picks) → collapsible drawer, bottom-sheet on mobile
- Right rail (pool + standings) → second bottom-sheet, toggle button in header
- Center column becomes single column
- Suggestions bar becomes horizontal swipe carousel
- Search field gets sticky positioning

**Checkpoint:** draft a pick from an iPhone viewport without scrolling past the action.

---

## Session 8 — C2 Accessibility + C4 Spectator mode (~5h)

- **C2:** 40px min touch targets, visible focus rings on all interactive, contrast audit against WCAG AA, aria-live on timer + reveal, keyboard nav through suggestions → search → results
- **C4:** spectator mode — users not in the pool join as viewers, see everything except their own card panel. One flag on `pool_members.role = 'spectator'`.

**Checkpoint:** screen-reader walkthrough of full pick cycle with eyes closed works end-to-end.

---

## Session 9 — C3 Streaks + C5 Expert hover cards (~full day)

Last because C3 depends on B3's scoring decision.

- **C3:** `draft.user_streaks` derived view, bonus multiplier applied to pick_scores. UI: fire emoji + streak count next to standings row, "🔥 3 in a row" toast on extend.
- **C5:** hover cards on expert source labels — show mock draft history, accuracy rate on prior picks, link to source.

---

## Parallel / ongoing

- **CSS dedup** (already spawned as background task) — 4 overlapping pre-draft blocks in `index.css` at ~2438, ~2854, ~3539, ~4798. Can land any time.

---

## Dependencies at a glance

```
A1 ──┐
A2 ──┴─► Session 1 ──► Session 2 (A4-A8) ──► Session 3 (A3 slot)
                                                   │
                                                   ▼
                                           Session 4 (B1 Bluesky)
                                                   │
                                                   ▼
                                           Session 5 (B2 + B4)
                                                   │
                                                   ▼
                                           Session 6 (B3 + headshots)
                                                   │
                           ┌───────────────────────┤
                           ▼                       ▼
                   Session 7 (C1 mobile)   Session 8 (C2 + C4)
                                                   │
                                                   ▼
                                           Session 9 (C3 + C5)
```

- **A3** creates the center-column slot **B1** plugs into
- **B3 scoring decision** gates **C3 streaks**
- **A6 auto-pick labels** feed **B2 pool events** (same data source)

---

## Critical decisions before Session 1

1. **`finalize_pick` trigger mechanism** — client-triggered idempotent RPC (recommended) vs pg_cron. Lean client.
2. **Scoring model (B3)** — confirm +5/+2/0 or pivot. Doesn't block Session 1 but unblocks C3.
