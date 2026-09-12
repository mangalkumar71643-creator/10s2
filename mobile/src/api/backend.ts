import { apiFetch } from './client';

export interface BackendUser {
  id: string;
  phone: string | null;
  email: string | null;
  firstName: string;
  lastName: string;
  kycStatus: 'NOT_STARTED' | 'PENDING' | 'APPROVED' | 'REJECTED';
  isSelfExcluded: boolean;
  selfExclusionUntil: string | null;
  depositLimitDaily: string | null;
  depositLimitWeekly: string | null;
  depositLimitMonthly: string | null;
  role: 'USER' | 'ADMIN';
}

export interface PhoneVerifyResult {
  user: BackendUser;
  token: string;
  isNewUser: boolean;
}

export function fetchBackendMe() {
  return apiFetch<BackendUser>('/auth/me');
}

export function phoneVerify(input: {
  idToken: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  country?: string;
}) {
  return apiFetch<PhoneVerifyResult>('/auth/phone/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export interface BackendWallet {
  id: string;
  balance: string;
  currency: string;
}

export function fetchBackendWallet() {
  return apiFetch<BackendWallet>('/wallet');
}

export interface BackendTransaction {
  id: string;
  type:
    | 'DEPOSIT'
    | 'WITHDRAWAL'
    | 'BET_STAKE'
    | 'BET_PAYOUT'
    | 'BET_REFUND'
    | 'GAME_STAKE'
    | 'GAME_PAYOUT'
    | 'BONUS';
  amount: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export function fetchBackendTransactions() {
  return apiFetch<BackendTransaction[]>('/wallet/transactions');
}

export function depositToWallet(amount: number) {
  return apiFetch<BackendWallet>('/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function withdrawFromWallet(amount: number) {
  return apiFetch<BackendWallet>('/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function submitBackendKyc(documentType: string, documentReference: string) {
  return apiFetch('/kyc/submit', {
    method: 'POST',
    body: JSON.stringify({ documentType, documentReference }),
  });
}

export function setBackendDepositLimits(input: {
  depositLimitDaily?: number | null;
  depositLimitWeekly?: number | null;
  depositLimitMonthly?: number | null;
}) {
  return apiFetch('/responsible-gambling/deposit-limits', { method: 'PUT', body: JSON.stringify(input) });
}

export function selfExcludeBackend(days: number) {
  return apiFetch('/responsible-gambling/self-exclude', { method: 'POST', body: JSON.stringify({ days }) });
}

export interface GameConfig {
  minStake: number;
  maxStake: number;
  rtp: number;
}

export function fetchGameConfig() {
  return apiFetch<GameConfig>('/games/config');
}

export interface GameRoundResult {
  round: {
    id: string;
    gameKey: string;
    stake: string;
    multiplier: string;
    payout: string;
    won: boolean;
    createdAt: string;
  };
  newBalance: string;
}

export function playGameForReal(gameKey: string, stake: number) {
  return apiFetch<GameRoundResult>(`/games/${gameKey}/play`, {
    method: 'POST',
    body: JSON.stringify({ stake }),
  });
}

export interface DailyBonusStatus {
  dailyStreak: number;
  lastDailyClaimAt: string | null;
  claimedToday: boolean;
}

export function fetchDailyBonusStatus() {
  return apiFetch<DailyBonusStatus>('/games/daily-bonus/status');
}

export interface DailyBonusClaimResult {
  streak: number;
  amount: number;
  newBalance: string;
}

export function claimBackendDailyBonus() {
  return apiFetch<DailyBonusClaimResult>('/games/daily-bonus/claim', { method: 'POST' });
}
