import { apiFetch } from './client';

export interface BackendUser {
  id: string;
  // Short public-facing account number ("UID" in the UI) — a 5-digit
  // number unique per account, separate from the internal `id` above.
  uid: number | null;
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
  lockedBonus: string;
  wageringRequired: string;
  wageringProgress: string;
  payoutAccountHolderName: string | null;
  payoutAccountNumber: string | null;
  payoutIfsc: string | null;
  hasPayoutAccount: boolean;
  firstDepositBonusClaimed: boolean;
  withdrawable: number;
  dailyWithdrawalLimit: number;
  remainingWithdrawalLimit: number;
}

export interface DepositResult extends BackendWallet {
  bonusGranted: number;
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
    | 'BONUS'
    | 'DEPOSIT_BONUS'
    | 'WITHDRAWAL_REVERSAL';
  amount: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
}

export function fetchBackendTransactions() {
  return apiFetch<BackendTransaction[]>('/wallet/transactions');
}

export function depositToWallet(amount: number) {
  return apiFetch<DepositResult>('/wallet/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function withdrawFromWallet(amount: number) {
  return apiFetch<BackendWallet>('/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function setPayoutBankAccount(accountHolderName: string, accountNumber: string, ifsc: string) {
  return apiFetch<BackendWallet>('/wallet/payout-account', {
    method: 'PUT',
    body: JSON.stringify({ accountHolderName, accountNumber, ifsc }),
  });
}

export interface SupportTicketResult {
  id: string;
  topic: string;
  message: string | null;
  status: 'OPEN' | 'RESOLVED';
  createdAt: string;
}

export function escalateSupportTicket(topic: string, message?: string) {
  return apiFetch<SupportTicketResult>('/support/escalate', {
    method: 'POST',
    body: JSON.stringify({ topic, message }),
  });
}

/** Mints a short-lived, chat-scoped token for the Live Support web page
 * (see backend/public/chat.html) — deliberately not the user's full
 * session token, since this one gets opened in the device browser. */
export function startChatSession() {
  return apiFetch<{ chatToken: string }>('/support/chat/session', { method: 'POST' });
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

export type ColorGameDuration = 30 | 60 | 180 | 300 | 600;

export interface ColorGameConfig {
  durations: ColorGameDuration[];
  minStake: number;
  maxStake: number;
  lockSeconds: number;
  payouts: { number: number; color: number; colorMixed: number; violet: number; size: number };
  platformFeePercent: number;
}

export function fetchColorGameConfig() {
  return apiFetch<ColorGameConfig>('/color-game/config');
}

export interface ColorGameRoundView {
  periodNumber: string;
  durationSeconds: number;
  startTime: string;
  endTime: string;
  serverSeedHash: string;
  timeRemainingSeconds: number;
  locked: boolean;
}

export function fetchColorGameCurrentRound(duration: ColorGameDuration) {
  return apiFetch<ColorGameRoundView>(`/color-game/${duration}/current`);
}

export interface ColorGameHistoryEntry {
  periodNumber: string;
  startTime: string;
  endTime: string;
  resultNumber: number;
  resultSize: 'BIG' | 'SMALL';
  serverSeed: string;
  serverSeedHash: string;
}

export function fetchColorGameHistory(duration: ColorGameDuration) {
  return apiFetch<ColorGameHistoryEntry[]>(`/color-game/${duration}/history`);
}

export type ColorGameBetType = 'NUMBER' | 'COLOR' | 'SIZE';

export interface ColorGameBetResult {
  id: string;
  roundId: string;
  userId: string;
  betType: ColorGameBetType;
  betValue: string;
  amount: string;
  payoutMultiplier: string;
  status: 'PENDING' | 'WON' | 'LOST';
  payout: string;
  createdAt: string;
}

export function placeColorGameBet(duration: ColorGameDuration, betType: ColorGameBetType, betValue: string, amount: number) {
  return apiFetch<ColorGameBetResult>(`/color-game/${duration}/bet`, {
    method: 'POST',
    body: JSON.stringify({ betType, betValue, amount }),
  });
}

export interface ColorGameMyBet extends ColorGameBetResult {
  round: {
    periodNumber: string;
    durationSeconds: number;
    resultNumber: number | null;
    resultSize: 'BIG' | 'SMALL' | null;
    settled: boolean;
  };
}

export function fetchColorGameMyBets() {
  return apiFetch<ColorGameMyBet[]>('/color-game/my-bets');
}

// ---- Aviator --------------------------------------------------------------

export interface AviatorConfig {
  minStake: number;
  maxStake: number;
  bettingDurationSeconds: number;
  resultPauseSeconds: number;
  growthRate: number;
  houseEdgePercent: number;
  minAutoCashout: number;
}

export function fetchAviatorConfig() {
  return apiFetch<AviatorConfig>('/aviator/config');
}

export type AviatorPhase = 'BETTING' | 'FLYING' | 'CRASHED';

export interface AviatorRoundView {
  periodNumber: string;
  bettingStartTime: string;
  flyStartTime: string;
  // Both null until the round actually crashes — derived from the secret
  // crash point, so the backend withholds them until then (see
  // aviatorService.ts's getCurrentRoundView).
  crashTime: string | null;
  endTime: string | null;
  serverSeedHash: string;
  phase: AviatorPhase;
  multiplier: number;
  crashMultiplier: number | null;
}

export function fetchAviatorCurrentRound() {
  return apiFetch<AviatorRoundView>('/aviator/current');
}

export interface AviatorHistoryEntry {
  periodNumber: string;
  bettingStartTime: string;
  crashMultiplier: number;
  serverSeed: string;
  serverSeedHash: string;
}

export function fetchAviatorHistory() {
  return apiFetch<AviatorHistoryEntry[]>('/aviator/history');
}

export interface AviatorBetResult {
  id: string;
  roundId: string;
  userId: string;
  amount: string;
  autoCashoutAt: string | null;
  cashoutMultiplier: string | null;
  status: 'PENDING' | 'WON' | 'LOST';
  payout: string;
  createdAt: string;
}

export function placeAviatorBet(amount: number, autoCashoutAt?: number) {
  return apiFetch<AviatorBetResult>('/aviator/bet', {
    method: 'POST',
    body: JSON.stringify({ amount, autoCashoutAt }),
  });
}

export function cashOutAviatorBet(betId: string) {
  return apiFetch<{ multiplier: number; payout: number }>('/aviator/cashout', {
    method: 'POST',
    body: JSON.stringify({ betId }),
  });
}

export function fetchAviatorMyCurrentBet() {
  return apiFetch<AviatorBetResult | null>('/aviator/my-current-bet');
}

export interface AviatorMyBet extends AviatorBetResult {
  round: {
    periodNumber: string;
    crashMultiplier: string;
    settled: boolean;
  };
}

export function fetchAviatorMyBets() {
  return apiFetch<AviatorMyBet[]>('/aviator/my-bets');
}
