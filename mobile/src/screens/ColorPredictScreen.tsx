import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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

const DURATION_LABELS: Record<ColorGameDuration, string> = {
  30: '30s',
  60: '1min',
  180: '3min',
  300: '5min',
  600: '10min',
};

const QUICK_STAKES = [10, 50, 100, 500];

function colorsForNumber(n: number): Array<'GREEN' | 'RED' | 'VIOLET'> {
  if (n === 0) return ['VIOLET', 'RED'];
  if (n === 5) return ['VIOLET', 'GREEN'];
  return [2, 4, 6, 8].includes(n) ? ['RED'] : ['GREEN'];
}

const COLOR_HEX: Record<'GREEN' | 'RED' | 'VIOLET', string> = {
  GREEN: '#2FBE6B',
  RED: '#E14B4B',
  VIOLET: '#9B5DE5',
};

function primaryColorForNumber(n: number): 'GREEN' | 'RED' | 'VIOLET' {
  const cs = colorsForNumber(n);
  return cs[0];
}

function secondaryColorForNumber(n: number): string | null {
  const cs = colorsForNumber(n);
  return cs.length > 1 ? COLOR_HEX[cs[1]] : null;
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Selection = { betType: ColorGameBetType; betValue: string; label: string } | null;

export default function ColorPredictScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ColorGameConfig | null>(null);
  const [duration, setDuration] = useState<ColorGameDuration>(60);
  const [round, setRound] = useState<ColorGameRoundView | null>(null);
  const [history, setHistory] = useState<ColorGameHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<ColorGameMyBet[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [stakeText, setStakeText] = useState(String(QUICK_STAKES[0]));
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

  async function handlePlaceBet() {
    if (!selection || !round) return;
    const amount = Number(stakeText);
    if (!amount || amount <= 0) {
      Alert.alert('Enter a stake', 'Choose how much you want to bet first.');
      return;
    }
    if (config && (amount < config.minStake || amount > config.maxStake)) {
      Alert.alert('Invalid stake', `Stake must be between ₹${config.minStake} and ₹${config.maxStake}.`);
      return;
    }
    if (round.locked) {
      Alert.alert('Betting closed', 'This round is locked — wait for the next one.');
      return;
    }
    setPlacing(true);
    try {
      await placeColorGameBet(duration, selection.betType, selection.betValue, amount);
      await Promise.all([refreshWallet(), loadMyBets()]);
      setSelection(null);
      Alert.alert('Bet placed', `₹${amount} on ${selection.label} — good luck!`);
    } catch (err) {
      Alert.alert('Bet failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setPlacing(false);
    }
  }

  const locked = round?.locked ?? true;

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Color Predict</Text>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Provably fair',
              'Every round’s result hash is published the instant the round opens, before anyone can bet. Once the round settles, the raw seed is revealed in the history tab so you can verify the result was never changed.'
            )
          }
          style={styles.headerButton}
        >
          <MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.gold} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.durationRow}>
          {(config?.durations ?? [30, 60, 180, 300, 600]).map((d) => (
            <Pressable
              key={d}
              onPress={() => setDuration(d)}
              style={[styles.durationChip, duration === d && styles.durationChipSelected]}
            >
              <Text style={[styles.durationChipText, duration === d && styles.durationChipTextSelected]}>
                {DURATION_LABELS[d]}
              </Text>
            </Pressable>
          ))}
        </View>

        <LinearGradient colors={gradients.card} style={styles.roundCard}>
          <View style={styles.roundCardRow}>
            <View>
              <Text style={styles.roundLabel}>Period</Text>
              <Text style={styles.roundPeriod}>{round?.periodNumber ?? '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.roundLabel}>{locked ? 'Locked' : 'Time left'}</Text>
              <Text style={[styles.roundCountdown, locked && { color: colors.negative }]}>
                {round ? formatCountdown(round.timeRemainingSeconds) : '--:--'}
              </Text>
            </View>
          </View>
          <Text style={styles.roundHash} numberOfLines={1}>
            hash: {round?.serverSeedHash ?? '—'}
          </Text>
        </LinearGradient>

        {history.length > 0 ? (
          <View style={styles.resultsRow}>
            {history.slice(0, 10).map((h) => (
              <View
                key={h.periodNumber}
                style={[styles.resultDot, { backgroundColor: COLOR_HEX[primaryColorForNumber(h.resultNumber)] }]}
              >
                <Text style={styles.resultDotText}>{h.resultNumber}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Pick a color</Text>
        <View style={styles.rowGap}>
          {(['GREEN', 'VIOLET', 'RED'] as const).map((c) => {
            const mult = c === 'VIOLET' ? config?.payouts.violet ?? 4.5 : config?.payouts.color ?? 2;
            const isSelected = selection?.betType === 'COLOR' && selection.betValue === c;
            return (
              <Pressable
                key={c}
                style={[styles.colorButton, { backgroundColor: COLOR_HEX[c] }, isSelected && styles.selectedOutline]}
                onPress={() => setSelection({ betType: 'COLOR', betValue: c, label: `${c} (${mult}x)` })}
              >
                <Text style={styles.colorButtonText}>{c}</Text>
                <Text style={styles.colorButtonMult}>{mult}x</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Pick a number ({config?.payouts.number ?? 9}x)</Text>
        <View style={styles.numberGrid}>
          {Array.from({ length: 10 }, (_, n) => n).map((n) => {
            const isSelected = selection?.betType === 'NUMBER' && selection.betValue === String(n);
            const secondary = secondaryColorForNumber(n);
            return (
              <Pressable
                key={n}
                style={[
                  styles.numberButton,
                  { backgroundColor: COLOR_HEX[primaryColorForNumber(n)] },
                  secondary ? { borderColor: secondary, borderWidth: 3 } : null,
                  isSelected && styles.selectedOutline,
                ]}
                onPress={() => setSelection({ betType: 'NUMBER', betValue: String(n), label: `Number ${n} (${config?.payouts.number ?? 9}x)` })}
              >
                <Text style={styles.numberButtonText}>{n}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>Big / Small ({config?.payouts.size ?? 2}x)</Text>
        <View style={styles.rowGap}>
          {(['BIG', 'SMALL'] as const).map((s) => {
            const isSelected = selection?.betType === 'SIZE' && selection.betValue === s;
            return (
              <Pressable
                key={s}
                style={[styles.sizeButton, isSelected && styles.selectedOutline]}
                onPress={() => setSelection({ betType: 'SIZE', betValue: s, label: `${s} (${config?.payouts.size ?? 2}x)` })}
              >
                <Text style={styles.sizeButtonText}>{s}</Text>
                <Text style={styles.sizeButtonHint}>{s === 'BIG' ? '5–9' : '0–4'}</Text>
              </Pressable>
            );
          })}
        </View>

        {myBets.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>My recent bets</Text>
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

      <View style={styles.betBar}>
        <View style={styles.stakeRow}>
          <View style={styles.stakeInputBox}>
            <Text style={styles.stakeInputPrefix}>₹</Text>
            <TextInput
              value={stakeText}
              onChangeText={(t) => setStakeText(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={styles.stakeInput}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
          </View>
          {QUICK_STAKES.map((v) => (
            <Pressable key={v} style={styles.stakeChip} onPress={() => setStakeText(String(v))}>
              <Text style={styles.stakeChipText}>₹{v}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={handlePlaceBet}
          disabled={!selection || locked || placing}
          style={{ opacity: !selection || locked || placing ? 0.5 : 1 }}
        >
          <LinearGradient colors={gradients.crimsonButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.betButton}>
            <Text style={styles.betButtonText}>
              {placing ? 'Placing…' : selection ? `Bet on ${selection.label}` : 'Select a bet above'}
            </Text>
          </LinearGradient>
        </Pressable>
        <Text style={styles.balanceHint}>Balance: ₹{Math.floor(coins).toLocaleString('en-IN')}</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 220 },
  durationRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  durationChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
  },
  durationChipSelected: { backgroundColor: colors.gold, borderColor: colors.gold },
  durationChipText: { color: colors.textSecondary, fontWeight: '700', fontSize: typography.sm },
  durationChipTextSelected: { color: colors.background },
  roundCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  roundCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  roundLabel: { color: colors.textMuted, fontSize: typography.xs },
  roundPeriod: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md, marginTop: 2 },
  roundCountdown: { color: colors.gold, fontWeight: '800', fontSize: typography.xxl, marginTop: 2 },
  roundHash: { color: colors.textMuted, fontSize: 10, marginTop: spacing.md },
  resultsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg, flexWrap: 'wrap' },
  resultDot: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  resultDotText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.sm },
  sectionTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '800', marginBottom: spacing.md, marginTop: spacing.sm },
  rowGap: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  colorButton: { flex: 1, borderRadius: radius.lg, paddingVertical: spacing.lg, alignItems: 'center', borderWidth: 3, borderColor: 'transparent' },
  colorButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.sm, letterSpacing: 0.5 },
  colorButtonMult: { color: 'rgba(255,255,255,0.85)', fontWeight: '700', fontSize: typography.xs, marginTop: 2 },
  selectedOutline: { borderWidth: 3, borderColor: colors.gold },
  numberGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  numberButton: {
    width: '17%',
    aspectRatio: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  numberButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.lg },
  sizeButton: {
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 3,
    borderColor: colors.border,
  },
  sizeButtonText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md },
  sizeButtonHint: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
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
  betBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  stakeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, alignItems: 'center' },
  stakeInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  stakeInputPrefix: { color: colors.gold, fontWeight: '800', fontSize: typography.md },
  stakeInput: { color: colors.gold, fontWeight: '800', fontSize: typography.md, minWidth: 50, padding: 0 },
  stakeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stakeChipText: { color: colors.textSecondary, fontWeight: '700', fontSize: typography.xs },
  betButton: { borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' },
  betButtonText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.sm, letterSpacing: 0.5 },
  balanceHint: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.sm },
});
