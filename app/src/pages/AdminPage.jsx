import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { usePool } from '../hooks/usePool'

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
      // about to lock — show confirm dialog
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
        {/* Toggle switch */}
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

      {/* Confirm dialog */}
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
      {/* Slot badge */}
      <span
        className="text-[10px] text-slate-600 w-6 text-right shrink-0 tabular-nums"
        style={{ fontFamily: 'Space Mono, monospace' }}
      >
        {slotIndex}
      </span>

      {/* Team 1 */}
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

      {/* vs */}
      <span
        className="text-[10px] text-slate-600 shrink-0 select-none"
        style={{ fontFamily: 'Space Mono, monospace' }}
      >
        vs
      </span>

      {/* Team 2 */}
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

      {/* Column headers */}
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

function MembersSection({ showToast }) {
  const [members,       setMembers]       = useState([])
  const [loadingMembers,setLoadingMembers] = useState(true)
  const [resetEmail,    setResetEmail]    = useState('')
  const [sendingReset,  setSendingReset]  = useState(false)
  const { pool } = usePool()

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
  }, [pool?.id])

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

      {/* Members table */}
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { profile } = useAuth()
  const { pool, refreshPool } = usePool()

  const [activeTab,  setActiveTab]  = useState('midwest')
  const [teamData,   setTeamData]   = useState({})   // { [slotIndex]: { team1, seed1, team2, seed2 } }
  const [espnIds,    setEspnIds]    = useState({})   // { [slotIndex]: espnId }
  const [loading,    setLoading]    = useState(true)
  const [savingTeam, setSavingTeam] = useState(false)
  const [savingEspn, setSavingEspn] = useState(false)
  const { toast, showToast } = useToast()

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
      // Reflect seed values back into local state
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
      .map(([slotIndex, espnId]) => ({
        slot_index: parseInt(slotIndex, 10),
        espn_id: espnId.trim() || null,
        updated_at: new Date().toISOString(),
      }))

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

      {/* Page header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-bold text-white">Admin Panel</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Selection Sunday team editor · pool lock · ESPN ID mapping
          </p>
        </div>
        {pool && (
          <div className="text-xs text-slate-500 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-1.5">
            Pool: <span className="text-slate-300 font-semibold">{pool.name}</span>
            <span className="ml-3 text-slate-600">#{pool.invite_code}</span>
          </div>
        )}
      </div>

      {/* Lock toggle */}
      <LockToggle
        pool={pool}
        onLockChange={(locked) => {
          showToast(locked ? 'Pool locked.' : 'Pool unlocked.')
          refreshPool()
        }}
      />

      {/* Team editor card */}
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

        {/* Active region editor */}
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

      {/* Members + send reset email */}
      <MembersSection showToast={showToast} />

      {/* ESPN ID mapping */}
      <EspnIdSection
        espnIds={espnIds}
        teamData={teamData}
        onEspnChange={handleEspnChange}
        onEspnSave={saveEspnIds}
        saving={savingEspn}
      />

      {/* Toast */}
      <Toast message={toast.message} type={toast.type} visible={toast.visible} />
    </div>
  )
}
