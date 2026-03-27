import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { usePool } from '../hooks/usePool'
import { useEspnPoller } from '../hooks/useEspnPoller'
import { useSimResults } from '../hooks/useSimResults'
import { useNarrativeFeed } from '../hooks/useNarrativeFeed'
import { useNarrativeLog } from '../hooks/useNarrativeLog'
import { useNarrativeConfig } from '../hooks/useNarrativeConfig'

// ─── Constants ─────────────────────────────────────────────────────────────────

const REGIONS = [
  { key: 'midwest', label: 'Midwest', base: 0,  color: '#f97316' },
  { key: 'west',    label: 'West',    base: 15, color: '#06b6d4' },
  { key: 'south',   label: 'South',   base: 30, color: '#a78bfa' },
  { key: 'east',    label: 'East',    base: 45, color: '#22c55e' },
]

// seed matchups by offset within a region (offset → [seed1, seed2])
const SEED_MATCHUPS = [
  [1, 16],
  [8,  9],
  [5, 12],
  [4, 13],
  [6, 11],
  [3, 14],
  [7, 10],
  [2, 15],
]

// ─── 2026 Tournament pre-fill data ────────────────────────────────────────────
// Sourced from ESPN API on Selection Sunday March 16 2026.
// team1 = lower seed, team2 = higher seed (matches AdminPage convention).
// "TBD" = First Four winner; poller will fill the name once that game finishes.
const PREFILLED_R64 = {
  // ── Midwest ──────────────────────────────────────────────────────────────
   0: { espnId: '401856486', team1: 'Michigan Wolverines',      seed1:  1, team2: 'TBD',                         seed2: 16 },
   1: { espnId: '401856487', team1: 'Georgia Bulldogs',         seed1:  8, team2: 'Saint Louis Billikens',        seed2:  9 },
   2: { espnId: '401856520', team1: 'Texas Tech Red Raiders',   seed1:  5, team2: 'Akron Zips',                  seed2: 12 },
   3: { espnId: '401856521', team1: 'Alabama Crimson Tide',     seed1:  4, team2: 'Hofstra Pride',               seed2: 13 },
   4: { espnId: '401856527', team1: 'Tennessee Volunteers',     seed1:  6, team2: 'TBD',                         seed2: 11 },
   5: { espnId: '401856526', team1: 'Virginia Cavaliers',       seed1:  3, team2: 'Wright State Raiders',        seed2: 14 },
   6: { espnId: '401856525', team1: 'Kentucky Wildcats',        seed1:  7, team2: 'Santa Clara Broncos',         seed2: 10 },
   7: { espnId: '401856524', team1: 'Iowa State Cyclones',      seed1:  2, team2: 'Tennessee State Tigers',      seed2: 15 },
  // ── West ─────────────────────────────────────────────────────────────────
  15: { espnId: '401856529', team1: 'Arizona Wildcats',         seed1:  1, team2: 'Long Island University Sharks',seed2: 16 },
  16: { espnId: '401856528', team1: 'Villanova Wildcats',       seed1:  8, team2: 'Utah State Aggies',           seed2:  9 },
  17: { espnId: '401856480', team1: 'Wisconsin Badgers',        seed1:  5, team2: 'High Point Panthers',         seed2: 12 },
  18: { espnId: '401856481', team1: 'Arkansas Razorbacks',      seed1:  4, team2: "Hawai'i Rainbow Warriors",    seed2: 13 },
  19: { espnId: '401856484', team1: 'BYU Cougars',              seed1:  6, team2: 'TBD',                         seed2: 11 },
  20: { espnId: '401856485', team1: 'Gonzaga Bulldogs',         seed1:  3, team2: 'Kennesaw State Owls',         seed2: 14 },
  21: { espnId: '401856518', team1: 'Miami Hurricanes',         seed1:  7, team2: 'Missouri Tigers',             seed2: 10 },
  22: { espnId: '401856519', team1: 'Purdue Boilermakers',      seed1:  2, team2: 'Queens University Royals',    seed2: 15 },
  // ── South ────────────────────────────────────────────────────────────────
  30: { espnId: '401856523', team1: 'Florida Gators',           seed1:  1, team2: 'TBD',                         seed2: 16 },
  31: { espnId: '401856522', team1: 'Clemson Tigers',           seed1:  8, team2: 'Iowa Hawkeyes',               seed2:  9 },
  32: { espnId: '401856488', team1: 'Vanderbilt Commodores',    seed1:  5, team2: 'McNeese Cowboys',             seed2: 12 },
  33: { espnId: '401856489', team1: 'Nebraska Cornhuskers',     seed1:  4, team2: 'Troy Trojans',                seed2: 13 },
  34: { espnId: '401856490', team1: 'North Carolina Tar Heels', seed1:  6, team2: 'VCU Rams',                    seed2: 11 },
  35: { espnId: '401856491', team1: 'Illinois Fighting Illini', seed1:  3, team2: 'Pennsylvania Quakers',        seed2: 14 },
  36: { espnId: '401856492', team1: "Saint Mary's Gaels",       seed1:  7, team2: 'Texas A&M Aggies',            seed2: 10 },
  37: { espnId: '401856493', team1: 'Houston Cougars',          seed1:  2, team2: 'Idaho Vandals',               seed2: 15 },
  // ── East ─────────────────────────────────────────────────────────────────
  45: { espnId: '401856478', team1: 'Duke Blue Devils',         seed1:  1, team2: 'Siena Saints',                seed2: 16 },
  46: { espnId: '401856479', team1: 'Ohio State Buckeyes',      seed1:  8, team2: 'TCU Horned Frogs',            seed2:  9 },
  47: { espnId: '401856494', team1: "St. John's Red Storm",     seed1:  5, team2: 'Northern Iowa Panthers',      seed2: 12 },
  48: { espnId: '401856495', team1: 'Kansas Jayhawks',          seed1:  4, team2: 'California Baptist Lancers',  seed2: 13 },
  49: { espnId: '401856482', team1: 'Louisville Cardinals',     seed1:  6, team2: 'South Florida Bulls',         seed2: 11 },
  50: { espnId: '401856483', team1: 'Michigan State Spartans',  seed1:  3, team2: 'North Dakota State Bison',    seed2: 14 },
  51: { espnId: '401856496', team1: 'UCLA Bruins',              seed1:  7, team2: 'UCF Knights',                 seed2: 10 },
  52: { espnId: '401856497', team1: 'UConn Huskies',            seed1:  2, team2: 'Furman Paladins',             seed2: 15 },
}

// All 63 slots meta for the ESPN ID table
const ROUND_BY_OFFSET = [
  ...Array(8).fill('R64'),
  ...Array(4).fill('R32'),
  ...Array(2).fill('S16'),
  'E8',
]

function buildAllSlots() {
  const slots = []
  const regionBases = [0, 15, 30, 45]
  const regionNames = ['Midwest', 'West', 'South', 'East']
  regionBases.forEach((base, ri) => {
    for (let offset = 0; offset < 15; offset++) {
      slots.push({
        slotIndex: base + offset,
        round: ROUND_BY_OFFSET[offset],
        region: regionNames[ri],
      })
    }
  })
  slots.push({ slotIndex: 60, round: 'F4',    region: 'Midwest / West' })
  slots.push({ slotIndex: 61, round: 'F4',    region: 'South / East' })
  slots.push({ slotIndex: 62, round: 'Champ', region: 'Final' })
  return slots
}

const ALL_SLOTS = buildAllSlots()

// ─── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, type, visible }) {
  const bg    = type === 'error' ? 'border-red-700/40 bg-slate-800'    : 'border-emerald-700/40 bg-slate-800'
  const text  = type === 'error' ? 'text-red-400'                      : 'text-emerald-400'
  const label = type === 'error' ? '!' : '✓'
  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl
        border shadow-2xl shadow-black/40 transition-all duration-300 pointer-events-none
        ${bg} ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <span className={`text-sm font-bold ${text}`}>{label}</span>
      <span className={`text-sm font-semibold ${text}`}>{message}</span>
    </div>
  )
}

function useToast() {
  const [toast, setToast] = useState({ message: '', type: 'success', visible: false })
  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, visible: true })
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 3000)
  }, [])
  return { toast, showToast }
}

// ─── Scoring config editor ───────────────────────────────────────────────────────

const ROUND_LABELS = [
  { key: 'R64',   label: 'Round of 64' },
  { key: 'R32',   label: 'Round of 32' },
  { key: 'S16',   label: 'Sweet 16' },
  { key: 'E8',    label: 'Elite 8' },
  { key: 'F4',    label: 'Final Four' },
  { key: 'Champ', label: 'Championship' },
]

const DEFAULT_SCORING = { R64: 10, R32: 20, S16: 40, E8: 80, F4: 160, Champ: 320 }

function ScoringConfigEditor({ pool }) {
  const initial = pool?.scoring_config ?? DEFAULT_SCORING
  const [config, setConfig] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    setConfig(pool?.scoring_config ?? DEFAULT_SCORING)
  }, [pool?.scoring_config])

  function handleChange(key, val) {
    const num = parseInt(val, 10)
    setConfig(prev => ({ ...prev, [key]: isNaN(num) ? 0 : num }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    await supabase
      .from('pools')
      .update({ scoring_config: config })
      .eq('id', pool.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function reset() {
    setConfig(DEFAULT_SCORING)
    setSaved(false)
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
      <p className="text-sm font-bold text-white mb-0.5">Scoring Config</p>
      <p className="text-xs text-slate-400 max-w-sm mb-3">
        Points awarded per correct pick in each round. Changes take effect on next score calculation.
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 mb-3">
        {ROUND_LABELS.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</label>
            <input
              type="number"
              min="0"
              step="10"
              value={config[key] ?? 0}
              onChange={(e) => handleChange(key, e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-sm text-white tabular-nums text-center focus:outline-none focus:ring-1 focus:ring-orange-500"
              style={{ fontFamily: 'Space Mono, monospace' }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving || !pool}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
        >
          Reset to Default
        </button>
      </div>
    </div>
  )
}

// ─── Next tipoff picker ─────────────────────────────────────────────────────────

function NextTipoffPicker({ pool, refreshPool }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (pool?.next_tipoff) {
      // Convert UTC ISO to datetime-local format using local time methods
      const d = new Date(pool.next_tipoff)
      const pad = n => String(n).padStart(2, '0')
      const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      setValue(local)
    } else {
      setValue('')
    }
  }, [pool?.next_tipoff])

  async function save(newValue) {
    setSaving(true)
    const tipoff = newValue ? new Date(newValue).toISOString() : null
    await supabase
      .from('pools')
      .update({ next_tipoff: tipoff })
      .eq('id', pool.id)
    setSaving(false)
    if (refreshPool) await refreshPool(pool.id)
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
      <p className="text-sm font-bold text-white mb-0.5">Between-Rounds Countdown</p>
      <p className="text-xs text-slate-400 max-w-sm mb-3">
        Set the next round's tipoff time. Non-admin users will see a countdown
        + leaderboard instead of the full dashboard until this time passes.
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <button
          onClick={() => save(value)}
          disabled={saving || !pool}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Set'}
        </button>
        <button
          onClick={() => { setValue(''); save(''); }}
          disabled={saving || !pool}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all disabled:opacity-50"
        >
          Clear
        </button>
      </div>
      {pool?.next_tipoff && (
        <p className="mt-2 text-xs text-amber-400 font-semibold">
          Countdown active until {new Date(pool.next_tipoff).toLocaleString()}
        </p>
      )}
    </div>
  )
}

// ─── Lock toggle ────────────────────────────────────────────────────────────────

function LockToggle({ pool, onLockChange }) {
  const [locked, setLocked]     = useState(pool?.locked ?? false)
  const [saving, setSaving]     = useState(false)
  const [confirm, setConfirm]   = useState(false)

  useEffect(() => {
    setLocked(pool?.locked ?? false)
  }, [pool])

  async function doToggle(newLocked) {
    setSaving(true)
    const { error } = await supabase
      .from('pools')
      .update({ locked: newLocked })
      .eq('id', pool.id)
    setSaving(false)
    if (!error) {
      setLocked(newLocked)
      onLockChange(newLocked)
    }
    return error
  }

  function handleClick() {
    if (!locked) {
      setConfirm(true)
    } else {
      doToggle(false)
    }
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 flex items-start justify-between gap-6 flex-wrap">
      <div>
        <p className="text-sm font-bold text-white mb-0.5">Pool Lock</p>
        <p className="text-xs text-slate-400 max-w-sm">
          Locking the pool prevents participants from editing or submitting brackets.
          Lock after the bracket is announced and all members have submitted.
        </p>
        <p className={`mt-2 text-xs font-semibold ${locked ? 'text-amber-400' : 'text-emerald-400'}`}>
          {locked ? 'Pool is currently LOCKED' : 'Pool is currently OPEN'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleClick}
          disabled={saving || !pool}
          aria-label="Toggle pool lock"
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors focus:outline-none
            ${locked ? 'bg-amber-500' : 'bg-slate-700'}
            ${saving || !pool ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow-md transform transition-transform
              ${locked ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </button>
        <span className="text-xs font-semibold text-slate-400" style={{ fontFamily: 'Space Mono, monospace' }}>
          {locked ? 'Locked' : 'Open'}
        </span>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-sm font-bold text-white mb-2">Lock the pool?</p>
            <p className="text-xs text-slate-400 mb-5">
              This will prevent all participants from editing or submitting brackets.
              While you can unlock the pool again, any brackets that were auto-locked
              at submission time will remain locked for those individuals.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setConfirm(false)
                  await doToggle(true)
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-white transition-all"
              >
                Yes, Lock Pool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Matchup row ───────────────────────────────────────────────────────────────

function MatchupRow({ offset, regionBase, teamData, onChange }) {
  const slotIndex = regionBase + offset
  const [seed1, seed2] = SEED_MATCHUPS[offset]
  const { team1 = '', team2 = '' } = teamData[slotIndex] ?? {}

  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-800/60 last:border-0">
      <span
        className="text-[10px] text-slate-600 w-6 text-right shrink-0 tabular-nums"
        style={{ fontFamily: 'Space Mono, monospace' }}
      >
        {slotIndex}
      </span>

      <div className="flex items-center gap-1.5 flex-1">
        <span
          className="text-[11px] text-slate-500 w-5 text-center tabular-nums shrink-0"
          style={{ fontFamily: 'Space Mono, monospace' }}
        >
          {seed1}
        </span>
        <input
          type="text"
          value={team1}
          onChange={(e) => onChange(slotIndex, 'team1', e.target.value)}
          placeholder="Team name…"
          className="flex-1 bg-slate-800/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white
            placeholder:text-slate-600 focus:outline-none focus:border-orange-500/60 focus:bg-slate-800 transition-all"
        />
      </div>

      <span
        className="text-[10px] text-slate-600 shrink-0 select-none"
        style={{ fontFamily: 'Space Mono, monospace' }}
      >
        vs
      </span>

      <div className="flex items-center gap-1.5 flex-1">
        <span
          className="text-[11px] text-slate-500 w-5 text-center tabular-nums shrink-0"
          style={{ fontFamily: 'Space Mono, monospace' }}
        >
          {seed2}
        </span>
        <input
          type="text"
          value={team2}
          onChange={(e) => onChange(slotIndex, 'team2', e.target.value)}
          placeholder="Team name…"
          className="flex-1 bg-slate-800/60 border border-slate-700/60 rounded-lg px-2.5 py-1.5 text-xs text-white
            placeholder:text-slate-600 focus:outline-none focus:border-orange-500/60 focus:bg-slate-800 transition-all"
        />
      </div>
    </div>
  )
}

// ─── Region editor ─────────────────────────────────────────────────────────────

function RegionEditor({ region, teamData, onChange, onSave, saving }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          R64 matchups · slots {region.base}–{region.base + 7}
        </p>
        <button
          onClick={() => onSave([region.key])}
          disabled={saving}
          className="px-4 py-1.5 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : `Save ${region.label}`}
        </button>
      </div>

      <div className="flex items-center gap-3 mb-1 text-[10px] text-slate-600 uppercase tracking-widest" style={{ fontFamily: 'Space Mono, monospace' }}>
        <span className="w-6" />
        <span className="flex-1 pl-6">Team 1</span>
        <span className="w-6" />
        <span className="flex-1 pl-6">Team 2</span>
      </div>

      {Array.from({ length: 8 }, (_, offset) => (
        <MatchupRow
          key={offset}
          offset={offset}
          regionBase={region.base}
          teamData={teamData}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

// ─── Members section ───────────────────────────────────────────────────────────

function MembersSection({ showToast, onRemove, membersKey }) {
  const [members,        setMembers]        = useState([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [resetEmail,     setResetEmail]     = useState('')
  const [sendingReset,   setSendingReset]   = useState(false)
  const [removingId,     setRemovingId]     = useState(null)
  const { pool } = usePool()
  const { profile } = useAuth()

  useEffect(() => {
    if (!pool?.id) return
    async function loadMembers() {
      setLoadingMembers(true)
      const { data, error } = await supabase
        .rpc('get_pool_members', { p_pool_id: pool.id })
      if (error) {
        showToast('Failed to load members: ' + error.message, 'error')
      } else {
        setMembers(data ?? [])
      }
      setLoadingMembers(false)
    }
    loadMembers()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool?.id, membersKey])

  async function handleRemove(userId) {
    setRemovingId(userId)
    await onRemove(userId)
    // Optimistically remove from local list so UI updates immediately
    setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    setRemovingId(null)
  }

  async function handleSendReset(e) {
    e.preventDefault()
    if (!resetEmail.trim()) return
    setSendingReset(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin + '/reset-password',
    })
    setSendingReset(false)
    if (error) {
      showToast('Failed to send reset: ' + error.message, 'error')
    } else {
      showToast('Password reset email sent!')
      setResetEmail('')
    }
  }

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-5">
      <div>
        <p className="text-sm font-bold text-white mb-0.5">Members</p>
        <p className="text-xs text-slate-400">
          All participants currently in the pool.
        </p>
      </div>

      {loadingMembers ? (
        <p className="text-xs text-slate-500" style={{ fontFamily: 'Space Mono, monospace' }}>Loading members…</p>
      ) : members.length === 0 ? (
        <p className="text-xs text-slate-500">No members found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800/60">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/80">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ fontFamily: 'Space Mono, monospace' }}>
                  Username
                </th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ fontFamily: 'Space Mono, monospace' }}>
                  Role
                </th>
                <th className="px-4 py-2.5 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest" style={{ fontFamily: 'Space Mono, monospace' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr
                  key={m.user_id ?? m.username ?? i}
                  className={`border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-900/20'}`}
                >
                  <td className="px-4 py-2.5 text-slate-300 font-medium">{m.username ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    {m.is_admin ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-900/40 text-orange-400" style={{ fontFamily: 'Space Mono, monospace' }}>
                        Admin
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-500" style={{ fontFamily: 'Space Mono, monospace' }}>
                        Member
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {m.user_id !== profile?.id && (
                      <button
                        onClick={() => handleRemove(m.user_id)}
                        disabled={removingId === m.user_id}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-red-900/30 text-red-400 hover:bg-red-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {removingId === m.user_id ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Send password reset */}
      <div className="border-t border-slate-800/60 pt-4">
        <p className="text-xs font-semibold text-slate-300 mb-1">Send password reset email</p>
        <p className="text-xs text-slate-500 mb-3">
          Enter a member's email address to send them a password reset link.
        </p>
        <form onSubmit={handleSendReset} className="flex gap-2 flex-wrap">
          <input
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="member@example.com"
            required
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            type="submit"
            disabled={sendingReset || !resetEmail.trim()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {sendingReset ? 'Sending…' : 'Send Reset Email'}
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Pool section ──────────────────────────────────────────────────────────────

function PoolSection({ pool, onLockChange, navigate, showToast }) {
  const [copiedInvite,  setCopiedInvite]  = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const { refreshPool } = usePool()

  const inviteUrl = pool
    ? `${window.location.origin}/join?code=${pool.invite_code}`
    : ''

  function handleCopyInvite() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedInvite(true)
      setTimeout(() => setCopiedInvite(false), 2000)
    })
  }

  async function handleDeletePool() {
    setDeleting(true)
    const { error } = await supabase
      .from('pools')
      .delete()
      .eq('id', pool.id)
    setDeleting(false)
    if (error) {
      showToast('Delete failed: ' + error.message, 'error')
      setConfirmDelete(false)
    } else {
      navigate('/join')
    }
  }

  return (
    <div className="space-y-4">
      {/* Lock toggle */}
      <LockToggle pool={pool} onLockChange={onLockChange} />

      {/* Between-rounds countdown */}
      <NextTipoffPicker pool={pool} refreshPool={refreshPool} />

      {/* Scoring config */}
      <ScoringConfigEditor pool={pool} />

      {/* Invite link */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
        <p className="text-sm font-bold text-white mb-0.5">Invite Link</p>
        <p className="text-xs text-slate-400 mb-3">
          Share this link with participants to let them join the pool directly.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <code
            className="flex-1 min-w-0 text-[11px] bg-slate-950 border border-slate-800 rounded-xl
              px-4 py-2.5 text-cyan-400 font-mono truncate"
          >
            {inviteUrl || 'No pool selected'}
          </code>
          <button
            onClick={handleCopyInvite}
            disabled={!inviteUrl}
            className="px-4 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap
              disabled:opacity-40 disabled:cursor-not-allowed
              border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            {copiedInvite ? 'Copied!' : 'Copy'}
          </button>
        </div>
        {pool && (
          <p className="mt-2 text-[11px] text-slate-600" style={{ fontFamily: 'Space Mono, monospace' }}>
            Code: <span className="text-slate-400">{pool.invite_code}</span>
          </p>
        )}
      </div>

      {/* Danger zone */}
      <div className="bg-slate-900/60 border border-red-900/40 rounded-2xl p-5">
        <p className="text-sm font-bold text-red-400 mb-0.5">Danger Zone</p>
        <p className="text-xs text-slate-400 mb-4">
          Permanently delete this pool along with all members and brackets. This cannot be undone.
        </p>
        <button
          onClick={() => setConfirmDelete(true)}
          disabled={!pool}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-red-900/40 hover:bg-red-900/60 border border-red-800/60 text-red-400 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Delete Pool
        </button>
      </div>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <p className="text-sm font-bold text-white mb-2">Delete pool?</p>
            <p className="text-xs text-slate-400 mb-1">
              This will permanently delete <span className="text-white font-semibold">{pool?.name}</span> along with all members and brackets.
            </p>
            <p className="text-xs text-red-400 mb-5">This action cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeletePool}
                disabled={deleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete Pool'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ESPN ID table ─────────────────────────────────────────────────────────────

function EspnIdSection({ espnIds, teamData, onEspnChange, onEspnSave, saving }) {
  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-white mb-0.5">ESPN ID Mapping</p>
          <p className="text-xs text-slate-400">
            Enter ESPN event IDs for each game slot. Required for the live score poller.
            Fill these in after ESPN publishes game IDs following Selection Sunday.
          </p>
        </div>
        <button
          onClick={onEspnSave}
          disabled={saving}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {saving ? 'Saving…' : 'Save ESPN IDs'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800/60">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800/80 bg-slate-900/80">
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-12" style={{ fontFamily: 'Space Mono, monospace' }}>Slot</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-20" style={{ fontFamily: 'Space Mono, monospace' }}>Round</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-36">Region</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Teams</th>
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest w-40">ESPN ID</th>
            </tr>
          </thead>
          <tbody>
            {ALL_SLOTS.map(({ slotIndex, round, region }, i) => {
              const td = teamData[slotIndex]
              const teamsLabel = td
                ? `${td.seed1 ?? ''} ${td.team1 ?? 'TBD'} vs ${td.seed2 ?? ''} ${td.team2 ?? 'TBD'}`
                : round === 'R64' ? 'TBD vs TBD' : '—'
              return (
                <tr key={slotIndex} className={`border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-900/20'}`}>
                  <td className="px-3 py-1.5">
                    <span className="tabular-nums text-slate-500" style={{ fontFamily: 'Space Mono, monospace' }}>{slotIndex}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                        round === 'R64'   ? 'bg-slate-800 text-slate-400' :
                        round === 'R32'   ? 'bg-blue-900/40 text-blue-400' :
                        round === 'S16'   ? 'bg-violet-900/40 text-violet-400' :
                        round === 'E8'    ? 'bg-amber-900/40 text-amber-400' :
                        round === 'F4'    ? 'bg-orange-900/40 text-orange-400' :
                        'bg-yellow-900/40 text-yellow-400'
                      }`}
                      style={{ fontFamily: 'Space Mono, monospace' }}
                    >
                      {round}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-slate-400 text-[11px]">{region}</td>
                  <td className="px-3 py-1.5 text-slate-500 text-[11px] max-w-[200px] truncate">{teamsLabel}</td>
                  <td className="px-3 py-1.5">
                    <input
                      type="text"
                      value={espnIds[slotIndex] ?? ''}
                      onChange={(e) => onEspnChange(slotIndex, e.target.value)}
                      placeholder="e.g. 401703453"
                      className="w-full bg-slate-800/60 border border-slate-700/60 rounded-lg px-2 py-1 text-[11px] text-white
                        placeholder:text-slate-700 focus:outline-none focus:border-cyan-500/60 transition-all"
                      style={{ fontFamily: 'Space Mono, monospace' }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Poller heartbeat card ─────────────────────────────────────────────────────

function PollerHeartbeatCard() {
  const [heartbeat, setHeartbeat] = useState(null)
  const [now,       setNow]       = useState(Date.now())

  useEffect(() => {
    async function fetchHeartbeat() {
      const { data } = await supabase
        .from('poller_heartbeat')
        .select('*')
        .eq('id', 1)
        .single()
      if (data) setHeartbeat(data)
    }
    fetchHeartbeat()
    const id = setInterval(fetchHeartbeat, 30_000)
    return () => clearInterval(id)
  }, [])

  // Tick "now" every 10s so relative time updates without a refetch
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [])

  const polledAt = heartbeat?.polled_at ? new Date(heartbeat.polled_at) : null
  const ageSec   = polledAt ? Math.floor((now - polledAt.getTime()) / 1000) : null

  function fmtAge(sec) {
    if (sec < 90)   return 'just now'
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`
    return `${Math.floor(sec / 3600)}h ago`
  }

  const hasError = !!heartbeat?.error
  const isStale  = ageSec != null && ageSec > 600        // >10 min
  const isWarn   = !hasError && !isStale && ageSec != null && ageSec > 180  // >3 min
  const isOk     = !hasError && !isStale && !isWarn && polledAt != null

  const dotColor    = hasError || isStale ? 'bg-red-500'     : isWarn ? 'bg-amber-500'  : isOk ? 'bg-emerald-500' : 'bg-slate-600'
  const statusText  = hasError ? 'Error'  : isStale ? 'Stale' : isWarn ? 'Delayed'     : isOk ? 'Running'        : 'No data'
  const statusColor = hasError || isStale ? 'text-red-400'   : isWarn ? 'text-amber-400': isOk ? 'text-emerald-400' : 'text-slate-500'

  return (
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-bold text-white mb-0.5">VPS Poller Status</p>
          <p className="text-xs text-slate-400">Heartbeat written by the server-side poller after each poll cycle.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor} ${isOk ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-semibold ${statusColor}`}>{statusText}</span>
        </div>
      </div>

      {heartbeat ? (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5" style={{ fontFamily: 'Space Mono, monospace' }}>Last poll</p>
            <p className="text-xs text-slate-300 font-semibold">{ageSec != null ? fmtAge(ageSec) : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5" style={{ fontFamily: 'Space Mono, monospace' }}>Pools</p>
            <p className="text-xs text-slate-300 font-semibold">{heartbeat.pools_found}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5" style={{ fontFamily: 'Space Mono, monospace' }}>Updated</p>
            <p className="text-xs text-slate-300 font-semibold">{heartbeat.games_updated} games</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5" style={{ fontFamily: 'Space Mono, monospace' }}>Live now</p>
            <p className={`text-xs font-semibold ${heartbeat.live_count > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
              {heartbeat.live_count} {heartbeat.live_count === 1 ? 'game' : 'games'}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-600 italic">
          No heartbeat data. Start the VPS poller and apply <code className="text-slate-500">poller_heartbeat_migration.sql</code> if not done yet.
        </p>
      )}

      {heartbeat?.error && (
        <div className="mt-3 bg-red-950/30 border border-red-900/40 rounded-xl px-4 py-2.5">
          <p className="text-[10px] text-red-400 font-semibold mb-0.5 uppercase tracking-wider" style={{ fontFamily: 'Space Mono, monospace' }}>Last error</p>
          <p className="text-xs text-red-300 font-mono break-all">{heartbeat.error}</p>
        </div>
      )}
    </div>
  )
}

// ─── Simulation section ────────────────────────────────────────────────────────

function SimulationSection() {
  const { pool } = usePool()
  const simResult = useSimResults(pool?.id)
  const [copied, setCopied] = useState(false)

  const command = pool ? `python api/simulate.py --pool-id ${pool.id}` : ''

  function handleCopy() {
    if (!command) return
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const topPlayers = useMemo(() => {
    if (!simResult?.player_probs) return []
    return Object.entries(simResult.player_probs)
      .map(([name, prob]) => ({ name, prob }))
      .sort((a, b) => b.prob - a.prob)
      .slice(0, 5)
  }, [simResult])

  const runAt = simResult?.run_at
    ? new Date(simResult.run_at).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      })
    : null

  return (
    <div className="space-y-4">
    <PollerHeartbeatCard />
    <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-white mb-0.5">Monte Carlo Simulation</p>
          <p className="text-xs text-slate-400 max-w-lg">
            Run this command from your terminal after each round to update win probabilities,
            leverage games, and best paths. Results push to all players' browsers via Realtime.
          </p>
        </div>
        {runAt && (
          <div className="text-[11px] text-slate-500" style={{ fontFamily: 'Space Mono, monospace' }}>
            Last run: <span className="text-slate-400">{runAt}</span>
            {simResult?.iterations && (
              <span className="ml-2 text-slate-600">
                · {simResult.iterations.toLocaleString()} iters
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <code
          className="flex-1 min-w-0 text-[11px] bg-slate-950 border border-slate-800 rounded-xl
            px-4 py-2.5 text-emerald-400 font-mono truncate"
        >
          {command || 'Select a pool to see the command'}
        </code>
        <button
          onClick={handleCopy}
          disabled={!command}
          className="px-4 py-2 rounded-xl text-xs font-bold border transition-all whitespace-nowrap
            disabled:opacity-40 disabled:cursor-not-allowed
            border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="text-[11px] text-slate-600 space-y-0.5" style={{ fontFamily: 'Space Mono, monospace' }}>
        <p>Optional flags:</p>
        <p className="pl-4 text-slate-700">--iterations 10000 &nbsp; (default; reduce to 2000 for speed)</p>
        <p className="pl-4 text-slate-700">--dry-run &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; (print results without writing to DB)</p>
      </div>

      {topPlayers.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-slate-400 mb-2">
            Current Win Probabilities (top 5)
          </p>
          <div className="space-y-2">
            {topPlayers.map(({ name, prob }, i) => (
              <div key={name} className="flex items-center gap-3">
                <span
                  className="text-[10px] text-slate-600 w-4 text-right tabular-nums shrink-0"
                  style={{ fontFamily: 'Space Mono, monospace' }}
                >
                  {i + 1}
                </span>
                <span className="text-xs text-slate-300 w-28 truncate shrink-0">{name}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 to-amber-400 transition-all"
                    style={{ width: `${Math.max(prob * 100, 1)}%` }}
                  />
                </div>
                <span
                  className={`text-[11px] tabular-nums w-12 text-right shrink-0 font-semibold ${
                    prob > 0.2 ? 'text-emerald-400' : prob > 0.1 ? 'text-amber-400' : 'text-slate-500'
                  }`}
                  style={{ fontFamily: 'Space Mono, monospace' }}
                >
                  {(prob * 100).toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-600 italic">
          No simulation results yet. Run the command above to generate win probabilities.
        </p>
      )}
    </div>
    </div>
  )
}

// ─── Narrative Section ─────────────────────────────────────────────────────────

const PERSONA_LABEL = { stat_nerd: 'Mo', color_commentator: 'Zelda', barkley: 'Davin' }
const PERSONA_COLOR = { stat_nerd: 'text-cyan-400', color_commentator: 'text-violet-400', barkley: 'text-orange-400' }
const PERSONA_KEYS  = ['persona_mo', 'persona_zelda', 'persona_davin']
const PERSONA_NAMES = { persona_mo: 'Mo', persona_zelda: 'Zelda', persona_davin: 'Davin' }

function FeedViewer({ poolId, showToast }) {
  const { entries, loading } = useNarrativeFeed(poolId, { limit: 100 })
  const [personaFilter, setPersonaFilter] = useState('all')
  const [typeFilter, setTypeFilter]       = useState('all')
  const [playerFilter, setPlayerFilter]   = useState('')
  const [clearing, setClearing]           = useState(false)
  const [showClearModal, setShowClearModal] = useState(false)

  const filtered = entries.filter((e) => {
    if (personaFilter !== 'all' && e.persona !== personaFilter) return false
    if (typeFilter !== 'all' && e.entry_type !== typeFilter) return false
    if (playerFilter && !e.player_name?.toLowerCase().includes(playerFilter.toLowerCase())) return false
    return true
  })

  async function clearFeed() {
    setClearing(true)
    try {
      await supabase.from('narrative_feed').delete().eq('pool_id', poolId)
      showToast('Feed cleared.')
    } catch {
      showToast('Failed to clear feed.', 'error')
    }
    setClearing(false)
    setShowClearModal(false)
  }

  const entryTypeBadge = (t) => {
    const map = { alert: 'bg-red-900/40 text-red-400', game_end: 'bg-emerald-900/40 text-emerald-400',
                  deep_dive: 'bg-blue-900/40 text-blue-400', overnight: 'bg-violet-900/40 text-violet-400' }
    return map[t] || 'bg-slate-800 text-slate-400'
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={personaFilter} onChange={(e) => setPersonaFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500">
          <option value="all">All Personas</option>
          <option value="stat_nerd">Mo</option>
          <option value="color_commentator">Zelda</option>
          <option value="barkley">Davin</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500">
          <option value="all">All Types</option>
          <option value="alert">Alert</option>
          <option value="game_end">Game End</option>
          <option value="deep_dive">Deep Dive</option>
          <option value="overnight">Overnight</option>
        </select>
        <input value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}
          placeholder="Filter by player…"
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500" />
        <button onClick={() => setShowClearModal(true)}
          className="ml-auto px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-900/40 hover:bg-red-900/60 border border-red-800/60 text-red-400 transition-all">
          Clear Feed
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-600 italic">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-slate-600 italic">No entries match filters.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
          {filtered.map((e) => (
            <div key={e.id} className={`rounded-xl p-3 border ${e.entry_type === 'alert' ? 'border-red-800/40 bg-red-900/10' : 'border-slate-800/60 bg-slate-900/40'}`}>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs font-bold ${PERSONA_COLOR[e.persona] || 'text-cyan-400'}`}>
                  {PERSONA_LABEL[e.persona] || e.persona}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${entryTypeBadge(e.entry_type)}`}>
                  {e.entry_type}
                </span>
                <span className="text-xs text-slate-500">{e.player_name}</span>
                <span className="text-xs text-slate-600 ml-auto">
                  {new Date(e.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{e.content}</p>
            </div>
          ))}
        </div>
      )}

      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <p className="text-sm font-bold text-white mb-1">Clear Narrative Feed?</p>
            <p className="text-xs text-slate-400 mb-4">This removes all feed entries for this pool. Cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowClearModal(false)}
                className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all">
                Cancel
              </button>
              <button onClick={clearFeed} disabled={clearing}
                className="flex-1 px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-all disabled:opacity-50">
                {clearing ? 'Clearing…' : 'Clear Feed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function LogViewer({ poolId }) {
  const { entries, loading } = useNarrativeLog(poolId)
  const [levelFilter, setLevelFilter]     = useState('all')
  const [sourceFilter, setSourceFilter]   = useState('all')
  const [typeFilter, setTypeFilter]       = useState('all')
  const [expandedId, setExpandedId]       = useState(null)

  const filtered = entries.filter((e) => {
    if (levelFilter !== 'all' && e.level !== levelFilter) return false
    if (sourceFilter !== 'all' && e.source !== sourceFilter) return false
    if (typeFilter !== 'all' && e.event_type !== typeFilter) return false
    return true
  })

  // Compute today's stats from narrative_call entries
  const today = new Date().toISOString().slice(0, 10)
  const todayEntries = entries.filter((e) => e.created_at?.startsWith(today))
  const todayErrors  = todayEntries.filter((e) => e.level === 'error').length
  const callEntries  = todayEntries.filter((e) => e.event_type === 'narrative_call' && e.metadata?.latency_ms)
  const avgLatency   = callEntries.length
    ? Math.round(callEntries.reduce((s, e) => s + (e.metadata.latency_ms || 0), 0) / callEntries.length)
    : null
  const cacheHits    = callEntries.filter((e) => (e.metadata?.cache_read_tokens || 0) > 0).length
  const cacheRate    = callEntries.length ? Math.round((cacheHits / callEntries.length) * 100) : null

  const levelClass = (l) => ({ error: 'text-red-400', warn: 'text-amber-400', info: 'text-slate-400' }[l] || 'text-slate-400')
  const levelBg    = (l) => ({ error: 'bg-red-900/10 border-red-800/30', warn: 'bg-amber-900/10 border-amber-800/30', info: 'bg-slate-900/40 border-slate-800/40' }[l] || '')

  const eventTypes = [...new Set(entries.map((e) => e.event_type))].sort()

  return (
    <div className="space-y-3">
      {/* Stats bar */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-500">
        <span>Today: <span className="text-white font-semibold">{todayEntries.length}</span> events</span>
        <span>Errors: <span className={todayErrors > 0 ? 'text-red-400 font-semibold' : 'text-white font-semibold'}>{todayErrors}</span></span>
        {avgLatency !== null && <span>Avg latency: <span className="text-white font-semibold">{avgLatency}ms</span></span>}
        {cacheRate !== null && <span>Cache hit: <span className="text-white font-semibold">{cacheRate}%</span></span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500">
          <option value="all">All Levels</option>
          <option value="error">Error</option>
          <option value="warn">Warn</option>
          <option value="info">Info</option>
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500">
          <option value="all">All Sources</option>
          <option value="poller">Poller</option>
          <option value="simulate">Simulate</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-orange-500">
          <option value="all">All Events</option>
          {eventTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-xs text-slate-600 italic">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-slate-600 italic">No log entries yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-1 pr-1">
          {filtered.map((e) => (
            <div key={e.id}
              className={`rounded-xl border px-3 py-2 cursor-pointer transition-all ${levelBg(e.level)}`}
              onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold ${levelClass(e.level)}`}>{e.level.toUpperCase()}</span>
                <span className="text-xs text-slate-500 bg-slate-800/60 px-1.5 py-0.5 rounded">{e.source}</span>
                <span className="text-xs text-slate-400">{e.event_type}</span>
                <span className="text-xs text-slate-300 flex-1 truncate">{e.message}</span>
                <span className="text-xs text-slate-600 ml-auto whitespace-nowrap">
                  {new Date(e.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET
                </span>
              </div>
              {expandedId === e.id && e.metadata && Object.keys(e.metadata).length > 0 && (
                <pre className="mt-2 bg-slate-800 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {JSON.stringify(e.metadata, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function NarrativeControls({ poolId, showToast }) {
  const { configs, loading, upsertConfig, deactivateConfig, getConfig } = useNarrativeConfig(poolId)
  const [personaTexts, setPersonaTexts] = useState({ persona_mo: '', persona_zelda: '', persona_davin: '' })
  const [instruction, setInstruction]   = useState('')
  const [triggerType, setTriggerType]   = useState('deep_dive')
  const [saving, setSaving]             = useState({})

  // Load existing persona overrides into textareas
  useEffect(() => {
    if (loading) return
    const updated = {}
    for (const key of PERSONA_KEYS) {
      const val = getConfig('persona_override', key)
      updated[key] = val?.content || ''
    }
    setPersonaTexts(updated)
  }, [configs, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  async function savePersona(key) {
    setSaving((s) => ({ ...s, [key]: true }))
    const { error } = await upsertConfig('persona_override', key, { content: personaTexts[key] }, poolId)
    setSaving((s) => ({ ...s, [key]: false }))
    if (error) showToast('Failed to save persona.', 'error')
    else showToast(`${PERSONA_NAMES[key]} persona saved.`)
  }

  async function resetPersona(key) {
    const existing = configs.find((c) => c.config_type === 'persona_override' && c.config_key === key)
    if (!existing) return
    const { error } = await deactivateConfig(existing.id)
    if (error) showToast('Failed to reset.', 'error')
    else {
      setPersonaTexts((t) => ({ ...t, [key]: '' }))
      showToast(`${PERSONA_NAMES[key]} reset to default.`)
    }
  }

  async function sendInstruction() {
    if (!instruction.trim()) return
    const { error } = await upsertConfig('instruction', 'next_instruction',
      { text: instruction.trim(), one_shot: true }, poolId)
    if (error) showToast('Failed to send instruction.', 'error')
    else {
      setInstruction('')
      showToast('Instruction queued for next cycle.')
    }
  }

  async function fireTrigger() {
    const { error } = await upsertConfig('trigger', 'manual_trigger',
      { narrative_type: triggerType }, null) // global trigger (pool_id=null so poller catches it)
    if (error) showToast('Failed to queue trigger.', 'error')
    else showToast('Trigger queued — poller picks up within 60s.')
  }

  const feedEnabled = getConfig('setting', 'feed_enabled')
  const isFeedEnabled = feedEnabled === null ? true : Boolean(feedEnabled)
  async function toggleFeed() {
    await upsertConfig('setting', 'feed_enabled', !isFeedEnabled, poolId)
    showToast(`Narratives ${!isFeedEnabled ? 'enabled' : 'disabled'}.`)
  }

  const activeInstruction = getConfig('instruction', 'next_instruction')

  return (
    <div className="space-y-5">
      {/* Feed enabled toggle */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-white">Narrative Feed</p>
          <p className="text-xs text-slate-400">{isFeedEnabled ? 'Narratives are enabled for this pool.' : 'Narratives are disabled — no new entries will be generated.'}</p>
        </div>
        <button onClick={toggleFeed}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            isFeedEnabled ? 'bg-emerald-600/30 border border-emerald-600/40 text-emerald-400 hover:bg-emerald-600/50'
                          : 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'
          }`}>
          {isFeedEnabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {/* Manual trigger */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
        <p className="text-sm font-bold text-white mb-0.5">Manual Trigger</p>
        <p className="text-xs text-slate-400 mb-3">Fire a narrative cycle immediately. Poller picks up within 60s.</p>
        <div className="flex gap-2">
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500">
            <option value="overnight">Overnight</option>
            <option value="deep_dive">Deep Dive</option>
            <option value="game_end">Game End</option>
            <option value="alert">Alert</option>
          </select>
          <button onClick={fireTrigger}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition-all">
            Fire Now
          </button>
        </div>
      </div>

      {/* Next-cycle instruction */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
        <p className="text-sm font-bold text-white mb-0.5">Next Cycle Instruction</p>
        <p className="text-xs text-slate-400 mb-3">One-shot instruction injected into the next narrative call, then auto-consumed.</p>
        {activeInstruction && (
          <div className="mb-3 px-3 py-2 bg-amber-900/20 border border-amber-800/40 rounded-xl text-xs text-amber-300">
            Queued: "{activeInstruction.text}"
          </div>
        )}
        <div className="flex gap-2">
          <input value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. roast danhudder, focus on Iowa game, tone it down…"
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500" />
          <button onClick={sendInstruction} disabled={!instruction.trim()}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-orange-500 hover:bg-orange-400 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            Send
          </button>
        </div>
      </div>

      {/* Persona editors */}
      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4">
        <p className="text-sm font-bold text-white mb-0.5">Persona Overrides</p>
        <p className="text-xs text-slate-400 mb-4">
          Override a persona's system prompt for this pool. Leave blank to use the default file from disk.
          Changes take effect on the next narrative cycle.
        </p>
        <div className="space-y-4">
          {PERSONA_KEYS.map((key) => {
            const hasOverride = configs.some((c) => c.config_type === 'persona_override' && c.config_key === key)
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-bold text-white">{PERSONA_NAMES[key]}</span>
                  {hasOverride && (
                    <span className="text-xs px-2 py-0.5 bg-orange-500/20 border border-orange-500/30 text-orange-400 rounded-full">Override active</span>
                  )}
                </div>
                <textarea
                  value={personaTexts[key]}
                  onChange={(e) => setPersonaTexts((t) => ({ ...t, [key]: e.target.value }))}
                  placeholder={`Enter custom system prompt for ${PERSONA_NAMES[key]}. Leave blank to use default persona_${key.split('_')[1]}.md`}
                  rows={5}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-y font-mono"
                />
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => savePersona(key)} disabled={saving[key] || !personaTexts[key].trim()}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-orange-500 hover:bg-orange-400 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    {saving[key] ? 'Saving…' : 'Save Override'}
                  </button>
                  {hasOverride && (
                    <button onClick={() => resetPersona(key)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-400 transition-all">
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NarrativeSection({ pool, showToast }) {
  const [subTab, setSubTab] = useState('feed')
  const SUB_TABS = [
    { key: 'feed',     label: 'Feed' },
    { key: 'logs',     label: 'Logs' },
    { key: 'controls', label: 'Controls' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {SUB_TABS.map((t) => (
          <button key={t.key} onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              subTab === t.key
                ? 'bg-orange-500/15 border border-orange-500/40 text-orange-400'
                : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
        {subTab === 'feed' && (
          <>
            <p className="text-sm font-bold text-white mb-0.5">Narrative Feed</p>
            <p className="text-xs text-slate-400 mb-4">Live broadcast booth entries for this pool.</p>
            <FeedViewer poolId={pool?.id} showToast={showToast} />
          </>
        )}
        {subTab === 'logs' && (
          <>
            <p className="text-sm font-bold text-white mb-0.5">Event Log</p>
            <p className="text-xs text-slate-400 mb-4">Structured events from poller and narrative generation. 7-day retention.</p>
            <LogViewer poolId={pool?.id} />
          </>
        )}
        {subTab === 'controls' && (
          <>
            <p className="text-sm font-bold text-white mb-0.5">Narrative Controls</p>
            <p className="text-xs text-slate-400 mb-4">Manage personas, inject instructions, and trigger narrative cycles.</p>
            <NarrativeControls poolId={pool?.id} showToast={showToast} />
          </>
        )}
      </div>
    </div>
  )
}

// ─── Admin tab bar ─────────────────────────────────────────────────────────────

const ADMIN_TABS = [
  { key: 'bracket',    label: 'Bracket' },
  { key: 'members',   label: 'Members' },
  { key: 'pool',      label: 'Pool' },
  { key: 'simulation', label: 'Simulation' },
  { key: 'narrative',  label: 'Narrative' },
]

function AdminTabBar({ activeTab, onTabChange }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {ADMIN_TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
            activeTab === tab.key
              ? 'bg-orange-500/15 border border-orange-500/40 text-orange-400'
              : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { profile } = useAuth()
  const { pool, refreshPool } = usePool()
  const navigate = useNavigate()

  const [adminTab,   setAdminTab]   = useState('bracket')
  const [activeTab,  setActiveTab]  = useState('midwest')
  const [teamData,   setTeamData]   = useState({})
  const [espnIds,    setEspnIds]    = useState({})
  const [loading,    setLoading]    = useState(true)
  const [savingTeam, setSavingTeam] = useState(false)
  const [savingEspn, setSavingEspn] = useState(false)
  const [membersKey, setMembersKey] = useState(0)
  const { toast, showToast } = useToast()

  const slotMapping = useMemo(() => {
    const mapping = {}
    Object.entries(espnIds).forEach(([slotIndex, espnId]) => {
      if (espnId) mapping[espnId] = Number(slotIndex)
    })
    return mapping
  }, [espnIds])

  const { isPolling } = useEspnPoller(slotMapping)
  const mappedCount = Object.keys(slotMapping).length

  // ── Load all games on mount ─────────────────────────────────────────────────
  useEffect(() => {
    async function loadGames() {
      setLoading(true)
      const { data, error } = await supabase
        .from('games')
        .select('slot_index, round, region, teams, espn_id')
        .order('slot_index')

      if (error) {
        showToast('Failed to load games: ' + error.message, 'error')
        setLoading(false)
        return
      }

      const td = {}
      const ei = {}
      ;(data ?? []).forEach((g) => {
        if (g.teams) {
          td[g.slot_index] = {
            team1: g.teams.team1 ?? '',
            seed1: g.teams.seed1 ?? null,
            team2: g.teams.team2 ?? '',
            seed2: g.teams.seed2 ?? null,
          }
        }
        if (g.espn_id != null) {
          ei[g.slot_index] = g.espn_id
        }
      })
      setTeamData(td)
      setEspnIds(ei)
      setLoading(false)
    }
    loadGames()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Pre-fill 2026 bracket ────────────────────────────────────────────────────
  function prefillBracket() {
    setTeamData((prev) => {
      const next = { ...prev }
      Object.entries(PREFILLED_R64).forEach(([slot, d]) => {
        next[Number(slot)] = { team1: d.team1, seed1: d.seed1, team2: d.team2, seed2: d.seed2 }
      })
      return next
    })
    setEspnIds((prev) => {
      const next = { ...prev }
      Object.entries(PREFILLED_R64).forEach(([slot, d]) => {
        next[Number(slot)] = d.espnId
      })
      return next
    })
    showToast('Pre-filled 32 R64 games — click Save to persist.')
  }

  // ── Handle team name input changes ──────────────────────────────────────────
  function handleTeamChange(slotIndex, field, value) {
    setTeamData((prev) => ({
      ...prev,
      [slotIndex]: { ...(prev[slotIndex] ?? {}), [field]: value },
    }))
  }

  // ── Save region(s) ──────────────────────────────────────────────────────────
  async function saveRegions(regionKeys) {
    setSavingTeam(true)
    const upserts = []

    regionKeys.forEach((rKey) => {
      const region = REGIONS.find((r) => r.key === rKey)
      if (!region) return
      SEED_MATCHUPS.forEach(([seed1, seed2], offset) => {
        const slotIndex = region.base + offset
        const current = teamData[slotIndex] ?? {}
        upserts.push({
          slot_index: slotIndex,
          round: 'R64',
          region: rKey,
          teams: {
            team1: current.team1 ?? '',
            seed1,
            team2: current.team2 ?? '',
            seed2,
          },
          updated_at: new Date().toISOString(),
        })
      })
    })

    const { error } = await supabase
      .from('games')
      .upsert(upserts, { onConflict: 'slot_index' })

    setSavingTeam(false)

    if (error) {
      showToast('Save failed: ' + error.message, 'error')
    } else {
      setTeamData((prev) => {
        const next = { ...prev }
        upserts.forEach(({ slot_index, teams }) => {
          next[slot_index] = {
            team1: teams.team1,
            seed1: teams.seed1,
            team2: teams.team2,
            seed2: teams.seed2,
          }
        })
        return next
      })
      showToast(
        regionKeys.length === 4
          ? 'All regions saved!'
          : `${REGIONS.find((r) => r.key === regionKeys[0])?.label} saved!`
      )
    }
  }

  // ── Handle ESPN ID input changes ────────────────────────────────────────────
  function handleEspnChange(slotIndex, value) {
    setEspnIds((prev) => ({ ...prev, [slotIndex]: value }))
  }

  // ── Save all ESPN IDs ───────────────────────────────────────────────────────
  async function saveEspnIds() {
    setSavingEspn(true)

    const updates = Object.entries(espnIds)
      .filter(([, v]) => v !== '' && v != null)
      .map(([slotIndex, espnId]) => {
        const idx  = parseInt(slotIndex, 10)
        const meta = ALL_SLOTS.find((s) => s.slotIndex === idx)
        const td   = teamData[idx]
        return {
          slot_index:  idx,
          espn_id:     espnId.trim() || null,
          round:       meta?.round  ?? 'R64',
          region:      meta?.region ?? '',
          status:      'pending',
          teams:       td ? { team1: td.team1, seed1: td.seed1, team2: td.team2, seed2: td.seed2 } : {},
          updated_at:  new Date().toISOString(),
        }
      })

    if (updates.length === 0) {
      setSavingEspn(false)
      showToast('No ESPN IDs to save.', 'error')
      return
    }

    const { error } = await supabase
      .from('games')
      .upsert(updates, { onConflict: 'slot_index' })

    setSavingEspn(false)

    if (error) {
      showToast('ESPN ID save failed: ' + error.message, 'error')
    } else {
      showToast('ESPN IDs saved!')
    }
  }

  // ── Remove member ────────────────────────────────────────────────────────────
  async function removeMember(userId) {
    const { error } = await supabase
      .rpc('remove_pool_member', { p_pool_id: pool.id, p_user_id: userId })
    if (error) {
      showToast('Failed to remove member: ' + error.message, 'error')
    } else {
      showToast('Member removed.')
      setMembersKey((k) => k + 1)
      refreshPool()
    }
  }

  // ── Access denied ───────────────────────────────────────────────────────────
  if (!profile?.is_admin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-3xl mb-3" aria-hidden>&#x26D4;</p>
        <h2 className="text-lg font-bold text-white mb-2">Access Denied</h2>
        <p className="text-sm text-slate-400">This page is only accessible to pool administrators.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500 text-sm" style={{ fontFamily: 'Space Mono, monospace' }}>Loading games…</p>
      </div>
    )
  }

  const activeRegion = REGIONS.find((r) => r.key === activeTab)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

      {/* Page header — always visible */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Admin Panel</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Selection Sunday team editor · pool lock · ESPN ID mapping
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Pre-fill button */}
          <button
            onClick={prefillBracket}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all whitespace-nowrap shadow-lg shadow-emerald-900/20"
          >
            Pre-fill 2026 Bracket
          </button>
          {/* ESPN polling status */}
          <div className="flex items-center gap-2 text-xs bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-1.5">
            <span className="relative flex h-2 w-2 shrink-0">
              {isPolling ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </>
              ) : (
                <span className={`relative inline-flex rounded-full h-2 w-2 ${mappedCount > 0 ? 'bg-slate-500' : 'bg-amber-500'}`} />
              )}
            </span>
            <span className="text-slate-400">
              ESPN{' '}
              {isPolling
                ? <span className="text-emerald-400 font-medium">polling…</span>
                : <span className="text-slate-500">idle</span>
              }
            </span>
            <span className="text-slate-600">·</span>
            <span className={mappedCount === 63 ? 'text-emerald-400 font-medium' : mappedCount > 0 ? 'text-amber-400' : 'text-slate-500'}>
              {mappedCount}/63 IDs mapped
            </span>
          </div>
          {pool && (
            <div className="text-xs text-slate-500 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-1.5">
              Pool: <span className="text-slate-300 font-semibold">{pool.name}</span>
              <span className="ml-3 text-slate-600">#{pool.invite_code}</span>
            </div>
          )}
        </div>
      </div>

      {/* Admin tab bar */}
      <AdminTabBar activeTab={adminTab} onTabChange={setAdminTab} />

      {/* Tab: Bracket */}
      {adminTab === 'bracket' && (
        <>
          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div>
                <p className="text-sm font-bold text-white mb-0.5">R64 Team Editor</p>
                <p className="text-xs text-slate-400">
                  Enter the 64 team names after the bracket is announced on Selection Sunday.
                  Seeds are fixed — only team names need to be updated.
                </p>
              </div>
              <button
                onClick={() => saveRegions(REGIONS.map((r) => r.key))}
                disabled={savingTeam}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-orange-500 to-amber-500
                  hover:from-orange-400 hover:to-amber-400 text-white transition-all
                  disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-lg shadow-orange-900/20"
              >
                {savingTeam ? 'Saving…' : 'Save All Regions'}
              </button>
            </div>

            {/* Region tabs */}
            <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-1">
              {REGIONS.map((region) => (
                <button
                  key={region.key}
                  onClick={() => setActiveTab(region.key)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    activeTab === region.key
                      ? 'text-white'
                      : 'bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                  style={
                    activeTab === region.key
                      ? { background: `${region.color}22`, border: `1px solid ${region.color}55`, color: region.color }
                      : {}
                  }
                >
                  {region.label}
                </button>
              ))}
            </div>

            {activeRegion && (
              <RegionEditor
                region={activeRegion}
                teamData={teamData}
                onChange={handleTeamChange}
                onSave={saveRegions}
                saving={savingTeam}
              />
            )}
          </div>

          <EspnIdSection
            espnIds={espnIds}
            teamData={teamData}
            onEspnChange={handleEspnChange}
            onEspnSave={saveEspnIds}
            saving={savingEspn}
          />
        </>
      )}

      {/* Tab: Members */}
      {adminTab === 'members' && (
        <MembersSection
          showToast={showToast}
          onRemove={removeMember}
          membersKey={membersKey}
        />
      )}

      {/* Tab: Pool */}
      {adminTab === 'pool' && (
        <PoolSection
          pool={pool}
          onLockChange={(locked) => {
            showToast(locked ? 'Pool locked.' : 'Pool unlocked.')
            refreshPool()
          }}
          navigate={navigate}
          showToast={showToast}
        />
      )}

      {/* Tab: Simulation */}
      {adminTab === 'simulation' && (
        <SimulationSection />
      )}

      {/* Tab: Narrative */}
      {adminTab === 'narrative' && (
        <NarrativeSection pool={pool} showToast={showToast} />
      )}

      {/* Toast */}
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  )
}
