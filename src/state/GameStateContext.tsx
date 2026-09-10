import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dailyRewardTrack, initialAchievements, initialMissions, initialNotifications } from '../data/mockData';
import { Achievement, AppNotification, Mission, User, VipBonusRecord, WalletTransaction } from '../data/models';
import { fetchUser } from '../services/userService';
import { fetchWallet } from '../services/walletService';

const STORAGE_KEY = 'novaplay:progress:v1';

type PersistedState = {
  coins: number;
  transactions: WalletTransaction[];
  missions: Mission[];
  streak: number;
  lastClaimDateISO: string | null;
  notifications: AppNotification[];
  favoriteGameIds: string[];
  vipBonusHistory: VipBonusRecord[];
  claimedVipBonuses: string[];
};

type GameState = {
  loading: boolean;
  user: User | null;
  coins: number;
  transactions: WalletTransaction[];
  missions: Mission[];
  achievements: Achievement[];
  notifications: AppNotification[];
  streak: number;
  claimedToday: boolean;
  favoriteGameIds: string[];
  vipBonusHistory: VipBonusRecord[];
  claimMission: (missionId: string) => void;
  claimDailyReward: () => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  toggleFavoriteGame: (gameId: string) => void;
  isVipBonusClaimed: (level: number, type: 'weekly' | 'upgrade') => boolean;
  claimVipBonus: (level: number, type: 'weekly' | 'upgrade', title: string, amount: number) => boolean;
};

const GameStateContext = createContext<GameState | undefined>(undefined);

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function todayLabel(date: Date, timestamp: string) {
  const now = new Date();
  return isSameDay(date, now) ? `Today, ${timestamp}` : timestamp;
}

export function GameStateProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [coins, setCoins] = useState(0);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [missions, setMissions] = useState<Mission[]>(initialMissions);
  const [achievements] = useState<Achievement[]>(initialAchievements);
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [streak, setStreak] = useState(4);
  const [lastClaimDateISO, setLastClaimDateISO] = useState<string | null>(null);
  const [favoriteGameIds, setFavoriteGameIds] = useState<string[]>(['g-neon-rush', 'g-sky-glider', 'g-match-reels', 'g-peak-climb']);
  const [vipBonusHistory, setVipBonusHistory] = useState<VipBonusRecord[]>([]);
  const [claimedVipBonuses, setClaimedVipBonuses] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      const [persistedRaw, fetchedUser, fetchedWallet] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY),
        fetchUser(),
        fetchWallet(),
      ]);
      if (cancelled) return;

      setUser(fetchedUser);

      if (persistedRaw) {
        try {
          const persisted = JSON.parse(persistedRaw) as PersistedState;
          setCoins(persisted.coins);
          setTransactions(persisted.transactions);
          setMissions(persisted.missions);
          setStreak(persisted.streak);
          setLastClaimDateISO(persisted.lastClaimDateISO);
          setNotifications(persisted.notifications);
          setFavoriteGameIds(persisted.favoriteGameIds);
          setVipBonusHistory(persisted.vipBonusHistory ?? []);
          setClaimedVipBonuses(persisted.claimedVipBonuses ?? []);
        } catch {
          setCoins(fetchedWallet.coins);
          setTransactions(fetchedWallet.transactions);
        }
      } else {
        setCoins(fetchedWallet.coins);
        setTransactions(fetchedWallet.transactions);
      }
      setLoading(false);
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    const persisted: PersistedState = {
      coins,
      transactions,
      missions,
      streak,
      lastClaimDateISO,
      notifications,
      favoriteGameIds,
      vipBonusHistory,
      claimedVipBonuses,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)).catch(() => {});
  }, [
    loading,
    coins,
    transactions,
    missions,
    streak,
    lastClaimDateISO,
    notifications,
    favoriteGameIds,
    vipBonusHistory,
    claimedVipBonuses,
  ]);

  const addTransaction = useCallback((title: string, amount: number, icon: WalletTransaction['icon']) => {
    const tx: WalletTransaction = {
      id: `t-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      title,
      amount,
      type: amount >= 0 ? 'earn' : 'spend',
      icon,
      timestamp: todayLabel(new Date(), new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
      timestampISO: new Date().toISOString(),
    };
    setTransactions((prev) => [tx, ...prev]);
    setCoins((prev) => prev + amount);
  }, []);

  const claimMission = useCallback(
    (missionId: string) => {
      setMissions((prev) => {
        const mission = prev.find((m) => m.id === missionId);
        if (!mission || mission.claimed || mission.progress < mission.target) return prev;
        addTransaction(mission.title, mission.reward, mission.icon);
        return prev.map((m) => (m.id === missionId ? { ...m, claimed: true } : m));
      });
    },
    [addTransaction]
  );

  const claimedToday = useMemo(() => {
    if (!lastClaimDateISO) return false;
    return isSameDay(new Date(lastClaimDateISO), new Date());
  }, [lastClaimDateISO]);

  const claimDailyReward = useCallback(() => {
    if (claimedToday) return;
    const dayIndex = streak % dailyRewardTrack.length;
    const reward = dailyRewardTrack[dayIndex];
    addTransaction(`Daily Reward (Day ${reward.day})`, reward.amount, 'gift-outline');
    setStreak((prev) => prev + 1);
    setLastClaimDateISO(new Date().toISOString());
  }, [claimedToday, streak, addTransaction]);

  const isVipBonusClaimed = useCallback(
    (level: number, type: 'weekly' | 'upgrade') => claimedVipBonuses.includes(`${level}-${type}`),
    [claimedVipBonuses]
  );

  const claimVipBonus = useCallback(
    (level: number, type: 'weekly' | 'upgrade', title: string, amount: number) => {
      const key = `${level}-${type}`;
      if (claimedVipBonuses.includes(key)) return false;
      addTransaction(title, amount, 'crown-outline');
      setClaimedVipBonuses((prev) => [...prev, key]);
      setVipBonusHistory((prev) => [
        { id: `vb-${Date.now()}-${Math.round(Math.random() * 1000)}`, title, amount, timestampISO: new Date().toISOString() },
        ...prev,
      ]);
      return true;
    },
    [claimedVipBonuses, addTransaction]
  );

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const toggleFavoriteGame = useCallback((gameId: string) => {
    setFavoriteGameIds((prev) => (prev.includes(gameId) ? prev.filter((id) => id !== gameId) : [...prev, gameId]));
  }, []);

  const value: GameState = {
    loading,
    user,
    coins,
    transactions,
    missions,
    achievements,
    notifications,
    streak,
    claimedToday,
    favoriteGameIds,
    vipBonusHistory,
    claimMission,
    claimDailyReward,
    markNotificationRead,
    markAllNotificationsRead,
    toggleFavoriteGame,
    isVipBonusClaimed,
    claimVipBonus,
  };

  return <GameStateContext.Provider value={value}>{children}</GameStateContext.Provider>;
}

export function useGameState(): GameState {
  const ctx = useContext(GameStateContext);
  if (!ctx) throw new Error('useGameState must be used within GameStateProvider');
  return ctx;
}
