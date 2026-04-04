import { createContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signUp(email, password, username) {
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

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
