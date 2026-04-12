# PVK Tourney Architecture Mapping

## Purpose

This document maps Patrick's existing March Madness backend work onto the shared Sports Closet three-layer architecture:

1. `probability inputs`
2. `simulation outputs`
3. `commentary outputs`

The goal is not to replace the tourney system. The goal is to understand it well enough to:

- preserve what already works
- extract shared contracts carefully
- let new products like `nfl-survivor` plug into the same underlying ideas

## High-Level Read

Patrick's tourney pipeline already behaves like a real multi-step backend system. It is not yet exposed as a generalized shared service, but the core ingredients are there.

From the code reviewed:

- [`api/poller.py`](./api/poller.py)
- [`api/simulate.py`](./api/simulate.py)
- [`api/narrative_v3`](./api/narrative_v3)
- [`supabase/narrative_feed_migration.sql`](./supabase/narrative_feed_migration.sql)

the architecture is best understood as:

- ingest live state
- normalize and enrich game-level inputs
- run a product-specific simulation
- persist structured outcomes
- generate narrative outputs from those outcomes

That means the shared architecture should be treated as an extraction of Patrick's working system, not a new theory layered on top of it.

## Layer Mapping

### Layer 1: Probability Inputs

#### What exists now

The tourney app already has a probability-input layer, but it is spread across:

- ESPN scoreboard and live state polling in [`api/poller.py`](./api/poller.py)
- live win-probability pulls from ESPN core APIs in [`api/poller.py`](./api/poller.py)
- seed-history rates and round matchup priors in [`api/simulate.py`](./api/simulate.py)
- BPI / rating-style inputs in [`api/simulate.py`](./api/simulate.py)

#### What that means

For March Madness, the probability-input layer currently includes:

- schedule / game state
- live game status
- win probabilities during active games
- historical seed-matchup priors
- rating-based strength signals

#### Shared interpretation

This already fits the `probability inputs` idea. It is just not named that way yet.

The main future extraction work is:

- normalize these inputs behind clearer contracts
- separate provider ingestion from product-specific transforms
- expose timestamps and source identity more consistently

#### Survivor implications

For `nfl-survivor`, this suggests a direct analogue:

- NFL schedule state
- kickoff / status / final results
- market win probabilities
- optional model probabilities

The Survivor app does not need Patrick's exact basketball logic, but it should inherit the same backend pattern: canonical current-state inputs first, then downstream simulation.

### Layer 2: Simulation Outputs

#### What exists now

The simulation layer is very real in [`api/simulate.py`](./api/simulate.py).

It already does the core job the shared architecture is trying to describe:

- reads structured current state
- computes matchup probabilities
- simulates tournament outcomes
- evaluates pool-member consequences
- produces leverage / win-probability style outputs

The important point is that Patrick already has a true model of:

- world state
- user entries
- product rules
- repeated outcome generation
- per-user implications

That is the essence of the `simulation outputs` layer.

#### What seems product-specific today

The current implementation is tightly shaped around the tournament:

- bracket slot tree
- round progression
- bracket pick scoring
- March-specific leverage logic

Those are not problems. They are the proven March Madness implementation.

#### Shared interpretation

The extraction path is:

- keep March logic where it belongs
- define the common output contract around pool/user/window-level metrics
- let each product produce its own metrics inside that shared envelope

For example:

- March might output win odds, finish distributions, leverage dependencies
- NBA might output current-round win odds and series leverage
- Survivor might output survive-this-week odds, pool win odds, and future team-value metrics

#### Survivor implications

Survivor can use the same layer without pretending it is a bracket:

- inputs: weekly picks + game probabilities + remaining alive entries
- outputs: alive risk, pool win odds, elimination-tree outcomes, future-value tradeoffs

So Survivor should be the first new product to intentionally consume the shared simulation layer shape, while March continues to run its bracket-specific internals.

### Layer 3: Commentary Outputs

#### What exists now

The commentary layer is already real in the tourney stack:

- narrative triggers in [`api/poller.py`](./api/poller.py)
- narrative generation flow in [`api/narrative_v3`](./api/narrative_v3)
- narrative feed persistence in [`supabase/narrative_feed_migration.sql`](./supabase/narrative_feed_migration.sql)

This is the clearest proof that Sports Closet is not just a tracker. It is already trying to turn structured competitive state into user-facing interpretation.

#### What seems product-specific today

The current commentary triggers and prompts appear shaped for March Madness:

- day-ahead summaries
- game-end reactions
- live tournament leverage framing

That is exactly what we would expect from the first product.

#### Shared interpretation

The future shared layer should preserve the same backend idea:

- structured inputs
- context-aware generation
- feed/storage output

without assuming every product talks like March Madness.

The reusable contract should be things like:

- `headline`
- `body`
- `action_label`
- `action_target`
- `priority`
- `tags`
- `updated_at`

while the internal generation logic remains product-aware.

#### Survivor implications

For Survivor, commentary would naturally become:

- weekly risk framing
- missing-pick urgency
- chalk versus contrarian interpretation
- who benefits if a popular favorite loses
- commissioner-facing pool status summaries

So Survivor should not reuse March copy logic, but it should absolutely reuse the idea of a structured commentary-output layer.

## What Seems Safely Reusable

These ideas appear strong enough to carry forward:

- ingestion -> simulation -> commentary pipeline shape
- scheduled backend jobs
- persistent narrative/log/feed tables or equivalents
- structured per-pool and per-user outputs
- product-aware narratives driven by backend state, not just frontend guesswork

## What Should Stay Product-Specific

These should not be prematurely “generalized away”:

- bracket topology
- March round naming and slot logic
- Survivor weekly elimination rules
- NBA series-length scoring
- draft-board logic for `On the Clock`

The shared system should unify contracts, not flatten product identity.

## Main Risk To Avoid

The biggest risk is designing a new shared architecture that ignores Patrick's working implementation details.

That would create:

- duplicate concepts
- misnamed abstractions
- churn in working tourney behavior
- more integration pain later

The safer path is:

1. treat the tourney backend as the first implementation
2. map it into the three-layer model
3. extract contracts only where the abstraction is earned
4. let Survivor be the first new product built intentionally against those contracts

## Recommendation For Survivor Work

This means Survivor development is safe to begin if we keep the boundary disciplined:

- create a sibling app
- build local-first Survivor surfaces
- define shared-layer contracts from Patrick's pipeline
- do **not** rewrite the existing tourney backend

That gives us forward motion without stepping on proven March Madness logic.

## Short Honest Read

Patrick already built the first real Sports Closet backend.

It is not yet generalized, but it already contains the essential shared shape:

- inputs
- simulation
- commentary

The right next step is to formalize and extract that shape carefully, not to replace it.
