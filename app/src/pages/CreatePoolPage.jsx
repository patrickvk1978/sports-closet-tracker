import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePool } from '../hooks/usePool'
import { useAuth } from '../hooks/useAuth'

export default function CreatePoolPage() {
  const { createPool } = usePool()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  const [name,    setName]    = useState('')
  const [created, setCreated] = useState(null)  // { name, invite_code }
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleCreate(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { pool, error } = await createPool(name.trim())
    setLoading(false)
    if (error) { setError(error); return }
    setCreated(pool)
  }

  if (created) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="text-4xl">🎉</div>
          <div>
            <h1 className="text-xl font-bold text-white">{created.name}</h1>
            <p className="text-sm text-slate-400 mt-1">Your pool is ready!</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-6">
            <p className="text-xs text-slate-500 mb-3">Share this invite code with your players</p>
            <div
              className="text-3xl font-bold text-orange-400 tracking-widest py-3"
              style={{ fontFamily: 'Space Mono, monospace' }}
            >
              {created.invite_code}
            </div>
            <button
              onClick={() => navigator.clipboard?.writeText(created.invite_code)}
              className="mt-2 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Copy to clipboard
            </button>
          </div>

          <button
            onClick={() => navigate('/submit')}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold hover:from-orange-400 hover:to-amber-400 transition-all"
          >
            Create My Bracket
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">

        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <div
            className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white text-base mb-3"
            style={{ fontFamily: 'Space Mono, monospace' }}
          >
            SC
          </div>
          <h1 className="text-xl font-bold text-white">Create a Pool</h1>
          <p className="text-sm text-slate-500 mt-1">You'll be the admin and get an invite code.</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Pool Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Office 2026 Bracket"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating…' : 'Create Pool'}
            </button>
          </form>
        </div>

        <button
          onClick={() => navigate('/join')}
          className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-2"
        >
          ← Back to join
        </button>

        <button
          onClick={signOut}
          className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-1"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
