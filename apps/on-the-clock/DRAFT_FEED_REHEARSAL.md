# On the Clock — Draft Feed Rehearsal Notes

## Purpose

These notes capture what we learned from the live WNBA Draft rehearsal on April 13, 2026 so we can apply the findings to the NFL Draft implementation.

The goal was not to build a production feed. The goal was to validate:

- where ESPN draft data actually lives
- which fields are trustworthy
- how pick-state transitions behave in real time
- where admin override will still be necessary on draft night

---

## Source Strategy We Tested

We first checked whether the NFL/WNBA draft behaved like Tournament Tracker, where ESPN exposes useful public API-style endpoints.

### What works well in Tournament Tracker

Tournament Tracker uses direct ESPN API-style paths such as:

- `site.api.espn.com/apis/site/v2/.../scoreboard`
- `sports.core.api.espn.com/v2/.../probabilities`

That pattern is reliable for game score polling.

### What we found for the draft

For draft coverage, the obvious `site.api` draft endpoints were not dependable enough for fast implementation. The clean public draft endpoint pattern was not readily available from the same family.

The most reliable source we found tonight was ESPN's public draft page itself:

- `https://www.espn.com/wnba/draft/live`

That page contains an embedded structured payload:

- `espn.draftcast.data = {...}`

This embedded draftcast payload is currently the best candidate for NFL draft-night ingestion.

---

## What ESPN Draftcast Gives Us

From the live WNBA draft payload, we confirmed we can extract:

- current pick id
- team on the clock
- per-pick raw status
- revealed player data
- trade flags and trade notes
- best available / best fit
- enough timing data to derive a visible clock

### Confirmed useful fields

- `current.pickId`
- per-pick `status`
- per-pick `athlete` for revealed selections
- per-pick `traded`
- per-pick `tradeNote`
- current-pick `expires` timestamp

### Important field mapping note

Revealed draft selections came through as `athlete`, not `selection`.

That means our normalizer should treat a revealed player as:

- `pick.selection ?? pick.athlete`

---

## Live Status Sequence Observed

We confirmed the following real draft state progression:

1. `ON_THE_CLOCK`
2. `PICK_IS_IN`
3. `SELECTION_MADE`

This is a strong result for the NFL app because it lines up well with the product states we already want:

- `On the Clock`
- `Pick is in`
- reveal

### Example observed transition

For one live WNBA pick we saw:

- `ON_THE_CLOCK -> PICK_IS_IN`
- then `PICK_IS_IN -> SELECTION_MADE`
- then the current pick advanced to the next slot

This confirms that `PICK_IS_IN` is a meaningful and observable intermediate state.

---

## Clock Behavior

We did **not** find a simple always-present clock field.

Instead, the live countdown appears to be derivable from:

- the current pick's `expires` timestamp

### Important timing behavior

During `PICK_IS_IN`, the visible clock effectively disappears.

Then, when the next pick becomes active, a new `expires` value appears and the next countdown can be derived.

### Product implication

For NFL draft night, we should:

- use the live countdown only when the current pick is truly `ON_THE_CLOCK`
- treat `PICK_IS_IN` as a timerless intermediate state
- trigger our local `Pick is in` UI immediately when ESPN flips state
- reconcile to the new clock when the next pick becomes active

We should **not** assume that a continuous visible timer exists across the entire pick transition.

---

## Current Pick Truth vs Raw Pick Status

One of the most important findings from tonight:

ESPN may mark many unresolved future picks with a raw status of `ON_THE_CLOCK`.

That means we should **not** render every future unresolved pick literally from raw `pick.status`.

### Better rule

Use `current.pickId` as the authoritative source of which pick is actually live.

Suggested display logic:

1. If the pick already has a revealed player, show `Selection Made`
2. Else if the pick's overall number matches `current.pickId`:
   - raw `PICK_IS_IN` -> display `Pick is in`
   - raw `ON_THE_CLOCK` -> display `On the Clock`
3. Else show `Waiting`

### Product implication

For `On the Clock`, the current row should come from:

- `current.pickId`

not from blindly trusting every row's raw status.

This is especially important for the board UI and for keeping reveal logic sane.

---

## Trade Data

Trade annotations were present in the ESPN draftcast payload.

The useful fields we observed were:

- `traded`
- `tradeNote`

This is encouraging for NFL night because we likely can display:

- current pick ownership
- acquired-from notes
- trade context on future picks

### Product implication

We should still keep admin override for trades, but ESPN appears to provide enough trade context that we can likely ingest most of it automatically.

---

## Polling Recommendation for NFL Draft Night

Use a tiered polling cadence, not one fixed interval.

### Recommended cadence

- pre-draft / quiet state: every `30s`
- active `ON_THE_CLOCK`: every `3-5s`
- `PICK_IS_IN`: every `1-2s`
- after selection made / while waiting for next active clock: every `3-5s`

### Why

The most important transitions are short-lived:

- current pick changes
- `PICK_IS_IN`
- reveal
- next pick activation
- next countdown availability

If we under-poll during `PICK_IS_IN`, we risk missing the exact moment that should drive our reveal state.

### Simple v1 fallback

If we want one single number for simplicity, `3s` polling during live Round 1 is probably good enough.

---

## Admin Override Still Needed

Even with this encouraging ESPN data, we should still build admin override as a first-class system.

Reasons:

- the clean public API path is still uncertain
- the countdown is derived, not directly owned by us
- raw row status is noisy
- draft-night feeds can lag or partially fail

### Admin capabilities we still want

- override current pick
- override team on the clock
- override pick status
- override revealed player
- correct or roll back a bad reveal
- continue operating if provider data is delayed or broken

---

## Confidence Level After Rehearsal

After tonight's WNBA test, confidence is materially higher that ESPN draftcast can support the NFL product.

### We now believe ESPN can provide

- team on the clock
- live pick-state transitions
- revealed selections
- trade notes
- enough timing data to derive a useful countdown

### We should still treat as risky

- relying on a hidden draft endpoint family without fallback
- trusting raw row status without `current.pickId`
- assuming clock continuity across `PICK_IS_IN`

---

## Implementation Rules To Carry Into NFL

When we wire the real NFL feed, carry these rules forward:

- prefer ESPN draftcast payload from the public live page unless a cleaner endpoint is validated
- normalize revealed player as `selection ?? athlete`
- derive active row from `current.pickId`
- derive countdown from `expires`
- treat `PICK_IS_IN` as a first-class no-clock state
- downgrade future unresolved rows to `Waiting`
- keep admin override available at all times

---

## Related Tooling

These rehearsal scripts live inside the project and should be kept as reference tooling:

- `scripts/espnDraftcastProbe.mjs`
- `scripts/wnbaDraftWatchServer.mjs`

Supporting snapshots and logs are written to:

- `tmp/espn-draft-probe/`

These files are useful for development reference, but should not be treated as long-term production storage.
