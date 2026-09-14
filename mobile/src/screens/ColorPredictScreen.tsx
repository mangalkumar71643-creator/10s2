import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ApiClientError } from '../api/client';
import {
  ColorGameBetType,
  ColorGameConfig,
  ColorGameDuration,
  ColorGameHistoryEntry,
  ColorGameMyBet,
  ColorGameRoundView,
  fetchColorGameConfig,
  fetchColorGameCurrentRound,
  fetchColorGameHistory,
  fetchColorGameMyBets,
  placeColorGameBet,
} from '../api/backend';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { radius, spacing, typography } from '../theme';

// This screen intentionally uses its own light "ticket" palette to match the
// reference design, rather than the app's global dark theme — Home/Wallet/
// etc. are unaffected.
const PALETTE = {
  headerDark: '#0B3D28',
  headerLight: '#1C7A50',
  green: '#1C8A5C',
  greenDark: '#0F4D34',
  greenBall: '#2FBE6B',
  red: '#E24B3F',
  violet: '#9B59D9',
  orange: '#E8952E',
  blue: '#3D7FE0',
  lightBg: '#F3F5F4',
  white: '#FFFFFF',
  textDark: '#123524',
  textMuted: '#7C9089',
  border: '#E1E7E4',
};

const DURATIONS: ColorGameDuration[] = [30, 60, 180, 300, 600];
const DURATION_VALUE_LABEL: Record<ColorGameDuration, string> = {
  30: '30S',
  60: '1Min',
  180: '3Min',
  300: '5Min',
  600: '10Min',
};

const MULTIPLIERS = [1, 5, 10, 20, 50, 100] as const;

function colorsForNumber(n: number): Array<'GREEN' | 'RED' | 'VIOLET'> {
  if (n === 0) return ['VIOLET', 'RED'];
  if (n === 5) return ['VIOLET', 'GREEN'];
  return [2, 4, 6, 8].includes(n) ? ['RED'] : ['GREEN'];
}

const CATEGORY_COLOR_HEX: Record<'GREEN' | 'RED' | 'VIOLET', string> = {
  GREEN: PALETTE.greenBall,
  RED: PALETTE.red,
  VIOLET: PALETTE.violet,
};

function primaryColorForNumber(n: number): string {
  return CATEGORY_COLOR_HEX[colorsForNumber(n)[0]];
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Selection = { betType: ColorGameBetType; betValue: string; label: string; multiplierLabel: string } | null;

export default function ColorPredictScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ColorGameConfig | null>(null);
  const [duration, setDuration] = useState<ColorGameDuration>(60);
  const [round, setRound] = useState<ColorGameRoundView | null>(null);
  const [history, setHistory] = useState<ColorGameHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<ColorGameMyBet[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [multiplier, setMultiplier] = useState<(typeof MULTIPLIERS)[number]>(1);
  const [placing, setPlacing] = useState(false);

  const roundRef = useRef(round);
  roundRef.current = round;

  const loadRound = useCallback(async (d: ColorGameDuration) => {
    const view = await fetchColorGameCurrentRound(d);
    setRound(view);
  }, []);

  const loadHistory = useCallback(async (d: ColorGameDuration) => {
    const rows = await fetchColorGameHistory(d);
    setHistory(rows);
  }, []);

  const loadMyBets = useCallback(async () => {
    try {
      const rows = await fetchColorGameMyBets();
      setMyBets(rows);
    } catch {
      // not logged in / transient — leave previous list as-is
    }
  }, []);

  useEffect(() => {
    fetchColorGameConfig().then(setConfig).catch(() => {});
  }, []);

  useEffect(() => {
    setRound(null);
    loadRound(duration);
    loadHistory(duration);
    loadMyBets();
  }, [duration, loadRound, loadHistory, loadMyBets]);

  useEffect(() => {
    const timer = setInterval(() => {
      const current = roundRef.current;
      if (!current) return;
      if (current.timeRemainingSeconds <= 0) {
        loadRound(duration);
        loadHistory(duration);
        loadMyBets();
        refreshWallet().catch(() => {});
        return;
      }
      setRound({
        ...current,
        timeRemainingSeconds: current.timeRemainingSeconds - 1,
        locked: current.timeRemainingSeconds - 1 <= (config?.lockSeconds ?? 5),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [duration, loadRound, loadHistory, loadMyBets, refreshWallet, config]);

  const locked = round?.locked ?? true;
  const baseUnit = config?.minStake ?? 5;
  const stake = baseUnit * multiplier;

  function pickRandomNumber() {
    const n = Math.floor(Math.random() * 10);
    setSelection({ betType: 'NUMBER', betValue: String(n), label: `Number ${n}`, multiplierLabel: `${config?.payouts.number ?? 9}X` });
  }

  async function confirmBet() {
    if (!selection || !round) return;
    if (config && (stake < config.minStake || stake > config.maxStake)) {
      Alert.alert('Invalid stake', `Stake must be between ₹${config.minStake} and ₹${config.maxStake}.`);
      return;
    }
    if (round.locked) {
      Alert.alert('Betting closed', 'This round is locked — wait for the next one.');
      return;
    }
    setPlacing(true);
    try {
      await placeColorGameBet(duration, selection.betType, selection.betValue, stake);
      await Promise.all([refreshWallet(), loadMyBets()]);
      Alert.alert('Bet placed', `₹${stake} on ${selection.label} — good luck!`);
      setSelection(null);
    } catch (err) {
      Alert.alert('Bet failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  function goHome() {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs', { screen: 'Home' });
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={[PALETTE.headerDark, PALETTE.headerLight]} style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Pressable onPress={goHome} style={styles.heroIconButton}>
              <MaterialCommunityIcons name="chevron-left" size={26} color={PALETTE.white} />
            </Pressable>
            <View style={styles.heroTopRight}>
              <Pressable onPress={() => navigation.navigate('Help')} style={styles.heroIconButton}>
                <MaterialCommunityIcons name="headset" size={20} color={PALETTE.white} />
              </Pressable>
              <Pressable
                style={styles.heroIconButton}
                onPress={() =>
                  Alert.alert(
                    'Provably fair',
                    "Every round's result hash is published before betting opens, and the raw seed is revealed after settlement so you can verify it was never changed."
                  )
                }
              >
                <MaterialCommunityIcons name="shield-check-outline" size={20} color={PALETTE.white} />
              </Pressable>
            </View>
          </View>

          <View style={styles.walletCard}>
            <View style={styles.walletCardTopRow}>
              <MaterialCommunityIcons name="wallet" size={22} color={PALETTE.green} />
              <Text style={styles.walletCardTitle}>Wallet balance</Text>
            </View>
            <Text style={styles.walletCardAmount}>₹{coins.toFixed(2)}</Text>
            <View style={styles.walletButtonsRow}>
              <Pressable style={styles.withdrawButton} onPress={() => navigation.navigate('Withdraw')}>
                <Text style={styles.withdrawButtonText}>Withdraw</Text>
              </Pressable>
              <Pressable style={styles.depositButton} onPress={() => navigation.navigate('Deposit')}>
                <Text style={styles.depositButtonText}>Deposit</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.durationCard}>
            {DURATIONS.map((d) => {
              const isSelected = d === duration;
              return (
                <Pressable key={d} onPress={() => setDuration(d)} style={styles.durationTab}>
                  <View style={[styles.durationIconWrap, isSelected && styles.durationIconWrapSelected]}>
                    <MaterialCommunityIcons name="clock-outline" size={22} color={isSelected ? PALETTE.white : PALETTE.textMuted} />
                  </View>
                  <Text style={[styles.durationLabel, isSelected && styles.durationLabelSelected]}>Win Go</Text>
                  <Text style={[styles.durationValue, isSelected && styles.durationValueSelected]}>{DURATION_VALUE_LABEL[d]}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.ticketBar}>
            <Pressable
              style={styles.howToPlayButton}
              onPress={() =>
                Alert.alert('How to play', 'Pick a number, color, or size before the round locks, then confirm your bet below.')
              }
            >
              <MaterialCommunityIcons name="book-open-variant" size={16} color={PALETTE.white} />
              <Text style={styles.howToPlayText}>How to play</Text>
            </Pressable>
            <View style={styles.ticketDivider} />
            <View style={styles.ticketRight}>
              <Text style={styles.ticketLabel}>{locked ? 'Locked' : 'Time remaining'}</Text>
              <Text style={styles.ticketValue}>{round ? formatCountdown(round.timeRemainingSeconds) : '--:--'}</Text>
            </View>
            <View style={[styles.ticketNotch, styles.ticketNotchTop]} />
            <View style={[styles.ticketNotch, styles.ticketNotchBottom]} />
          </View>
        </LinearGradient>

        <View style={styles.whiteContent}>
          <View style={styles.threeRow}>
            {(['GREEN', 'VIOLET', 'RED'] as const).map((c) => {
              const mult = c === 'VIOLET' ? config?.payouts.violet ?? 4.5 : config?.payouts.color ?? 2;
              const isSelected = selection?.betType === 'COLOR' && selection.betValue === c;
              return (
                <Pressable
                  key={c}
                  style={[styles.categoryButton, { backgroundColor: CATEGORY_COLOR_HEX[c] }, isSelected && styles.selectedOutline]}
                  onPress={() => setSelection({ betType: 'COLOR', betValue: c, label: c.charAt(0) + c.slice(1).toLowerCase(), multiplierLabel: `${mult}X` })}
                >
                  <Text style={styles.categoryButtonText}>{c.charAt(0) + c.slice(1).toLowerCase()}</Text>
                  <Text style={styles.categoryButtonMult}>{mult}X</Text>
                </Pressable>
              );
            })}
          </View>

          {history.length > 0 ? (
            <View style={styles.resultsRow}>
              {history.slice(0, 10).map((h) => (
                <View key={h.periodNumber} style={[styles.resultDot, { backgroundColor: primaryColorForNumber(h.resultNumber) }]}>
                  <Text style={styles.resultDotText}>{h.resultNumber}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.numberGrid}>
            {Array.from({ length: 10 }, (_, n) => n).map((n) => {
              const isSelected = selection?.betType === 'NUMBER' && selection.betValue === String(n);
              return (
                <Pressable
                  key={n}
                  style={styles.numberCell}
                  onPress={() =>
                    setSelection({ betType: 'NUMBER', betValue: String(n), label: `Number ${n}`, multiplierLabel: `${config?.payouts.number ?? 9}X` })
                  }
                >
                  <View style={[styles.numberBall, { backgroundColor: primaryColorForNumber(n) }, isSelected && styles.selectedOutline]}>
                    <Text style={styles.numberBallText}>{n}</Text>
                  </View>
                  <Text style={styles.numberBallMult}>{config?.payouts.number ?? 9}X</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.multiplierRow}>
            <Pressable style={styles.randomChip} onPress={pickRandomNumber}>
              <Text style={styles.randomChipText}>Random</Text>
            </Pressable>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.multiplierChips}>
              {MULTIPLIERS.map((m) => {
                const isSelected = m === multiplier;
                return (
                  <Pressable key={m} onPress={() => setMultiplier(m)} style={[styles.multiplierChip, isSelected && styles.multiplierChipSelected]}>
                    <Text style={[styles.multiplierChipText, isSelected && styles.multiplierChipTextSelected]}>X{m}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={styles.bigSmallBar}>
            {(['BIG', 'SMALL'] as const).map((s) => {
              const isSelected = selection?.betType === 'SIZE' && selection.betValue === s;
              const mult = config?.payouts.size ?? 2;
              return (
                <Pressable
                  key={s}
                  style={[styles.bigSmallHalf, { backgroundColor: s === 'BIG' ? PALETTE.orange : PALETTE.blue }, isSelected && styles.selectedOutline]}
                  onPress={() => setSelection({ betType: 'SIZE', betValue: s, label: s.charAt(0) + s.slice(1).toLowerCase(), multiplierLabel: `${mult}X` })}
                >
                  <Text style={styles.bigSmallText}>{s.charAt(0) + s.slice(1).toLowerCase()}</Text>
                  <Text style={styles.bigSmallText}>{mult}X</Text>
                </Pressable>
              );
            })}
          </View>

          {myBets.length > 0 ? (
            <>
              <Text style={styles.myBetsTitle}>My recent bets</Text>
              <View style={styles.myBetsBlock}>
                {myBets.slice(0, 8).map((bet) => (
                  <View key={bet.id} style={styles.myBetRow}>
                    <Text style={styles.myBetLabel} numberOfLines={1}>
                      {bet.betType === 'NUMBER' ? `Number ${bet.betValue}` : bet.betValue} · ₹{Number(bet.amount)}
                    </Text>
                    <Text
                      style={[
                        styles.myBetStatus,
                        bet.status === 'WON' && { color: PALETTE.green },
                        bet.status === 'LOST' && { color: PALETTE.red },
                      ]}
                    >
                      {bet.status === 'PENDING' ? 'Pending' : bet.status === 'WON' ? `+₹${Number(bet.payout)}` : 'Lost'}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      {selection ? (
        <View style={styles.confirmBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmLabel} numberOfLines={1}>
              {selection.label} ({selection.multiplierLabel}) · x{multiplier} = ₹{stake}
            </Text>
          </View>
          <Pressable onPress={() => setSelection(null)} style={styles.confirmCancel}>
            <MaterialCommunityIcons name="close" size={18} color={PALETTE.textMuted} />
          </Pressable>
          <Pressable onPress={confirmBet} disabled={placing || locked} style={[styles.confirmButton, { opacity: placing || locked ? 0.5 : 1 }]}>
            <Text style={styles.confirmButtonText}>{placing ? 'Placing…' : 'Place Bet'}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.bottomNav}>
        <Pressable style={styles.bottomNavItem} onPress={goHome}>
          <MaterialCommunityIcons name="home" size={22} color={PALETTE.green} />
          <Text style={[styles.bottomNavLabel, { color: PALETTE.green }]}>Home</Text>
        </Pressable>
        <Pressable
          style={styles.bottomNavItem}
          onPress={() => Alert.alert('My Bets', 'See "My recent bets" further up this screen for your latest wagers.')}
        >
          <MaterialCommunityIcons name="file-document-outline" size={22} color={PALETTE.textMuted} />
          <Text style={styles.bottomNavLabel}>My Bets</Text>
        </Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => navigation.navigate('History')}>
          <MaterialCommunityIcons name="clock-time-four-outline" size={22} color={PALETTE.textMuted} />
          <Text style={styles.bottomNavLabel}>History</Text>
        </Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => navigation.navigate('Profile')}>
          <MaterialCommunityIcons name="account-outline" size={22} color={PALETTE.textMuted} />
          <Text style={styles.bottomNavLabel}>Profile</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PALETTE.lightBg },
  scrollContent: { paddingBottom: 220 },
  hero: {
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
  },
  heroTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  heroTopRight: { flexDirection: 'row', gap: spacing.sm },
  heroIconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  walletCard: {
    backgroundColor: PALETTE.white,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  walletCardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  walletCardTitle: { color: PALETTE.textDark, fontSize: typography.lg, fontWeight: '700' },
  walletCardAmount: { color: PALETTE.green, fontSize: typography.xxl, fontWeight: '800', marginBottom: spacing.lg },
  walletButtonsRow: { flexDirection: 'row', gap: spacing.md, width: '100%' },
  withdrawButton: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: PALETTE.green,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  withdrawButtonText: { color: PALETTE.green, fontWeight: '800', fontSize: typography.md },
  depositButton: {
    flex: 1,
    borderRadius: radius.pill,
    backgroundColor: PALETTE.greenDark,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  depositButtonText: { color: PALETTE.white, fontWeight: '800', fontSize: typography.md },
  durationCard: {
    flexDirection: 'row',
    backgroundColor: PALETTE.white,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  durationTab: { flex: 1, alignItems: 'center', gap: 4 },
  durationIconWrap: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  durationIconWrapSelected: { backgroundColor: PALETTE.green },
  durationLabel: { color: PALETTE.textMuted, fontSize: 10, fontWeight: '700' },
  durationLabelSelected: { color: PALETTE.green },
  durationValue: { color: PALETTE.textMuted, fontSize: typography.xs, fontWeight: '800' },
  durationValueSelected: { color: PALETTE.green },
  ticketBar: {
    flexDirection: 'row',
    backgroundColor: PALETTE.greenDark,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  howToPlayButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.lg,
  },
  howToPlayText: { color: PALETTE.white, fontWeight: '700', fontSize: typography.sm },
  ticketDivider: { width: 1.5, borderLeftWidth: 1.5, borderLeftColor: 'rgba(255,255,255,0.5)', borderStyle: 'dashed' },
  ticketRight: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.lg },
  ticketLabel: { color: 'rgba(255,255,255,0.75)', fontSize: typography.xs, marginBottom: 2 },
  ticketValue: { color: PALETTE.white, fontWeight: '800', fontSize: typography.lg },
  ticketNotch: {
    position: 'absolute',
    left: '50%',
    marginLeft: -9,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PALETTE.headerLight,
  },
  ticketNotchTop: { top: -9 },
  ticketNotchBottom: { bottom: -9 },
  whiteContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  threeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  categoryButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryButtonText: { color: PALETTE.white, fontWeight: '700', fontSize: typography.sm },
  categoryButtonMult: { color: PALETTE.white, fontWeight: '800', fontSize: typography.sm },
  resultsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  resultDot: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  resultDotText: { color: PALETTE.white, fontWeight: '800', fontSize: 11 },
  numberGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  numberCell: { width: '20%', alignItems: 'center', marginBottom: spacing.md },
  numberBall: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'transparent' },
  numberBallText: { color: PALETTE.white, fontWeight: '800', fontSize: typography.lg },
  numberBallMult: { color: PALETTE.textMuted, fontSize: 11, fontWeight: '700', marginTop: 4 },
  selectedOutline: { borderWidth: 3, borderColor: PALETTE.greenDark },
  multiplierRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  randomChip: {
    borderWidth: 1.5,
    borderColor: PALETTE.green,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  randomChipText: { color: PALETTE.green, fontWeight: '800', fontSize: typography.sm },
  multiplierChips: { flexDirection: 'row', gap: spacing.sm },
  multiplierChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.white,
  },
  multiplierChipSelected: { backgroundColor: PALETTE.greenDark, borderColor: PALETTE.greenDark },
  multiplierChipText: { color: PALETTE.textDark, fontWeight: '700', fontSize: typography.sm },
  multiplierChipTextSelected: { color: PALETTE.white },
  bigSmallBar: { flexDirection: 'row', borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.lg },
  bigSmallHalf: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  bigSmallText: { color: PALETTE.white, fontWeight: '800', fontSize: typography.md },
  myBetsTitle: { color: PALETTE.textDark, fontSize: typography.md, fontWeight: '800', marginBottom: spacing.md },
  myBetsBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: PALETTE.border,
    backgroundColor: PALETTE.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  myBetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: PALETTE.border,
  },
  myBetLabel: { color: PALETTE.textDark, fontSize: typography.sm, flex: 1, marginRight: spacing.md },
  myBetStatus: { color: PALETTE.textMuted, fontWeight: '800', fontSize: typography.sm },
  confirmBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: PALETTE.white,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border,
  },
  confirmLabel: { color: PALETTE.textDark, fontSize: typography.sm, fontWeight: '700' },
  confirmCancel: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  confirmButton: { borderRadius: radius.lg, backgroundColor: PALETTE.greenDark, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  confirmButtonText: { color: PALETTE.white, fontWeight: '800', fontSize: typography.sm },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    flexDirection: 'row',
    backgroundColor: PALETTE.white,
    borderTopWidth: 1,
    borderTopColor: PALETTE.border,
  },
  bottomNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bottomNavLabel: { color: PALETTE.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
});
