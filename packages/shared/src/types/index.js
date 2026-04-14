/**
 * Shared type definitions for the sports-closet platform.
 *
 * These are JSDoc typedefs for now. Once Supabase is consolidated,
 * run `pnpm db:types` from the repo root to generate TypeScript types
 * and replace this file with the generated database.ts
 */

/**
 * @typedef {'march_madness' | 'nfl_draft' | 'wnba_draft' | 'nba_playoffs'} GameType
 */

/**
 * @typedef {Object} Pool
 * @property {string} id
 * @property {GameType} game_type
 * @property {number} season
 * @property {string} name
 * @property {string} invite_code
 * @property {string} created_by
 * @property {boolean} is_locked
 * @property {Object} scoring_config
 * @property {Object} settings
 * @property {string|null} next_event_at
 * @property {string} created_at
 */

/**
 * @typedef {Object} PoolEntry
 * @property {string} id
 * @property {string} pool_id
 * @property {string} user_id
 * @property {string|null} entry_name
 * @property {string} created_at
 */

/**
 * @typedef {Object} SimulationOutput
 * @property {string} id
 * @property {string} product_key
 * @property {string} pool_id
 * @property {string} entry_id
 * @property {string} window_key
 * @property {number|null} win_odds
 * @property {number} points_total
 * @property {number|null} points_back
 * @property {number|null} rank
 * @property {number|null} max_possible
 * @property {Object} details
 * @property {string} updated_at
 */

/**
 * @typedef {Object} CommentaryOutput
 * @property {string} id
 * @property {string} product_key
 * @property {string} pool_id
 * @property {string|null} user_id
 * @property {string} headline
 * @property {string|null} body
 * @property {string|null} action_label
 * @property {string|null} action_target
 * @property {'high'|'medium'|'low'} priority
 * @property {string[]} tags
 * @property {string} persona
 * @property {Object} metadata
 * @property {string|null} expires_at
 * @property {string} created_at
 */

/**
 * @typedef {Object} ProbabilityInput
 * @property {string} id
 * @property {string} product_key
 * @property {string} entity_type
 * @property {string} entity_id
 * @property {string} source_type
 * @property {string} source_name
 * @property {Object} probabilities
 * @property {string} captured_at
 */
