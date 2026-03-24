import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { usePool } from '../hooks/usePool'
import { BRACKET as MOCK_BRACKET } from '../data/mockData'

// ─── Bracket slot layout ───────────────────────────────────────────────────────
//
//  63 slots:  each region occupies 15 consecutive slots
//    Region offsets: Midwest=0, West=15, South=30, East=45
//    Within a region: R64=[0-7], R32=[8-11], S16=[12-13], E8=[14]
//  Final Four:   slot 60 = Midwest E8 winner vs West E8 winner
//                slot 61 = South E8 winner  vs East E8 winner
//  Championship: slot 62

const REGION_BASES  = [0, 15, 30, 45]
const REGION_KEYS   = ['midwest', 'west', 'south', 'east']
const REGION_NAMES  = ['Midwest', 'West', 'South', 'East']
const REGION_COLORS = ['#f97316', '#06b6d4', '#a78bfa', '#22c55e']

// Precomputed feeder slots for every slot > 7 within a region
// and for F4/Championship slots
function buildBracketSlots() {
  const slots = new Array(63).fill(null).map((_, i) => ({ slot: i, round: null, feeders: null }))

  REGION_BASES.forEach((base) => {
    for (let i = 0; i < 8; i++)  slots[base + i]      = { slot: base + i,      round: 'R64', feeders: null }
    for (let i = 0; i < 4; i++)  slots[base + 8 + i]  = { slot: base + 8 + i,  round: 'R32', feeders: [base + i * 2, base + i * 2 + 1] }
    for (let i = 0; i < 2; i++)  slots[base + 12 + i] = { slot: base + 12 + i, round: 'S16', feeders: [base + 8 + i * 2, base + 8 + i * 2 + 1] }
    slots[base + 14] = { slot: base + 14, round: 'E8',   feeders: [base + 12, base + 13] }
  })
  slots[60] = { slot: 60, round: 'F4',   feeders: [14, 29] }  // Midwest E8 vs West E8
  slots[61] = { slot: 61, round: 'F4',   feeders: [44, 59] }  // South E8 vs East E8
  slots[62] = { slot: 62, round: 'Champ',feeders: [60, 61] }
  return slots
}

const BRACKET_SLOTS = buildBracketSlots()

// Build r64Seeds from the mock BRACKET as fallback
function buildR64SeedsFromMock(bracket) {
  const seeds = {}
  REGION_BASES.forEach((base, ri) => {
    const region = bracket[REGION_KEYS[ri]]
    ;(region?.rounds?.R64 ?? []).forEach((game, gi) => {
      seeds[base + gi] = { team1: game.t1, seed1: game.s1, team2: game.t2, seed2: game.s2 }
    })
  })
  return seeds
}

// Build team → seed lookup for display
function buildTeamSeeds(r64Seeds) {
  const map = {}
  Object.values(r64Seeds).forEach(({ team1, seed1, team2, seed2 }) => {
    if (team1) map[team1] = seed1
    if (team2) map[team2] = seed2
  })
  return map
}

// Get the two teams for any slot (derived from picks or r64Seeds)
function getGameTeams(slot, picks, r64Seeds) {
  const info = BRACKET_SLOTS[slot]
  if (!info.feeders) return r64Seeds[slot] ?? { team1: null, seed1: null, team2: null, seed2: null }
  const [f1, f2] = info.feeders
  const team1 = picks[f1] ?? null
  const team2 = picks[f2] ?? null
  const teamSeeds = buildTeamSeeds(r64Seeds)
  return {
    team1, seed1: team1 ? (teamSeeds[team1] ?? null) : null,
    team2, seed2: team2 ? (teamSeeds[team2] ?? null) : null,
  }
}

// Set a pick and cascade-clear any now-invalid dependent picks
function cascadingSetPick(slotIndex, team, currentPicks) {
  const newPicks = [...currentPicks]
  newPicks[slotIndex] = team

  const queue = [slotIndex]
  while (queue.length > 0) {
    const processed = queue.shift()
    for (let s = 0; s < 63; s++) {
      const info = BRACKET_SLOTS[s]
      if (!info?.feeders?.includes(processed)) continue
      const [f1, f2] = info.feeders
      const opt1 = newPicks[f1] ?? null
      const opt2 = newPicks[f2] ?? null
      if (newPicks[s] && newPicks[s] !== opt1 && newPicks[s] !== opt2) {
        newPicks[s] = null
        queue.push(s)
      }
    }
  }
  return newPicks
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SubmitTeamRow({ team, seed, isPicked, isLocked, onClick }) {
  return (
    <button
      disabled={!team || isLocked}
      onClick={onClick}
      className={[
        'w-full flex items-center gap-1.5 px-2 py-[6px] text-left transition-all',
        !team
          ? 'cursor-default opacity-30'
          : isLocked
            ? 'cursor-default'
            : 'cursor-pointer hover:bg-slate-700/60',
        isPicked
          ? 'bg-orange-500/10 border-l-2 border-orange-500'
          : 'border-l-2 border-transparent',
      ].join(' ')}
    >
      <span
        className="text-[10px] text-slate-500 w-3 text-center tabular-nums shrink-0"
        style={{ fontFamily: 'Space Mono, monospace' }}
      >
        {seed ?? ''}
      </span>
      <span className={`text-[11px] truncate flex-1 ${
        isPicked
          ? 'text-orange-300 font-semibold'
          : team
            ? 'text-slate-300'
            : 'text-slate-600 italic'
      }`}>
        {team ?? 'TBD'}
      </span>
      {isPicked && (
        <span className="text-orange-500 text-[10px] shrink-0">✓</span>
      )}
    </button>
  )
}

function SubmitGameCard({ slot, picks, r64Seeds, isLocked, onPick }) {
  const { team1, seed1, team2, seed2 } = getGameTeams(slot, picks, r64Seeds)
  const currentPick = picks[slot]
  const hasPick = !!currentPick

  return (
    <div
      className={[
        'rounded-lg overflow-hidden transition-all',
        hasPick
          ? 'bg-slate-900/90 border border-orange-500/30 shadow-sm shadow-orange-900/20'
          : 'bg-slate-900/80 border border-slate-800/60',
      ].join(' ')}
      style={{ width: 132 }}
    >
      <SubmitTeamRow
        team={team1} seed={seed1}
        isPicked={currentPick === team1 && !!team1}
        isLocked={isLocked}
        onClick={() => team1 && onPick(slot, team1)}
      />
      <div className="h-px bg-slate-800/80" />
      <SubmitTeamRow
        team={team2} seed={seed2}
        isPicked={currentPick === team2 && !!team2}
        isLocked={isLocked}
        onClick={() => team2 && onPick(slot, team2)}
      />
    </div>
  )
}

const GAME_AREA_H   = 520
const LABEL_H       = 28
const ROUND_LABELS  = { R64: 'R64', R32: 'R32', S16: 'Sweet 16', E8: 'Elite 8' }
const ROUND_KEYS    = ['R64', 'R32', 'S16', 'E8']
const GAME_COUNTS   = { R64: 8, R32: 4, S16: 2, E8: 1 }

function BracketConnectors({ leftCount }) {
  const rightCount = leftCount / 2
  const segs = []
  for (let i = 0; i < rightCount; i++) {
    const topY = ((i * 2)     * 2 + 1) / (leftCount * 2) * 100
    const botY = ((i * 2 + 1) * 2 + 1) / (leftCount * 2) * 100
    const midY = (topY + botY) / 2
    segs.push(`M 0 ${topY} H 50 V ${botY} M 0 ${botY} H 50 M 50 ${midY} H 100`)
  }
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: 20, height: GAME_AREA_H, flexShrink: 0 }}>
      {segs.map((d, i) => (
        <path key={i} d={d} stroke="rgba(71,85,105,0.55)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      ))}
    </svg>
  )
}

function RegionPickBracket({ regionIndex, picks, r64Seeds, isLocked, onPick, startRound }) {
  const base = REGION_BASES[regionIndex]
  // For S16 pools, only show S16 and E8 columns
  const visibleRounds = startRound === 'S16'
    ? ROUND_KEYS.filter((r) => r !== 'R64' && r !== 'R32')
    : ROUND_KEYS
  const minW = startRound === 'S16' ? 320 : 620
  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex" style={{ minWidth: minW }}>
        {visibleRounds.map((round, ri) => {
          const count = GAME_COUNTS[round]
          const startOffset = { R64: 0, R32: 8, S16: 12, E8: 14 }[round]
          return (
            <div key={round} className="flex">
              <div style={{ width: 136, flexShrink: 0 }}>
                <div className="flex items-center justify-center" style={{ height: LABEL_H }}>
                  <span
                    className="text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                    style={{ fontFamily: 'Space Mono, monospace' }}
                  >
                    {ROUND_LABELS[round]}
                  </span>
                </div>
                <div style={{ height: GAME_AREA_H, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
                  {Array.from({ length: count }, (_, gi) => (
                    <SubmitGameCard
                      key={gi}
                      slot={base + startOffset + gi}
                      picks={picks}
                      r64Seeds={r64Seeds}
                      isLocked={isLocked}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
              {ri < visibleRounds.length - 1 && (
                <div style={{ paddingTop: LABEL_H }}>
                  <BracketConnectors leftCount={GAME_COUNTS[round]} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FinalFourPicker({ picks, r64Seeds, isLocked, onPick }) {
  return (
    <div className="py-10 flex flex-col items-center gap-8">
      {/* Section header */}
      <div className="text-center">
        <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-1" style={{ fontFamily: 'Space Mono, monospace' }}>
          Final Four &amp; Championship
        </p>
        <p className="text-xs text-slate-500">Pick the winners of each semifinal, then the champion.</p>
      </div>

      <div className="flex items-center gap-6 flex-wrap justify-center w-full">

        {/* SF1 — Midwest vs West */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex-1 min-w-[200px] max-w-[240px]">
          <p
            className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1"
            style={{ fontFamily: 'Space Mono, monospace' }}
          >
            Semifinal 1
          </p>
          <p className="text-[10px] text-slate-600 mb-3">Midwest · West</p>
          <SubmitGameCard slot={60} picks={picks} r64Seeds={r64Seeds} isLocked={isLocked} onPick={onPick} />
        </div>

        {/* Connector → Championship */}
        <div className="hidden sm:flex flex-col items-center gap-1 text-slate-700">
          <div className="w-px h-8 bg-slate-700" />
          <span className="text-[10px]" style={{ fontFamily: 'Space Mono, monospace' }}>→</span>
          <div className="w-px h-8 bg-slate-700" />
        </div>

        {/* Championship */}
        <div className="relative bg-gradient-to-b from-amber-950/40 via-slate-900/80 to-slate-900/60 border border-amber-600/30 rounded-2xl p-6 flex-1 min-w-[210px] max-w-[256px] shadow-lg shadow-amber-900/10">
          {/* Crown badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-amber-600 to-orange-500 rounded-full whitespace-nowrap shadow-md">
            <span
              className="text-[10px] font-bold text-white tracking-widest uppercase"
              style={{ fontFamily: 'Space Mono, monospace' }}
            >
              Championship
            </span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] text-amber-600/70 text-center mb-3 font-medium">
              {picks[60] && picks[61]
                ? `${picks[60]} vs ${picks[61]}`
                : 'Pick both semifinals first'}
            </p>
            <SubmitGameCard slot={62} picks={picks} r64Seeds={r64Seeds} isLocked={isLocked} onPick={onPick} />
          </div>
        </div>

        {/* Connector ← SF2 */}
        <div className="hidden sm:flex flex-col items-center gap-1 text-slate-700">
          <div className="w-px h-8 bg-slate-700" />
          <span className="text-[10px]" style={{ fontFamily: 'Space Mono, monospace' }}>←</span>
          <div className="w-px h-8 bg-slate-700" />
        </div>

        {/* SF2 — South vs East */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex-1 min-w-[200px] max-w-[240px]">
          <p
            className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1"
            style={{ fontFamily: 'Space Mono, monospace' }}
          >
            Semifinal 2
          </p>
          <p className="text-[10px] text-slate-600 mb-3">South · East</p>
          <SubmitGameCard slot={61} picks={picks} r64Seeds={r64Seeds} isLocked={isLocked} onPick={onPick} />
        </div>

      </div>

      {/* Champion summary */}
      {picks[62] && (
        <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-amber-900/20 border border-amber-700/30">
          <span className="text-amber-400 text-base">🏆</span>
          <div>
            <p className="text-[10px] text-amber-600/80 font-medium uppercase tracking-wide" style={{ fontFamily: 'Space Mono, monospace' }}>
              Your Champion
            </p>
            <p className="text-sm font-bold text-amber-300">{picks[62]}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ filled, total }) {
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0
  const isComplete = filled === total
  return (
    <div className="w-full">
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[10px] text-slate-500 uppercase tracking-wide" style={{ fontFamily: 'Space Mono, monospace' }}>
          Progress
        </span>
        <span
          className={`text-xs font-bold tabular-nums ${isComplete ? 'text-emerald-400' : 'text-amber-400'}`}
          style={{ fontFamily: 'Space Mono, monospace' }}
        >
          {filled}/{total}
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-500' : 'bg-gradient-to-r from-orange-500 to-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Toast notification ─────────────────────────────────────────────────────────

function SavedToast({ visible }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl
        bg-slate-800 border border-emerald-700/40 shadow-2xl shadow-black/40
        transition-all duration-300 pointer-events-none
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <span className="text-emerald-400 text-sm font-bold">✓</span>
      <span className="text-sm font-semibold text-emerald-300">Bracket saved!</span>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

const TABS = [
  ...REGION_KEYS.map((key, i) => ({ key, label: REGION_NAMES[i], color: REGION_COLORS[i] })),
  { key: 'finalfour', label: 'Final Four', color: '#f59e0b' },
]

export default function BracketSubmitPage() {
  const { session } = useAuth()
  const { pool, games: dbGames, refreshPool } = usePool()
  const navigate = useNavigate()

  const isS16Pool = pool?.start_round === 'S16'

  const [activeTab, setActiveTab] = useState('midwest')
  const [picks,     setPicks]     = useState(Array(63).fill(null))
  const [isLocked,  setIsLocked]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [error,     setError]     = useState(null)

  // Build r64Seeds: prefer live DB data, fall back to mock BRACKET
  const r64Seeds = useMemo(() => {
    if (dbGames && dbGames.length > 0) {
      const seeds = {}
      dbGames
        .filter((g) => g.slot_index >= 0 && g.slot_index <= 62 && BRACKET_SLOTS[g.slot_index]?.round === 'R64')
        .forEach((g) => {
          seeds[g.slot_index] = {
            team1: g.teams?.team1 ?? null,
            seed1: g.teams?.seed1 ?? null,
            team2: g.teams?.team2 ?? null,
            seed2: g.teams?.seed2 ?? null,
          }
        })
      if (Object.keys(seeds).length >= 32) return seeds
    }
    return buildR64SeedsFromMock(MOCK_BRACKET)
  }, [dbGames])

  // For S16 pools: auto-fill R64/R32 slots from DB game winners
  const autoFilledPicks = useMemo(() => {
    if (!isS16Pool || !dbGames?.length) return null
    const filled = Array(63).fill(null)
    dbGames
      .filter((g) => g.winner && ['R64', 'R32'].includes(BRACKET_SLOTS[g.slot_index]?.round))
      .forEach((g) => { filled[g.slot_index] = g.winner })
    return filled
  }, [isS16Pool, dbGames])

  // Load existing bracket on mount
  useEffect(() => {
    if (!session || !pool) return
    async function load() {
      const { data } = await supabase
        .from('brackets')
        .select('picks, locked')
        .eq('user_id', session.user.id)
        .eq('pool_id', pool.id)
        .single()
      if (data?.picks?.length) {
        setPicks(data.picks)
      } else if (autoFilledPicks) {
        // Pre-fill R64/R32 for new S16 brackets
        setPicks(autoFilledPicks)
      }
      if (data?.locked || pool.locked) setIsLocked(true)
    }
    load()
  }, [session, pool, autoFilledPicks])

  // Keep R64/R32 slots in sync with actual results for S16 pools
  useEffect(() => {
    if (!autoFilledPicks) return
    setPicks((current) => {
      const updated = [...current]
      for (let i = 0; i < 63; i++) {
        const round = BRACKET_SLOTS[i]?.round
        if ((round === 'R64' || round === 'R32') && autoFilledPicks[i]) {
          updated[i] = autoFilledPicks[i]
        }
      }
      return updated
    })
  }, [autoFilledPicks])

  function handlePick(slot, team) {
    if (isLocked) return
    // Prevent picking R64/R32 in S16 pools
    const round = BRACKET_SLOTS[slot]?.round
    if (isS16Pool && (round === 'R64' || round === 'R32')) return
    setSaved(false)
    setPicks((current) => cascadingSetPick(slot, team, current))
  }

  // For S16 pools: only count S16+ slots (15 total: 12 region + 2 F4 + 1 Champ)
  const userPickSlots = isS16Pool
    ? picks.filter((p, i) => p && !['R64', 'R32'].includes(BRACKET_SLOTS[i]?.round))
    : picks.filter(Boolean)
  const totalSlots   = isS16Pool ? 15 : 63
  const filledCount  = userPickSlots.length
  const isComplete   = filledCount === totalSlots

  async function handleSave() {
    if (!session || !pool) return
    setSaving(true)
    setError(null)
    try {
      // For S16 pools, ensure R64/R32 auto-filled picks are included
      const savePicks = autoFilledPicks
        ? picks.map((p, i) => {
            const round = BRACKET_SLOTS[i]?.round
            if ((round === 'R64' || round === 'R32') && autoFilledPicks[i]) return autoFilledPicks[i]
            return p
          })
        : picks
      const { error: upsertError } = await supabase
        .from('brackets')
        .upsert(
          { user_id: session.user.id, pool_id: pool.id, picks: savePicks, submitted_at: new Date().toISOString() },
          { onConflict: 'user_id,pool_id' }
        )
      if (upsertError) throw upsertError
      // Reload brackets in PoolContext so BracketView shows updated picks
      await refreshPool()
      setSaved(true)
      // Auto-hide the saved indicator after 3 seconds, then navigate to bracket view
      setTimeout(() => {
        setSaved(false)
        navigate('/bracket')
      }, 3000)
    } catch (e) {
      setError(e.message ?? 'Save failed')
    }
    setSaving(false)
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* Locked banner */}
      {isLocked && (
        <div className="mb-5 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/60">
          <span className="text-slate-400 text-base">🔒</span>
          <div>
            <p className="text-sm font-bold text-slate-300">Bracket Locked</p>
            <p className="text-xs text-slate-500">The pool is locked — no further edits are allowed.</p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Submit Bracket</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {isS16Pool
              ? 'Pick Sweet 16 through Championship. Earlier rounds are auto-filled.'
              : 'Click a team to advance them. Picks cascade automatically.'}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Progress */}
          <div className="w-36">
            <ProgressBar filled={filledCount} total={totalSlots} />
          </div>

          {isLocked ? (
            <span className="px-4 py-2 rounded-xl bg-slate-800 text-slate-500 text-xs font-medium border border-slate-700 whitespace-nowrap">
              Pool Locked
            </span>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || filledCount === 0}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold hover:from-orange-400 hover:to-amber-400 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-lg shadow-orange-900/30"
            >
              {saving ? 'Saving…' : 'Save Bracket'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-2.5">
          {error}
        </div>
      )}

      {/* Region tabs */}
      <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.key
                ? 'text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
            style={
              activeTab === tab.key
                ? { background: `${tab.color}22`, border: `1px solid ${tab.color}55`, color: tab.color }
                : {}
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bracket content */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden">
        {activeTab === 'finalfour' ? (
          <FinalFourPicker picks={picks} r64Seeds={r64Seeds} isLocked={isLocked} onPick={handlePick} />
        ) : (
          <div className="p-4">
            <RegionPickBracket
              regionIndex={REGION_KEYS.indexOf(activeTab)}
              picks={picks}
              r64Seeds={r64Seeds}
              isLocked={isLocked}
              onPick={handlePick}
              startRound={pool?.start_round}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6 flex-wrap text-[11px] text-slate-600">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-orange-500/15 border border-orange-500/30" />
          Your pick
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-0.5 h-3 bg-orange-500 rounded-full" />
          Selected team
        </span>
        <span>Click any team to pick them as the winner of that game.</span>
      </div>

      {/* Toast */}
      <SavedToast visible={saved} />
    </div>
  )
}
