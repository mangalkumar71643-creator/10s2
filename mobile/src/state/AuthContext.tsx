import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConfirmationResult, getAuth, signInWithPhoneNumber } from '@react-native-firebase/auth';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  BackendUser,
  fetchBackendMe,
  phoneVerify,
  PhoneVerifyResult,
  setBackendDepositLimits,
  selfExcludeBackend,
  submitBackendKyc,
} from '../api/backend';
import { ApiClientError, setBackendToken } from '../api/client';

const STORAGE_KEY = 'novaplay:auth:v1';
const UID_MAP_KEY = 'novaplay:auth:uids:v1';
const PASSWORD_STORAGE_KEY = 'novaplay:passwords:v1';
const BACKEND_TOKEN_MAP_KEY = 'novaplay:auth:backendTokens:v1';

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

export type ProfileFields = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
};

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

  // Real-money backend account (separate from the local phone/uid session
  // above, which predates the backend). `backendUser` is the source of
  // truth for KYC status, self-exclusion and deposit limits.
  backendUser: BackendUser | null;
  // True once phone verification succeeds for a brand-new phone number —
  // the backend needs name/DOB/country (for the 18+ check) before it will
  // create the account. RootNavigator shows CompleteProfileScreen while
  // this is true.
  needsProfile: boolean;
  completeProfile: (fields: ProfileFields) => Promise<string | null>;
  refreshBackendUser: () => Promise<void>;
  submitKyc: () => Promise<string | null>;
  setDepositLimits: (input: {
    depositLimitDaily?: number | null;
    depositLimitWeekly?: number | null;
    depositLimitMonthly?: number | null;
  }) => Promise<string | null>;
  selfExclude: (days: number) => Promise<string | null>;
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
  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [pendingIdToken, setPendingIdToken] = useState<string | null>(null);

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
        if (!saved.uid) throw new Error('pre-backend session, needs re-login');

        // The backend JWT is stored per-account (keyed by backend user id,
        // which is what `uid` is now) so it survives app restarts and
        // password-login without going through OTP again.
        const tokenMapRaw = await AsyncStorage.getItem(BACKEND_TOKEN_MAP_KEY).catch(() => null);
        const tokenMap: Record<string, string> = tokenMapRaw ? JSON.parse(tokenMapRaw) : {};
        const token = tokenMap[saved.uid];
        if (!token) throw new Error('no backend session for this account, needs re-login');

        await setBackendToken(token);
        const me = await fetchBackendMe();

        if (cancelled) return;
        setPhone(saved.phone);
        setUid(saved.uid);
        setAvatarIdState(saved.avatarId ?? 1);
        setBackendUser(me);
        setIsAuthenticated(true);
      } catch {
        // Corrupt storage, or the backend session is gone/expired — fall
        // back to signed-out so the user re-verifies via OTP.
        await setBackendToken(null);
        await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
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

  // Prefers a real Firebase ID token (works once PHONE_AUTH_MODE=live and
  // Firebase Admin is configured server-side); falls back to the E.164
  // phone number, which is what the backend's MockPhoneVerifier expects
  // in local dev (PHONE_AUTH_MODE=mock, the default — see backend README).
  const getIdTokenOrPhone = useCallback(async (phoneNumber: string, wasDevOtp: boolean): Promise<string> => {
    if (!wasDevOtp) {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (token) return token;
      } catch {
        // fall through to the phone-number fallback
      }
    }
    return toE164(phoneNumber);
  }, []);

  // Persists the backend session (JWT + phone->uid map) and flips on
  // isAuthenticated. Shared by the direct-login and complete-profile paths.
  const completeBackendLogin = useCallback(async (phoneNumber: string, result: PhoneVerifyResult) => {
    await setBackendToken(result.token);

    const tokenMapRaw = await AsyncStorage.getItem(BACKEND_TOKEN_MAP_KEY).catch(() => null);
    const tokenMap: Record<string, string> = tokenMapRaw ? JSON.parse(tokenMapRaw) : {};
    tokenMap[result.user.id] = result.token;
    await AsyncStorage.setItem(BACKEND_TOKEN_MAP_KEY, JSON.stringify(tokenMap)).catch(() => {});

    const uidMapRaw = await AsyncStorage.getItem(UID_MAP_KEY).catch(() => null);
    const uidMap: Record<string, string> = uidMapRaw ? JSON.parse(uidMapRaw) : {};
    uidMap[phoneNumber] = result.user.id;
    await AsyncStorage.setItem(UID_MAP_KEY, JSON.stringify(uidMap)).catch(() => {});

    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ phone: phoneNumber, uid: result.user.id, avatarId: 1 })
    ).catch(() => {});

    setPhone(phoneNumber);
    setUid(result.user.id);
    setAvatarIdState(1);
    setBackendUser(result.user);
    setIsAuthenticated(true);
    setNeedsProfile(false);
    setPendingIdToken(null);
    setPendingPhone(null);
  }, []);

  const verifyOtp = useCallback(
    async (code: string): Promise<string | null> => {
      if (!pendingPhone) return 'No code was sent yet.';
      const wasDevOtp = !!devOtpCode;
      const confirmError = await confirmFirebaseCode(code);
      if (confirmError) return confirmError;

      const phoneNumber = pendingPhone;
      const idToken = await getIdTokenOrPhone(phoneNumber, wasDevOtp);

      try {
        const result = await phoneVerify({ idToken });
        await completeBackendLogin(phoneNumber, result);
        return null;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 428) {
          // Brand-new phone number — hold onto the token and let
          // CompleteProfileScreen finish registration with name/DOB/country.
          setPendingIdToken(idToken);
          setNeedsProfile(true);
          return null;
        }
        const message = err instanceof Error ? err.message : 'Could not verify your account. Please try again.';
        setOtpError(message);
        return message;
      }
    },
    [confirmFirebaseCode, devOtpCode, getIdTokenOrPhone, completeBackendLogin, pendingPhone]
  );

  const completeProfile = useCallback(
    async (fields: ProfileFields): Promise<string | null> => {
      if (!pendingIdToken || !pendingPhone) return 'Your session expired — please verify your number again.';
      try {
        const result = await phoneVerify({ idToken: pendingIdToken, ...fields });
        await completeBackendLogin(pendingPhone, result);
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not create your account. Please try again.';
      }
    },
    [pendingIdToken, pendingPhone, completeBackendLogin]
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

        // This local password is just a device-side shortcut past OTP — the
        // backend session it unlocks must already exist from a prior OTP
        // login, since only that path can mint a real wallet/KYC account.
        const tokenMapRaw = await AsyncStorage.getItem(BACKEND_TOKEN_MAP_KEY);
        const tokenMap: Record<string, string> = tokenMapRaw ? JSON.parse(tokenMapRaw) : {};
        const token = tokenMap[accountUid];
        if (!token) return false;

        await setBackendToken(token);
        const me = await fetchBackendMe();

        setPhone(phoneNumber);
        setUid(accountUid);
        setBackendUser(me);
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
    setBackendUser(null);
    setNeedsProfile(false);
    setPendingIdToken(null);
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    setBackendToken(null).catch(() => {});
  }, []);

  const refreshBackendUser = useCallback(async () => {
    const me = await fetchBackendMe();
    setBackendUser(me);
  }, []);

  const submitKyc = useCallback(async (): Promise<string | null> => {
    try {
      // A real KYC provider would collect an actual document upload here —
      // this backend endpoint is a mock (auto-approve) in dev mode, see
      // backend/src/services/kycService.ts.
      await submitBackendKyc('passport', `doc_${Date.now()}`);
      await refreshBackendUser();
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Could not submit KYC verification.';
    }
  }, [refreshBackendUser]);

  const setDepositLimits = useCallback(
    async (input: {
      depositLimitDaily?: number | null;
      depositLimitWeekly?: number | null;
      depositLimitMonthly?: number | null;
    }): Promise<string | null> => {
      try {
        await setBackendDepositLimits(input);
        await refreshBackendUser();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not update deposit limits.';
      }
    },
    [refreshBackendUser]
  );

  const selfExclude = useCallback(
    async (days: number): Promise<string | null> => {
      try {
        await selfExcludeBackend(days);
        await refreshBackendUser();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : 'Could not self-exclude.';
      }
    },
    [refreshBackendUser]
  );

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
    backendUser,
    needsProfile,
    completeProfile,
    refreshBackendUser,
    submitKyc,
    setDepositLimits,
    selfExclude,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
