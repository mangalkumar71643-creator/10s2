import { WalletTransaction } from '../data/models';
import { IconName } from '../data/models';
import {
  BackendTransaction,
  depositToWallet,
  fetchBackendTransactions,
  fetchBackendWallet,
  withdrawFromWallet,
} from '../api/backend';

const TX_ICONS: Record<BackendTransaction['type'], IconName> = {
  DEPOSIT: 'bank-transfer-in',
  WITHDRAWAL: 'bank-transfer-out',
  BET_STAKE: 'ticket-outline',
  BET_PAYOUT: 'trophy-outline',
  BET_REFUND: 'cash-refund',
  GAME_STAKE: 'controller-classic-outline',
  GAME_PAYOUT: 'trophy-outline',
  BONUS: 'gift-outline',
};

const TX_TITLES: Record<BackendTransaction['type'], string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  BET_STAKE: 'Bet placed',
  BET_PAYOUT: 'Bet won',
  BET_REFUND: 'Bet refunded',
  GAME_STAKE: 'Game stake',
  GAME_PAYOUT: 'Game win',
  BONUS: 'Bonus credit',
};

const CREDIT_TYPES = new Set<BackendTransaction['type']>(['DEPOSIT', 'BET_PAYOUT', 'GAME_PAYOUT', 'BONUS', 'BET_REFUND']);

function mapTransaction(tx: BackendTransaction): WalletTransaction {
  const signedAmount = CREDIT_TYPES.has(tx.type) ? Number(tx.amount) : -Number(tx.amount);
  const created = new Date(tx.createdAt);
  return {
    id: tx.id,
    title: TX_TITLES[tx.type],
    amount: signedAmount,
    type: signedAmount >= 0 ? 'earn' : 'spend',
    icon: TX_ICONS[tx.type],
    timestamp: created.toLocaleString(),
    timestampISO: tx.createdAt,
  };
}

/** Real wallet balance + transaction history from the backend — this is
 * the money-authoritative source; nothing in the app should mutate coins
 * locally anymore. */
export async function fetchWallet(): Promise<{ coins: number; transactions: WalletTransaction[] }> {
  const [wallet, transactions] = await Promise.all([fetchBackendWallet(), fetchBackendTransactions()]);
  return { coins: Number(wallet.balance), transactions: transactions.map(mapTransaction) };
}

export async function deposit(amount: number): Promise<number> {
  const wallet = await depositToWallet(amount);
  return Number(wallet.balance);
}

export async function withdraw(amount: number): Promise<number> {
  const wallet = await withdrawFromWallet(amount);
  return Number(wallet.balance);
}
