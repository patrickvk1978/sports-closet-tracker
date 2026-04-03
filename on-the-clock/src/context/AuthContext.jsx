import { createContext, useEffect, useState } from "react";

export const AuthContext = createContext(null);

const SESSION_KEY = "otc_mock_session";
const USERS_KEY = "otc_mock_users";

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
      if (stored) {
        setSession(stored);
        setProfile(stored.user);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  async function signIn(email, password) {
    const users = readUsers();
    const found = users.find((user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password);
    if (!found) return { error: { message: "Invalid email or password" } };

    const nextSession = { user: { id: found.id, username: found.username, email: found.email, is_admin: found.is_admin } };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setProfile(nextSession.user);
    return { data: nextSession };
  }

  async function signUp(email, password, username) {
    const users = readUsers();
    if (users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
      return { error: { message: "User already registered" } };
    }

    const newUser = {
      id: crypto.randomUUID(),
      email,
      password,
      username,
      is_admin: users.length === 0,
    };
    users.push(newUser);
    writeUsers(users);

    const nextSession = { user: { id: newUser.id, username: newUser.username, email: newUser.email, is_admin: newUser.is_admin } };
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setProfile(nextSession.user);
    return { data: nextSession };
  }

  async function signOut() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
