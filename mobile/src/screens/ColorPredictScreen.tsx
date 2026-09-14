import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
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
import { colors, gradients, radius, spacing, typography } from '../theme';

// Only the four tracks shown in the reference design — 30s is still a valid
// backend duration, just not one we surface here.
const DISPLAY_DURATIONS: ColorGameDuration[] = [60, 180, 300, 600];
const DURATION_LABELS: Record<ColorGameDuration, string> = {
  30: 'Win Go 30Sec',
  60: 'Win Go 1Min',
  180: 'Win Go 3Min',
  300: 'Win Go 5Min',
  600: 'Win Go 10Min',
};

const MULTIPLIERS = [1, 2, 5, 10, 20, 50, 100] as const;

// Purely cosmetic per-ball colors so the number grid reads like the
// reference design — the actual win category (green/red/violet) a number
// belongs to is unchanged and still decided by colorsForNumber below.
const NUMBER_BALL_COLORS: Record<number, string> = {
  0: '#2FBE6B',
  1: '#3576E0',
  2: '#F0B93D',
  3: '#E0473F',
  4: '#8C4FE0',
  5: '#1E9E7A',
  6: '#E38A2E',
  7: '#31A9D6',
  8: '#E24F9C',
  9: '#7A44D6',
};

function colorsForNumber(n: number): Array<'GREEN' | 'RED' | 'VIOLET'> {
  if (n === 0) return ['VIOLET', 'RED'];
  if (n === 5) return ['VIOLET', 'GREEN'];
  return [2, 4, 6, 8].includes(n) ? ['RED'] : ['GREEN'];
}
void colorsForNumber; // kept for future use (e.g. explaining mixed numbers)

const CATEGORY_COLOR_HEX: Record<'GREEN' | 'RED' | 'VIOLET', string> = {
  GREEN: '#2FBE6B',
  RED: '#E14B4B',
  VIOLET: '#9B5DE5',
};

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
  const [selectedDuration, setSelectedDuration] = useState<ColorGameDuration>(60);
  const [roundsByDuration, setRoundsByDuration] = useState<Partial<Record<ColorGameDuration, ColorGameRoundView>>>({});
  const [history, setHistory] = useState<ColorGameHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<ColorGameMyBet[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [multiplier, setMultiplier] = useState<(typeof MULTIPLIERS)[number]>(1);
  const [placing, setPlacing] = useState(false);

  const configRef = useRef(config);
  configRef.current = config;

  const loadRoundFor = useCallback(async (d: ColorGameDuration) => {
    try {
      const view = await fetchColorGameCurrentRound(d);
      setRoundsByDuration((prev) => ({ ...prev, [d]: view }));
    } catch {
      // transient — next tick retries
    }
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
    DISPLAY_DURATIONS.forEach((d) => {
      loadRoundFor(d);
    });
  }, [loadRoundFor]);

  useEffect(() => {
    loadHistory(selectedDuration);
    loadMyBets();
  }, [selectedDuration, loadHistory, loadMyBets]);

  useEffect(() => {
    const timer = setInterval(() => {
      const expired: ColorGameDuration[] = [];
      setRoundsByDuration((prev) => {
        const next: typeof prev = {};
        for (const d of DISPLAY_DURATIONS) {
          const r = prev[d];
          if (!r) continue;
          const remaining = r.timeRemainingSeconds - 1;
          if (remaining <= 0) {
            expired.push(d);
            next[d] = r;
          } else {
            next[d] = { ...r, timeRemainingSeconds: remaining, locked: remaining <= (configRef.current?.lockSeconds ?? 5) };
          }
        }
        return next;
      });
      if (expired.length) {
        expired.forEach((d) => loadRoundFor(d));
        if (expired.includes(selectedDuration)) {
          loadHistory(selectedDuration);
          loadMyBets();
          refreshWallet().catch(() => {});
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [selectedDuration, loadRoundFor, loadHistory, loadMyBets, refreshWallet]);

  const round = roundsByDuration[selectedDuration] ?? null;
  const locked = round?.locked ?? true;
  const baseUnit = config?.minStake ?? 5;
  const stake = baseUnit * multiplier;

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
      await placeColorGameBet(selectedDuration, selection.betType, selection.betValue, stake);
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
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.brandTitle}>NOVAPLAY</Text>
          <Text style={styles.brandTagline}>PLAY  ·  WIN  ·  REPEAT</Text>
        </View>
        <View style={styles.topBarIcons}>
          <Pressable style={styles.topBarIcon} onPress={() => navigation.navigate('Help')}>
            <MaterialCommunityIcons name="headset" size={24} color={colors.gold} />
          </Pressable>
          <Pressable style={styles.topBarIcon} onPress={() => navigation.navigate('Notifications')}>
            <MaterialCommunityIcons name="bell-outline" size={24} color={colors.gold} />
            <View style={styles.notificationDot} />
          </Pressable>
          <Pressable style={styles.topBarIcon} onPress={() => navigation.navigate('Settings')}>
            <MaterialCommunityIcons name="menu" size={26} color={colors.gold} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.walletCard}>
          <View style={styles.walletIconBadge}>
            <MaterialCommunityIcons name="wallet" size={26} color={colors.positive} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>Wallet Balance</Text>
            <View style={styles.walletValueRow}>
              <Text style={styles.walletValue}>₹{coins.toFixed(2)}</Text>
              <Pressable onPress={() => refreshWallet().catch(() => {})}>
                <MaterialCommunityIcons name="refresh" size={17} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
          <View style={{ gap: spacing.sm }}>
            <Pressable onPress={() => navigation.navigate('Withdraw')} style={[styles.walletActionButton, { backgroundColor: colors.positive }]}>
              <Text style={[styles.walletActionText, { color: '#08321C' }]}>Withdraw</Text>
              <MaterialCommunityIcons name="arrow-down-bold" size={15} color="#08321C" />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('Deposit')} style={[styles.walletActionButton, { backgroundColor: colors.gold }]}>
              <Text style={[styles.walletActionText, { color: '#3A2405' }]}>Deposit</Text>
              <MaterialCommunityIcons name="arrow-up-bold" size={15} color="#3A2405" />
            </Pressable>
          </View>
        </View>

        <View style={styles.durationRow}>
          {DISPLAY_DURATIONS.map((d) => {
            const isSelected = d === selectedDuration;
            const r = roundsByDuration[d];
            return (
              <Pressable
                key={d}
                onPress={() => setSelectedDuration(d)}
                style={[styles.durationTab, isSelected && styles.durationTabSelected]}
              >
                <View style={styles.durationTabTop}>
                  <MaterialCommunityIcons name="clock-outline" size={12} color={isSelected ? colors.positive : colors.textSecondary} />
                  <Text style={[styles.durationTabLabel, isSelected && styles.durationTabLabelSelected]}>{DURATION_LABELS[d]}</Text>
                </View>
                <Text style={[styles.durationTabTimer, isSelected && styles.durationTabTimerSelected]}>
                  {r ? formatCountdown(r.timeRemainingSeconds) : '--:--'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.infoPill}>
          <Pressable
            style={styles.infoPillHalf}
            onPress={() =>
              Alert.alert(
                'How to play',
                "Pick a number, color, or size before the round locks. Each round's result hash is published before betting opens, and the raw seed is revealed after settlement so you can verify it was never changed."
              )
            }
          >
            <MaterialCommunityIcons name="help-circle-outline" size={18} color={colors.gold} />
            <Text style={styles.infoPillText}>How to play</Text>
          </Pressable>
          <View style={styles.infoPillDivider} />
          <View style={styles.infoPillHalf}>
            <Text style={styles.infoPillMuted}>{locked ? 'Locked' : 'Time remaining'}</Text>
            <Text style={[styles.infoPillTimer, locked && { color: colors.negative }]}>
              {round ? formatCountdown(round.timeRemainingSeconds) : '--:--'}
            </Text>
            <MaterialCommunityIcons name="clock-outline" size={16} color={locked ? colors.negative : colors.positive} />
          </View>
        </View>

        {history.length > 0 ? (
          <View style={styles.resultsRow}>
            {history.slice(0, 10).map((h) => (
              <View key={h.periodNumber} style={[styles.resultDot, { backgroundColor: NUMBER_BALL_COLORS[h.resultNumber] }]}>
                <Text style={styles.resultDotText}>{h.resultNumber}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <SectionHeading title="CHOOSE A NUMBER" />
        <View style={styles.numberGrid}>
          {Array.from({ length: 10 }, (_, n) => n).map((n) => {
            const isSelected = selection?.betType === 'NUMBER' && selection.betValue === String(n);
            return (
              <Pressable
                key={n}
                style={[styles.numberBall, { backgroundColor: NUMBER_BALL_COLORS[n] }, isSelected && styles.selectedOutline]}
                onPress={() =>
                  setSelection({ betType: 'NUMBER', betValue: String(n), label: `Number ${n}`, multiplierLabel: `${config?.payouts.number ?? 9}X` })
                }
              >
                <Text style={styles.numberBallText}>{n}</Text>
                <View style={styles.numberBallBadge}>
                  <Text style={styles.numberBallBadgeText}>{config?.payouts.number ?? 9}X</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.threeButtonRow}>
          {(['GREEN', 'VIOLET', 'RED'] as const).map((c) => {
            const mult = c === 'VIOLET' ? config?.payouts.violet ?? 4.5 : config?.payouts.color ?? 2;
            const isSelected = selection?.betType === 'COLOR' && selection.betValue === c;
            return (
              <Pressable
                key={c}
                style={[styles.colorButton, { backgroundColor: CATEGORY_COLOR_HEX[c] }, isSelected && styles.selectedOutline]}
                onPress={() => setSelection({ betType: 'COLOR', betValue: c, label: c, multiplierLabel: `${mult}X` })}
              >
                <View style={styles.colorButtonTop}>
                  <Text style={styles.colorButtonText}>{c}</Text>
                  <View style={styles.colorDot} />
                </View>
                <Text style={styles.colorButtonMult}>{mult}X</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionHeading title="BIG & SMALL" />
        <View style={styles.threeButtonRow}>
          {(['BIG', 'SMALL'] as const).map((s) => {
            const isSelected = selection?.betType === 'SIZE' && selection.betValue === s;
            const mult = config?.payouts.size ?? 2;
            const textColor = s === 'BIG' ? '#08321C' : '#3A2405';
            return (
              <Pressable
                key={s}
                style={[styles.sizeButton, { backgroundColor: s === 'BIG' ? colors.positive : colors.gold }, isSelected && styles.selectedOutline]}
                onPress={() => setSelection({ betType: 'SIZE', betValue: s, label: s, multiplierLabel: `${mult}X` })}
              >
                <View style={styles.colorButtonTop}>
                  <Text style={[styles.sizeButtonText, { color: textColor }]}>{s}</Text>
                  <MaterialCommunityIcons name={s === 'BIG' ? 'arrow-up-bold' : 'arrow-down-bold'} size={16} color={textColor} />
                </View>
                <Text style={[styles.colorButtonMult, { color: textColor }]}>{mult}X</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionHeading title="SELECT MULTIPLIER" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.multiplierRow}>
          {MULTIPLIERS.map((m) => {
            const isSelected = m === multiplier;
            return (
              <Pressable key={m} onPress={() => setMultiplier(m)} style={[styles.multiplierChip, isSelected && styles.multiplierChipSelected]}>
                <Text style={[styles.multiplierChipText, isSelected && styles.multiplierChipTextSelected]}>x{m}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

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
                      bet.status === 'WON' && { color: colors.positive },
                      bet.status === 'LOST' && { color: colors.negative },
                    ]}
                  >
                    {bet.status === 'PENDING' ? 'Pending' : bet.status === 'WON' ? `+₹${Number(bet.payout)}` : 'Lost'}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      {selection ? (
        <View style={styles.confirmBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmLabel} numberOfLines={1}>
              {selection.label} ({selection.multiplierLabel}) · x{multiplier} = ₹{stake}
            </Text>
          </View>
          <Pressable onPress={() => setSelection(null)} style={styles.confirmCancel}>
            <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={confirmBet} disabled={placing || locked}>
            <LinearGradient
              colors={gradients.crimsonButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.confirmButton, { opacity: placing || locked ? 0.5 : 1 }]}
            >
              <Text style={styles.confirmButtonText}>{placing ? 'Placing…' : 'Place Bet'}</Text>
            </LinearGradient>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.bottomNav}>
        <Pressable style={styles.bottomNavItem} onPress={goHome}>
          <MaterialCommunityIcons name="home" size={22} color={colors.positive} />
          <Text style={[styles.bottomNavLabel, { color: colors.positive }]}>Home</Text>
        </Pressable>
        <Pressable
          style={styles.bottomNavItem}
          onPress={() => Alert.alert('My Bets', 'See "My recent bets" further up this screen for your latest wagers.')}
        >
          <MaterialCommunityIcons name="file-document-outline" size={22} color={colors.gold} />
          <Text style={styles.bottomNavLabel}>My Bets</Text>
        </Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => navigation.navigate('History')}>
          <MaterialCommunityIcons name="clock-time-four-outline" size={22} color={colors.gold} />
          <Text style={styles.bottomNavLabel}>History</Text>
        </Pressable>
        <Pressable style={styles.bottomNavItem} onPress={() => navigation.navigate('Profile')}>
          <MaterialCommunityIcons name="account-outline" size={22} color={colors.gold} />
          <Text style={styles.bottomNavLabel}>Profile</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeadingWrap}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionHeadingDiamond}>◆</Text>
        <Text style={styles.sectionHeadingText}>{title}</Text>
        <Text style={styles.sectionHeadingDiamond}>◆</Text>
      </View>
      <View style={styles.sectionHeadingLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  brandTitle: { color: colors.gold, fontSize: typography.xxl, fontWeight: '900', letterSpacing: 1 },
  brandTagline: { color: colors.goldDark, fontSize: 10, fontWeight: '700', letterSpacing: 2, marginTop: 2 },
  topBarIcons: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginTop: 4 },
  topBarIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  notificationDot: {
    position: 'absolute',
    top: 1,
    right: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.positive,
    borderWidth: 1,
    borderColor: colors.background,
  },
  scrollContent: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: 220 },
  walletCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  walletIconBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,207,142,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62,207,142,0.4)',
  },
  walletLabel: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '600', marginBottom: 4 },
  walletValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  walletValue: { color: colors.positive, fontSize: typography.xl, fontWeight: '800' },
  walletActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minWidth: 108,
  },
  walletActionText: { fontWeight: '800', fontSize: typography.sm },
  durationRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  durationTab: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  durationTabSelected: { backgroundColor: 'rgba(62,207,142,0.12)', borderColor: colors.positive },
  durationTabTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  durationTabLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
  durationTabLabelSelected: { color: colors.positive },
  durationTabTimer: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '800', marginTop: 2 },
  durationTabTimerSelected: { color: colors.positive },
  infoPill: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  infoPillHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md },
  infoPillDivider: { width: 1, backgroundColor: colors.border },
  infoPillText: { color: colors.gold, fontWeight: '700', fontSize: typography.sm },
  infoPillMuted: { color: colors.textMuted, fontSize: typography.xs, marginRight: 4 },
  infoPillTimer: { color: colors.positive, fontWeight: '800', fontSize: typography.lg, marginRight: 4 },
  resultsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  resultDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  resultDotText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.xs },
  sectionHeadingWrap: { marginBottom: spacing.md, marginTop: spacing.sm },
  sectionHeadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: 6 },
  sectionHeadingDiamond: { color: colors.gold, fontSize: typography.sm },
  sectionHeadingText: { color: colors.gold, fontWeight: '800', fontSize: typography.sm, letterSpacing: 1 },
  sectionHeadingLine: { height: 1, backgroundColor: colors.border, width: '70%', alignSelf: 'center' },
  numberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', marginBottom: spacing.xl },
  numberBall: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
    marginBottom: spacing.md,
  },
  numberBallText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.lg },
  numberBallBadge: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  numberBallBadgeText: { color: '#FFFFFF', fontWeight: '800', fontSize: 9 },
  selectedOutline: { borderWidth: 3, borderColor: colors.gold },
  threeButtonRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  colorButton: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  colorButtonTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colorButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.sm, letterSpacing: 0.5 },
  colorDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.85)' },
  colorButtonMult: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: typography.xs, marginTop: 4 },
  sizeButton: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  sizeButtonText: { fontWeight: '800', fontSize: typography.md },
  multiplierRow: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs, paddingRight: spacing.lg, marginBottom: spacing.xl },
  multiplierChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  multiplierChipSelected: { borderColor: colors.positive, backgroundColor: 'rgba(62,207,142,0.15)' },
  multiplierChipText: { color: colors.textSecondary, fontWeight: '700', fontSize: typography.sm },
  multiplierChipTextSelected: { color: colors.positive },
  myBetsTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800', marginBottom: spacing.md, marginTop: spacing.sm },
  myBetsBlock: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
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
    borderBottomColor: colors.border,
  },
  myBetLabel: { color: colors.textSecondary, fontSize: typography.sm, flex: 1, marginRight: spacing.md },
  myBetStatus: { color: colors.textMuted, fontWeight: '800', fontSize: typography.sm },
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
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  confirmLabel: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' },
  confirmCancel: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  confirmButton: { borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, alignItems: 'center' },
  confirmButtonText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.sm },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bottomNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  bottomNavLabel: { color: colors.gold, fontSize: 10, fontWeight: '700', marginTop: 2 },
});
