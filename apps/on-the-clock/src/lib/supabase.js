// Supabase clients for On the Clock.
//
//   supabase  → default `public` schema — for shared tables
//               (profiles, pools, pool_members, prospects, nfl_teams,
//               round_1_picks, + RPCs)
//
//   draftDb   → scoped to `draft` schema — for OTC-specific tables
//               (feed, actual_picks, team_overrides, queues, big_boards,
//               live_cards, pick_scores, mock_submissions)
//
// Example:
//   supabase.from('prospects').select('*')           // shared
//   draftDb.from('queues').select('*')               // OTC-specific
//
// NOTE: the `draft` schema must be added to Supabase Dashboard
// → Settings → API → Exposed schemas for PostgREST to reach it.
export { supabase } from '@sports/shared/supabase'
import { supabase } from '@sports/shared/supabase'

export const draftDb = supabase.schema('draft')
