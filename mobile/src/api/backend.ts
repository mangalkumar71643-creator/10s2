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

export function fetchAviatorHistory(limit = 30) {
  return apiFetch<AviatorHistoryEntry[]>(`/aviator/history?limit=${limit}`);
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

// Every player's bet on a round, masked to just first+last letter of
// their name (e.g. "m***l") — never phone/email/uid.
export interface AviatorPublicBet {
  id: string;
  player: string;
  amount: string;
  cashoutMultiplier: string | null;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST';
  createdAt: string;
}

export function fetchAviatorRoundBets(periodNumber: string, limit = 100) {
  return apiFetch<AviatorPublicBet[]>(
    `/aviator/round-bets?periodNumber=${encodeURIComponent(periodNumber)}&limit=${limit}`
  );
}

export function fetchAviatorTopBets(limit = 50) {
  return apiFetch<AviatorPublicBet[]>(`/aviator/top-bets?limit=${limit}`);
}

// ---- Chicken Road ----------------------------------------------------
// Unlike Aviator/Win Go there's no shared round — each play is its own
// private round the player steps through and cashes out (or busts) on
// their own.

export type ChickenRoadDifficulty = 'EASY' | 'MEDIUM' | 'HARD' | 'HARDCORE';

export interface ChickenRoadDifficultyConfig {
  difficulty: ChickenRoadDifficulty;
  steps: number;
  multipliers: number[];
}

export interface ChickenRoadConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  difficulties: ChickenRoadDifficultyConfig[];
}

export interface ChickenRoadRound {
  id: string;
  userId: string;
  difficulty: ChickenRoadDifficulty;
  stake: string;
  currentStep: number;
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  serverSeedHash: string;
  createdAt: string;
  settledAt: string | null;
}

export function fetchChickenRoadConfig() {
  return apiFetch<ChickenRoadConfig>('/chicken-road/config');
}

export function fetchChickenRoadCurrent() {
  return apiFetch<ChickenRoadRound | null>('/chicken-road/current');
}

export function fetchChickenRoadHistory(limit = 30) {
  return apiFetch<ChickenRoadRound[]>(`/chicken-road/my-history?limit=${limit}`);
}

export function startChickenRoadRound(stake: number, difficulty: ChickenRoadDifficulty) {
  return apiFetch<ChickenRoadRound>('/chicken-road/start', {
    method: 'POST',
    body: JSON.stringify({ stake, difficulty }),
  });
}

export function advanceChickenRoadStep(roundId: string) {
  return apiFetch<{ round: ChickenRoadRound; busted: boolean }>('/chicken-road/advance', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export function cashOutChickenRoadRound(roundId: string) {
  return apiFetch<ChickenRoadRound>('/chicken-road/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

export interface MinesConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  tiles: number;
  minMines: number;
  maxMines: number;
  // multipliers[mineCount][safeTilesRevealed]
  multipliers: Record<string, number[]>;
}

export interface MinesRound {
  id: string;
  userId: string;
  stake: string;
  mineCount: number;
  revealed: number[];
  // Only present once the round has ended.
  minePositions?: number[];
  multiplier: string;
  payout: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  serverSeedHash: string;
  createdAt: string;
  settledAt: string | null;
}

export function fetchMinesConfig() {
  return apiFetch<MinesConfig>('/mines/config');
}

export function fetchMinesCurrent() {
  return apiFetch<MinesRound | null>('/mines/current');
}

export function fetchMinesHistory(limit = 30) {
  return apiFetch<MinesRound[]>(`/mines/my-history?limit=${limit}`);
}

export function startMinesRound(stake: number, mineCount: number) {
  return apiFetch<MinesRound>('/mines/start', {
    method: 'POST',
    body: JSON.stringify({ stake, mineCount }),
  });
}

export function revealMinesTile(roundId: string, tile: number) {
  return apiFetch<{ round: MinesRound; hitMine: boolean }>('/mines/reveal', {
    method: 'POST',
    body: JSON.stringify({ roundId, tile }),
  });
}

export function cashOutMinesRound(roundId: string) {
  return apiFetch<MinesRound>('/mines/cashout', {
    method: 'POST',
    body: JSON.stringify({ roundId }),
  });
}

// ---- 7 Up Down ----

export type SevenUpDownArea = 'DOWN' | 'SEVEN' | 'UP' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'N8' | 'N9' | 'N10' | 'N11' | 'N12';

export interface SevenUpDownConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  multipliers: Record<SevenUpDownArea, number>;
}

export interface SevenUpDownRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'ROLLING' | 'RESULT';
  serverSeedHash: string;
  dice: [number, number] | null;
  total: number | null;
  serverSeed: string | null;
}

export interface SevenUpDownBet {
  id: string;
  area: SevenUpDownArea;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
}

export interface SevenUpDownHistoryEntry {
  periodNumber: string;
  dice1: number;
  dice2: number;
  total: number;
}

export function fetchSevenUpDownConfig() {
  return apiFetch<SevenUpDownConfig>('/seven-up-down/config');
}

export function fetchSevenUpDownCurrent() {
  return apiFetch<SevenUpDownRoundView>('/seven-up-down/current');
}

export function fetchSevenUpDownHistory(limit = 100) {
  return apiFetch<SevenUpDownHistoryEntry[]>(`/seven-up-down/history?limit=${limit}`);
}

export function placeSevenUpDownBets(bets: { area: SevenUpDownArea; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: SevenUpDownBet[] }>('/seven-up-down/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelSevenUpDownBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/seven-up-down/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchSevenUpDownMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: SevenUpDownBet[] }>(`/seven-up-down/my-round${q}`);
}

// ---- Plinko ----

export type PlinkoRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PlinkoConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  minRows: number;
  maxRows: number;
  risks: PlinkoRisk[];
  rtpPercent: number;
  // multipliers[risk][rows] = payout for each landing slot, left to right
  multipliers: Record<PlinkoRisk, Record<string, number[]>>;
}

export interface PlinkoBet {
  id: string;
  stake: string;
  rows: number;
  risk: PlinkoRisk;
  path: number[]; // 0 = bounced left, 1 = bounced right, one per row
  slot: number;
  multiplier: string;
  payout: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  createdAt: string;
}

export function fetchPlinkoConfig() {
  return apiFetch<PlinkoConfig>('/plinko/config');
}

export function dropPlinkoBall(stake: number, rows: number, risk: PlinkoRisk) {
  return apiFetch<PlinkoBet>('/plinko/drop', {
    method: 'POST',
    body: JSON.stringify({ stake, rows, risk }),
  });
}

export function fetchPlinkoHistory(limit = 30) {
  return apiFetch<PlinkoBet[]>(`/plinko/my-history?limit=${limit}`);
}

// ---- Dragon Tiger ----

export type DragonTigerArea = 'DRAGON' | 'TIE' | 'TIGER' | 'SUITED_TIE';
export type CardSuit = 'S' | 'H' | 'C' | 'D';
export interface PlayingCard {
  rank: number; // 1 = A ... 13 = K
  suit: CardSuit;
}

export interface DragonTigerConfig {
  minStake: number;
  maxStake: number;
  maxPayout: number;
  roundSeconds: number;
  betSeconds: number;
  resultAtSeconds: number;
  rtpPercent: number;
  multipliers: Record<DragonTigerArea, number>;
}

export interface DragonTigerRoundView {
  periodNumber: string;
  startTime: string;
  betEndTime: string;
  resultTime: string;
  endTime: string;
  serverTime: string;
  phase: 'BETTING' | 'DEALING' | 'RESULT';
  serverSeedHash: string;
  dragon: PlayingCard | null;
  tiger: PlayingCard | null;
  winner: 'DRAGON' | 'TIGER' | 'TIE' | null;
  suitedTie: boolean | null;
  serverSeed: string | null;
}

export interface DragonTigerBet {
  id: string;
  area: DragonTigerArea;
  amount: string;
  multiplier: string;
  status: 'PENDING' | 'WON' | 'LOST' | 'VOID';
  payout: string;
}

export interface DragonTigerHistoryEntry {
  periodNumber: string;
  dragon: PlayingCard;
  tiger: PlayingCard;
  winner: 'DRAGON' | 'TIGER' | 'TIE';
  suitedTie: boolean;
}

export function fetchDragonTigerConfig() {
  return apiFetch<DragonTigerConfig>('/dragon-tiger/config');
}

export function fetchDragonTigerCurrent() {
  return apiFetch<DragonTigerRoundView>('/dragon-tiger/current');
}

export function fetchDragonTigerHistory(limit = 100) {
  return apiFetch<DragonTigerHistoryEntry[]>(`/dragon-tiger/history?limit=${limit}`);
}

export function placeDragonTigerBets(bets: { area: DragonTigerArea; amount: number }[]) {
  return apiFetch<{ periodNumber: string; bets: DragonTigerBet[] }>('/dragon-tiger/bet', {
    method: 'POST',
    body: JSON.stringify({ bets }),
  });
}

export function cancelDragonTigerBets(betIds?: string[]) {
  return apiFetch<{ cancelled: string[]; refund: number }>('/dragon-tiger/cancel', {
    method: 'POST',
    body: JSON.stringify(betIds ? { betIds } : {}),
  });
}

export function fetchDragonTigerMyRound(periodNumber?: string) {
  const q = periodNumber ? `?periodNumber=${encodeURIComponent(periodNumber)}` : '';
  return apiFetch<{ periodNumber: string | null; bets: DragonTigerBet[] }>(`/dragon-tiger/my-round${q}`);
}
