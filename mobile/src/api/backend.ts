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

export interface AuthResult {
  user: BackendUser;
  token: string;
  isNewUser: boolean;
}

export function fetchBackendMe() {
  return apiFetch<BackendUser>('/auth/me');
}

export interface OtpRequestResult {
  /** Only present when the backend's SMS_PROVIDER_MODE=mock — shows the
   * code on-screen for local testing since no real SMS is sent. */
  devCode: string | null;
}

export function requestPhoneOtp(phone: string) {
  return apiFetch<OtpRequestResult>('/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  });
}

export function verifyPhoneOtp(phone: string, code: string) {
  return apiFetch<AuthResult>('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phone, code }),
  });
}

export function completePhoneProfile(input: {
  phone: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  country: string;
}) {
  return apiFetch<AuthResult>('/auth/otp/complete-profile', {
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

export type GameType = 'coinflip' | 'dice';

export interface GameRoundResult {
  round: {
    id: string;
    gameKey: string;
    gameType: GameType;
    target: number | null;
    stake: string;
    multiplier: string;
    payout: string;
    won: boolean;
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
    createdAt: string;
  };
  newBalance: string;
}

export function playGameForReal(
  gameKey: string,
  stake: number,
  gameType: GameType = 'coinflip',
  target?: number
) {
  return apiFetch<GameRoundResult>(`/games/${gameKey}/play`, {
    method: 'POST',
    body: JSON.stringify({ stake, gameType, target }),
  });
}

export interface FairnessStatus {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export function fetchFairnessStatus() {
  return apiFetch<FairnessStatus>('/games/fairness');
}

export function setFairnessClientSeed(clientSeed: string) {
  return apiFetch<FairnessStatus>('/games/fairness/client-seed', {
    method: 'PUT',
    body: JSON.stringify({ clientSeed }),
  });
}

export interface RotateSeedResult {
  revealedServerSeed: string;
  revealedServerSeedHash: string;
  newServerSeedHash: string;
}

export function rotateFairnessSeed() {
  return apiFetch<RotateSeedResult>('/games/fairness/rotate', { method: 'POST' });
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
