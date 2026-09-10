import { initialCoins, initialWalletTransactions } from '../data/mockData';
import { WalletTransaction } from '../data/models';
import { delay } from './delay';

export async function fetchWallet(): Promise<{ coins: number; transactions: WalletTransaction[] }> {
  return delay({ coins: initialCoins, transactions: [...initialWalletTransactions] });
}
