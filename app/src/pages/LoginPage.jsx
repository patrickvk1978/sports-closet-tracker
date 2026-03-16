import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const navigate = useNavigate()

  const [tab,         setTab]         = useState('signin')  // 'signin' | 'signup'
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [username,    setUsername]    = useState('')
  const [error,       setError]       = useState(null)
  const [emailExists, setEmailExists] = useState(false)
  const [loading,     setLoading]     = useState(false)

  // Forgot password state
  const [showForgot,      setShowForgot]      = useState(false)
  const [forgotEmail,     setForgotEmail]     = useState('')
  const [forgotLoading,   setForgotLoading]   = useState(false)
  const [forgotError,     setForgotError]     = useState(null)
  const [forgotSuccess,   setForgotSuccess]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setEmailExists(false)
    setLoading(true)

    try {
      if (tab === 'signin') {
        const { error } = await signIn(email, password)
        if (error) { setError(error.message); return }
        navigate('/')
      } else {
        if (!username.trim()) { setError('Username is required'); return }
        const { error } = await signUp(email, password, username.trim())
        if (error) {
          const msg = error.message ?? ''
          if (
            msg.toLowerCase().includes('already registered') ||
            msg.toLowerCase().includes('already in use')
          ) {
            setEmailExists(true)
          } else {
            setError(msg || 'Sign-up failed')
          }
          return
        }
        // After sign-up, user still needs to join/create a pool
        navigate('/join')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotSubmit(e) {
    e.preventDefault()
    setForgotError(null)
    setForgotLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: window.location.origin + '/reset-password',
      })
      if (error) {
        setForgotError(error.message)
      } else {
        setForgotSuccess(true)
      }
    } finally {
      setForgotLoading(false)
    }
  }

  function handleTabChange(key) {
    setTab(key)
    setError(null)
    setEmailExists(false)
    setShowForgot(false)
    setForgotSuccess(false)
    setForgotError(null)
    setForgotEmail('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center font-bold text-white text-base mb-3"
            style={{ fontFamily: 'Space Mono, monospace' }}
          >
            SC
          </div>
          <h1 className="text-xl font-bold text-white">Tournament Tracker</h1>
          <p className="text-sm text-slate-500 mt-1">Sports Closet March Madness Pool</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">

          {/* Tabs */}
          <div className="flex border-b border-slate-800/60">
            {[['signin', 'Sign In'], ['signup', 'Sign Up']].map(([key, label]) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  tab === key
                    ? 'text-white bg-slate-800/50'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {tab === 'signup' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your_bracket_name"
                  required
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              {tab === 'signin' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowForgot((v) => !v)
                    setForgotError(null)
                    setForgotSuccess(false)
                    setForgotEmail('')
                  }}
                  className="mt-1.5 text-xs text-slate-500 hover:text-orange-400 transition-colors"
                >
                  Forgot password?
                </button>
              )}
            </div>

            {/* Inline forgot password form */}
            {tab === 'signin' && showForgot && (
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-300">Reset your password</p>
                {forgotSuccess ? (
                  <p className="text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-800/30 rounded-xl px-4 py-2.5">
                    Check your email for a password reset link.
                  </p>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Your email address</label>
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                    {forgotError && (
                      <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-2.5">
                        {forgotError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleForgotSubmit}
                      disabled={forgotLoading || !forgotEmail.trim()}
                      className="w-full py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {forgotLoading ? 'Sending…' : 'Send reset link'}
                    </button>
                  </>
                )}
              </div>
            )}

            {emailExists && tab === 'signup' && (
              <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-2.5 space-y-1">
                <p>An account with this email already exists. Try signing in instead.</p>
                <button
                  type="button"
                  onClick={() => handleTabChange('signin')}
                  className="text-orange-400 underline hover:text-orange-300 transition-colors"
                >
                  Switch to Sign In
                </button>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-xl px-4 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : 'Create Account'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[11px] text-slate-600">or</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Google OAuth */}
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              className="w-full flex items-center justify-center gap-3 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-sm font-semibold transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/>
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
              </svg>
              Continue with Google
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
