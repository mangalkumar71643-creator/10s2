import React, { createContext, useContext, useEffect, useState } from "react";
import { getToken, setToken as persistToken } from "../api/client";
import { fetchMe, login as loginRequest, register as registerRequest } from "../api/endpoints";
import { User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    country: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const me = await fetchMe();
          setUser(me);
        } catch {
          await persistToken(null);
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const result = await loginRequest(email, password);
    await persistToken(result.token);
    setUser(result.user);
  }

  async function register(input: Parameters<AuthContextValue["register"]>[0]) {
    const result = await registerRequest(input);
    await persistToken(result.token);
    setUser(result.user);
  }

  async function logout() {
    await persistToken(null);
    setUser(null);
  }

  async function refreshUser() {
    const me = await fetchMe();
    setUser(me);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
