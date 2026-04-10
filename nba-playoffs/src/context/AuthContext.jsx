import { createContext, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { clearDemoMode, getDemoStorageKeys, isDemoModeEnabled, readJson, setDemoModeEnabled, writeJson } from '../lib/demoMode'

export const AuthContext = createContext(null)

const { session: DEMO_SESSION_KEY, users: DEMO_USERS_KEY } = getDemoStorageKeys()

function buildSession(user) {
  return { user }
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username ?? user.user_metadata?.username ?? user.email?.split('@')[0] ?? 'demo-user',
    is_admin: Boolean(user.is_admin),
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!isSupabaseConfigured || isDemoModeEnabled()) {
      const stored = readJson(DEMO_SESSION_KEY, null)
      if (stored?.user) {
        setSession(stored)
        setProfile(stored.user)
      }
      setLoading(false)
      return undefined
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id, session)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session) {
          fetchProfile(session.user.id, session)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId, session) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!profileData && session?.user) {
      await supabase.from('profiles').insert({
        id: session.user.id,
        username: session.user.user_metadata?.username || session.user.email.split('@')[0]
      })
      const { data: retried } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      setProfile(retried ?? null)
    } else {
      setProfile(profileData ?? null)
    }

    setLoading(false)
  }

  async function signIn(email, password) {
    if (!isSupabaseConfigured || isDemoModeEnabled()) {
      const users = readJson(DEMO_USERS_KEY, [])
      const found = users.find((user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password)
      if (!found) return { error: { message: "Invalid email or password" } }

      const nextSession = buildSession(sanitizeUser(found))
      setDemoModeEnabled(true)
      writeJson(DEMO_SESSION_KEY, nextSession)
      setSession(nextSession)
      setProfile(nextSession.user)
      return { data: nextSession }
    }

    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signUp(email, password, username) {
    if (!isSupabaseConfigured || isDemoModeEnabled()) {
      const users = readJson(DEMO_USERS_KEY, [])
      if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
        return { error: { message: "User already registered" } }
      }

      const nextUser = {
        id: crypto.randomUUID(),
        email,
        password,
        username,
        is_admin: users.length === 0,
      }
      users.push(nextUser)
      writeJson(DEMO_USERS_KEY, users)

      const nextSession = buildSession(sanitizeUser(nextUser))
      setDemoModeEnabled(true)
      writeJson(DEMO_SESSION_KEY, nextSession)
      setSession(nextSession)
      setProfile(nextSession.user)
      return { data: nextSession }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } }
    })
    if (error || !data.user) return { error }

    let profile = null
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 1000))
      const { data: p } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      if (p) { profile = p; break }
    }

    if (!profile) {
      await supabase.from('profiles').insert({ id: data.user.id, username })
    }

    return { data }
  }

  async function continueAsDemo() {
    const users = readJson(DEMO_USERS_KEY, [])
    let demoUser = users[0]

    if (!demoUser) {
      demoUser = {
        id: crypto.randomUUID(),
        email: "demo@sportscloset.app",
        password: "demo",
        username: "demo-commissioner",
        is_admin: true,
      }
      writeJson(DEMO_USERS_KEY, [demoUser])
    }

    const nextSession = buildSession(sanitizeUser(demoUser))
    setDemoModeEnabled(true)
    writeJson(DEMO_SESSION_KEY, nextSession)
    setSession(nextSession)
    setProfile(nextSession.user)
    return { data: nextSession }
  }

  async function resetPassword(email) {
    if (!isSupabaseConfigured || isDemoModeEnabled()) {
      return { error: { message: `Demo mode is active. Password reset is unavailable for ${email}.` } }
    }
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
  }

  async function signOut() {
    if (!isSupabaseConfigured || isDemoModeEnabled()) {
      clearDemoMode()
      window.localStorage.removeItem(DEMO_SESSION_KEY)
      setSession(null)
      setProfile(null)
      return
    }
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signOut, resetPassword, continueAsDemo, isDemoMode: !isSupabaseConfigured || isDemoModeEnabled() }}>
      {children}
    </AuthContext.Provider>
  )
}
