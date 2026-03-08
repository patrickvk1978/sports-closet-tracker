import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePool } from '../hooks/usePool'
import { useAuth } from '../hooks/useAuth'

export default function JoinPoolPage() {
  const { joinPool, createPool } = usePool()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const [code,    setCode]    = useState('')
  const [error,   setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleJoin(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { pool, error } = await joinPool(code)
    setLoading(false)
    if (error) { setError(error); return }
    navigate('/')
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
          <h1 className="text-xl font-bold text-white">Join a Pool</h1>
          {profile?.username && (
            <p className="text-sm text-slate-500 mt-1">Signed in as {profile.username}</p>
          )}
        </div>

        {/* Join card */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-6">
          <h2 className="text-sm font-bold text-white mb-1">Enter Invite Code</h2>
          <p className="text-xs text-slate-500 mb-4">Get the 6-character code from your pool admin.</p>

          <form onSubmit={handleJoin} className="space-y-3">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={6}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl font-bold text-white tracking-widest placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500 uppercase"
              style={{ fontFamily: 'Space Mono, monospace' }}
            />

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Joining…' : 'Join Pool'}
            </button>
          </form>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-600">or</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Create pool CTA */}
        <button
          onClick={() => navigate('/create-pool')}
          className="w-full py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
        >
          Create a New Pool
        </button>

        <button
          onClick={signOut}
          className="w-full text-xs text-slate-600 hover:text-slate-400 transition-colors py-2"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
