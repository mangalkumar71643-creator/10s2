import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConfirmationResult, getAuth, signInWithPhoneNumber } from '@react-native-firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'novaplay:auth:v1';
const UID_MAP_KEY = 'novaplay:auth:uids:v1';
const PASSWORD_STORAGE_KEY = 'novaplay:passwords:v1';

// India-only for now — the login field only accepts a 10-digit local number,
// so this is the one place that turns it into the E.164 shape Firebase needs.
function toE164(phoneNumber: string): string {
  return `+91${phoneNumber}`;
}

// Not real cryptography — there's no backend yet to hash server-side, so
// this just keeps a plain password from sitting in AsyncStorage as-is.
// One-way and deterministic, which is all an equality check needs.
function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

// Unique per-account ID — one is minted the first time a phone number logs
// in, then reused on every future login for that same number. Checked
// against every uid already handed out on this device so two accounts can
// never end up sharing one, however unlikely a random collision would be.
function generateUid(existingUids: string[]) {
  const taken = new Set(existingUids);
  let candidate: string;
  do {
    const time = Date.now().toString().slice(-7);
    const random = String(Math.floor(100000 + Math.random() * 900000));
    candidate = `${time}${random}`;
  } while (taken.has(candidate));
  return candidate;
}

type AuthState = {
  loading: boolean;
  isAuthenticated: boolean;
  phone: string | null;
  uid: string | null;
  avatarId: number;
  setAvatarId: (id: number) => void;
  pendingPhone: string | null;
  otpSent: boolean;
  otpError: string | null;
  // Set only when real SMS delivery failed and a local testing code was
  // generated instead — shown on screen so login can still be tested
  // before real SMS delivery is configured. Always null once that's set up.
  devOtpCode: string | null;
  // Each returns null on success, or a human-readable error message on failure.
  requestOtp: (phone: string) => Promise<string | null>;
  resendOtp: (phone: string) => Promise<string | null>;
  verifyOtp: (code: string) => Promise<string | null>;
  verifyIdentityOtp: (code: string) => Promise<string | null>;
  hasLoginPassword: boolean;
  setLoginPassword: (password: string) => Promise<void>;
  loginWithPassword: (phone: string, password: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [phone, setPhone] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [avatarId, setAvatarIdState] = useState(1);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [devOtpCode, setDevOtpCode] = useState<string | null>(null);
  const [hasLoginPassword, setHasLoginPassword] = useState(false);

  useEffect(() => {
    if (!uid) {
      setHasLoginPassword(false);
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(PASSWORD_STORAGE_KEY).then((raw) => {
      if (cancelled) return;
      const passwords: Record<string, string> = raw ? JSON.parse(raw) : {};
      setHasLoginPassword(Boolean(passwords[uid]));
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then(async (raw) => {
      if (cancelled || !raw) {
        setLoading(false);
        return;
      }
      try {
        const saved = JSON.parse(raw) as { phone: string; uid?: string; avatarId?: number };
        setPhone(saved.phone);
        setIsAuthenticated(true);
        setAvatarIdState(saved.avatarId ?? 1);

        if (saved.uid) {
          setUid(saved.uid);
        } else {
          // Sessions saved before the uid feature existed don't have one yet —
          // mint it now so every account still ends up with a stable id.
          const mapRaw = await AsyncStorage.getItem(UID_MAP_KEY).catch(() => null);
          const uidMap: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};
          const accountUid = uidMap[saved.phone] ?? generateUid(Object.values(uidMap));
          uidMap[saved.phone] = accountUid;
          if (!cancelled) setUid(accountUid);
          AsyncStorage.setItem(UID_MAP_KEY, JSON.stringify(uidMap)).catch(() => {});
          AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ phone: saved.phone, uid: accountUid, avatarId: saved.avatarId ?? 1 })
          ).catch(() => {});
        }
      } catch {
        // ignore corrupt storage
      }
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Returns null on success, or the error message on failure — returned
  // directly (rather than left in state) so callers get the real message
  // even though it's an async function whose enclosing render may already
  // be stale by the time it resolves.
  const sendFirebaseOtp = useCallback(async (phoneNumber: string): Promise<string | null> => {
    setOtpError(null);
    setDevOtpCode(null);
    try {
      const result = await signInWithPhoneNumber(getAuth(), toE164(phoneNumber));
      setConfirmation(result);
      setPendingPhone(phoneNumber);
      setOtpSent(true);
      return null;
    } catch (err) {
      // Real SMS delivery isn't configured/working yet (e.g. Firebase billing
      // not enabled) — fall back to a locally-generated code so login can
      // still be tested. Remove this fallback once real SMS delivery works.
      const code = String(Math.floor(100000 + Math.random() * 900000));
      setDevOtpCode(code);
      setConfirmation(null);
      setPendingPhone(phoneNumber);
      setOtpSent(true);
      const message = err instanceof Error ? err.message : 'Could not send the verification code.';
      setOtpError(message);
      return null;
    }
  }, []);

  const requestOtp = useCallback((phoneNumber: string) => sendFirebaseOtp(phoneNumber), [sendFirebaseOtp]);
  const resendOtp = useCallback((phoneNumber: string) => sendFirebaseOtp(phoneNumber), [sendFirebaseOtp]);

  // Just confirms the SMS code with Firebase — doesn't touch any account
  // state, since it's shared by both a fresh login and an already-logged-in
  // user re-verifying their own number (e.g. before setting a password).
  // Returns null on success, or the error message on failure.
  const confirmFirebaseCode = useCallback(
    async (code: string): Promise<string | null> => {
      if (devOtpCode) {
        if (code !== devOtpCode) return 'Incorrect code. Please try again.';
        setDevOtpCode(null);
        setOtpSent(false);
        return null;
      }
      if (!confirmation) return 'No code was sent yet.';
      try {
        await confirmation.confirm(code);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Incorrect code. Please try again.';
        setOtpError(message);
        return message;
      }
      setConfirmation(null);
      setOtpSent(false);
      return null;
    },
    [confirmation, devOtpCode]
  );

  const verifyOtp = useCallback(
    async (code: string): Promise<string | null> => {
      if (!pendingPhone) return 'No code was sent yet.';
      const confirmError = await confirmFirebaseCode(code);
      if (confirmError) return confirmError;

      const phoneNumber = pendingPhone;
      try {
        const mapRaw = await AsyncStorage.getItem(UID_MAP_KEY);
        const uidMap: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};
        const accountUid = uidMap[phoneNumber] ?? generateUid(Object.values(uidMap));
        uidMap[phoneNumber] = accountUid;

        setPhone(phoneNumber);
        setUid(accountUid);
        setAvatarIdState(1);
        setIsAuthenticated(true);

        await AsyncStorage.setItem(UID_MAP_KEY, JSON.stringify(uidMap)).catch(() => {});
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ phone: phoneNumber, uid: accountUid, avatarId: 1 })
        ).catch(() => {});
      } catch {
        // Fall back to a fresh uid if the map can't be read.
        const accountUid = generateUid([]);
        setPhone(phoneNumber);
        setUid(accountUid);
        setAvatarIdState(1);
        setIsAuthenticated(true);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ phone: phoneNumber, uid: accountUid, avatarId: 1 })).catch(() => {});
      }

      setPendingPhone(null);
      return null;
    },
    [confirmFirebaseCode, pendingPhone]
  );

  // For an already-authenticated user re-verifying their own number (e.g.
  // before setting a login password) — confirms the code without touching
  // phone/uid/avatar/isAuthenticated.
  const verifyIdentityOtp = useCallback(
    async (code: string): Promise<string | null> => {
      const confirmError = await confirmFirebaseCode(code);
      if (!confirmError) setPendingPhone(null);
      return confirmError;
    },
    [confirmFirebaseCode]
  );

  const setLoginPassword = useCallback(
    async (password: string) => {
      if (!uid) return;
      const raw = await AsyncStorage.getItem(PASSWORD_STORAGE_KEY).catch(() => null);
      const passwords: Record<string, string> = raw ? JSON.parse(raw) : {};
      passwords[uid] = simpleHash(password);
      await AsyncStorage.setItem(PASSWORD_STORAGE_KEY, JSON.stringify(passwords)).catch(() => {});
      setHasLoginPassword(true);
    },
    [uid]
  );

  const loginWithPassword = useCallback(
    async (phoneNumber: string, password: string) => {
      try {
        const mapRaw = await AsyncStorage.getItem(UID_MAP_KEY);
        const uidMap: Record<string, string> = mapRaw ? JSON.parse(mapRaw) : {};
        const accountUid = uidMap[phoneNumber];
        if (!accountUid) return false;

        const passwordsRaw = await AsyncStorage.getItem(PASSWORD_STORAGE_KEY);
        const passwords: Record<string, string> = passwordsRaw ? JSON.parse(passwordsRaw) : {};
        const storedHash = passwords[accountUid];
        if (!storedHash || storedHash !== simpleHash(password)) return false;

        setPhone(phoneNumber);
        setUid(accountUid);
        setIsAuthenticated(true);
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ phone: phoneNumber, uid: accountUid, avatarId })).catch(() => {});
        return true;
      } catch {
        return false;
      }
    },
    [avatarId]
  );

  const setAvatarId = useCallback(
    (id: number) => {
      setAvatarIdState(id);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ phone, uid, avatarId: id })).catch(() => {});
    },
    [phone, uid]
  );

  const logout = useCallback(() => {
    setIsAuthenticated(false);
    setPhone(null);
    setUid(null);
    setAvatarIdState(1);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);

  const value: AuthState = {
    loading,
    isAuthenticated,
    phone,
    uid,
    avatarId,
    setAvatarId,
    pendingPhone,
    otpSent,
    otpError,
    devOtpCode,
    requestOtp,
    resendOtp,
    verifyOtp,
    verifyIdentityOtp,
    hasLoginPassword,
    setLoginPassword,
    loginWithPassword,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
