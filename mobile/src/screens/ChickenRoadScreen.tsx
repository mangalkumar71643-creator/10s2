import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  ChickenRoadConfig,
  ChickenRoadDifficulty,
  ChickenRoadRound,
  advanceChickenRoadStep,
  cashOutChickenRoadRound,
  fetchChickenRoadConfig,
  fetchChickenRoadCurrent,
  fetchChickenRoadHistory,
  startChickenRoadRound,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const MIN_STAKE = 10;
const STAKE_STEP = 10;
const LANE_WIDTH = 64;
const LANE_GAP = 8;

const DIFFICULTY_LABELS: Record<ChickenRoadDifficulty, string> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  HARDCORE: 'Hardcore',
};
const DIFFICULTY_ORDER: ChickenRoadDifficulty[] = ['EASY', 'MEDIUM', 'HARD', 'HARDCORE'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type ResultBanner = { kind: 'won'; payout: number } | { kind: 'busted' };

function HistoryChip({ round }: { round: ChickenRoadRound }) {
  const won = round.status === 'WON';
  return (
    <View style={[styles.historyChip, won ? styles.historyChipWon : styles.historyChipLost]}>
      <Text style={[styles.historyChipText, { color: won ? '#3ECF8E' : '#FF3B4E' }]}>
        {won ? `${Number(round.multiplier).toFixed(2)}x` : 'BUST'}
      </Text>
    </View>
  );
}

export default function ChickenRoadScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<ChickenRoadConfig | null>(null);
  const [difficulty, setDifficulty] = useState<ChickenRoadDifficulty>('EASY');
  const [stake, setStake] = useState(MIN_STAKE);
  const [stakeText, setStakeText] = useState(String(MIN_STAKE));
  const [round, setRound] = useState<ChickenRoadRound | null>(null);
  const [history, setHistory] = useState<ChickenRoadRound[]>([]);
  const [banner, setBanner] = useState<ResultBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const roadScrollRef = useRef<ScrollView>(null);

  const loadHistory = useCallback(() => {
    fetchChickenRoadHistory(20)
      .then(setHistory)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchChickenRoadConfig()
      .then(setConfig)
      .catch(() => {});
    fetchChickenRoadCurrent()
      .then((current) => {
        if (current) setRound(current);
      })
      .catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const activeConfig = useMemo(
    () => config?.difficulties.find((d) => d.difficulty === (round?.difficulty ?? difficulty)) ?? null,
    [config, difficulty, round]
  );

  useEffect(() => {
    if (!round) return;
    roadScrollRef.current?.scrollTo({
      x: Math.max(0, round.currentStep * (LANE_WIDTH + LANE_GAP) - LANE_WIDTH),
      animated: true,
    });
  }, [round?.currentStep]);

  const commitStakeText = () => {
    const parsed = parseInt(stakeText, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(config?.minStake ?? MIN_STAKE, parsed) : MIN_STAKE;
    setStake(clamped);
    setStakeText(String(clamped));
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await startChickenRoadRound(stake, difficulty);
      setRound(created);
      setBanner(null);
      refreshWallet();
    } catch (err) {
      Alert.alert('Could not start', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const advance = async () => {
    if (busy || !round) return;
    setBusy(true);
    try {
      const result = await advanceChickenRoadStep(round.id);
      setRound(result.round);
      if (result.busted) {
        setBanner({ kind: 'busted' });
        refreshWallet();
        loadHistory();
      } else if (result.round.status === 'WON') {
        setBanner({ kind: 'won', payout: Number(result.round.payout) });
        refreshWallet();
        loadHistory();
      }
    } catch (err) {
      Alert.alert('Could not advance', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const cashOut = async () => {
    if (busy || !round) return;
    setBusy(true);
    try {
      const updated = await cashOutChickenRoadRound(round.id);
      setRound(updated);
      setBanner({ kind: 'won', payout: Number(updated.payout) });
      refreshWallet();
      loadHistory();
    } catch (err) {
      Alert.alert('Cash out failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const playAgain = () => {
    setRound(null);
    setBanner(null);
  };

  const isPlaying = round?.status === 'PENDING';
  const isSettled = round && round.status !== 'PENDING';
  const currentMultiplier = round ? Number(round.multiplier) : 1;
  const potentialPayout = round ? round2(Number(round.stake) * currentMultiplier) : 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.title}>Chicken Road</Text>
        <Text style={styles.balanceChip}>₹{coins.toFixed(2)}</Text>
      </View>

      <ScrollView
        style={styles.historyScroll}
        contentContainerStyle={styles.historyRow}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {history.length === 0 ? (
          <Text style={styles.historyEmptyText}>No rounds yet.</Text>
        ) : (
          history.map((h) => <HistoryChip key={h.id} round={h} />)
        )}
      </ScrollView>

      <View style={styles.roadWrap}>
        <ScrollView ref={roadScrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roadContent}>
          {(activeConfig?.multipliers ?? []).map((mult, step) => {
            if (step === 0) return null;
            const crossed = round ? step <= round.currentStep : false;
            const isCurrent = round ? step === round.currentStep + 1 && isPlaying : false;
            return (
              <View key={step} style={[styles.lane, crossed && styles.laneCrossed]}>
                {isCurrent && <Text style={styles.chicken}>🐔</Text>}
                <Text style={[styles.laneMultiplier, crossed && styles.laneMultiplierCrossed]}>
                  {mult.toFixed(2)}x
                </Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {banner && (
        <View style={[styles.banner, banner.kind === 'won' ? styles.bannerWon : styles.bannerLost]}>
          <Text style={styles.bannerText}>
            {banner.kind === 'won' ? `Cashed out! Won ₹${banner.payout.toFixed(2)}` : 'The chicken got hit — round lost.'}
          </Text>
        </View>
      )}

      {!round && (
        <View style={styles.controls}>
          <View style={styles.difficultyRow}>
            {DIFFICULTY_ORDER.map((d) => (
              <Pressable
                key={d}
                onPress={() => setDifficulty(d)}
                style={[styles.difficultyBtn, difficulty === d && styles.difficultyBtnActive]}
              >
                <Text style={[styles.difficultyText, difficulty === d && styles.difficultyTextActive]}>
                  {DIFFICULTY_LABELS[d]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.stakeRow}>
            <Pressable
              onPress={() => {
                const next = Math.max(config?.minStake ?? MIN_STAKE, stake - STAKE_STEP);
                setStake(next);
                setStakeText(String(next));
              }}
              style={styles.stakeStepBtn}
            >
              <Text style={styles.stakeStepText}>−</Text>
            </Pressable>
            <TextInput
              style={styles.stakeInput}
              value={stakeText}
              onChangeText={setStakeText}
              onBlur={commitStakeText}
              onSubmitEditing={commitStakeText}
              keyboardType="number-pad"
              returnKeyType="done"
              selectTextOnFocus
              textAlign="center"
            />
            <Pressable
              onPress={() => {
                const next = stake + STAKE_STEP;
                setStake(next);
                setStakeText(String(next));
              }}
              style={styles.stakeStepBtn}
            >
              <Text style={styles.stakeStepText}>+</Text>
            </Pressable>
          </View>

          <Pressable onPress={start} disabled={busy} style={styles.startBtn}>
            <Text style={styles.startBtnText}>Start ₹{stake.toFixed(2)}</Text>
          </Pressable>
        </View>
      )}

      {isPlaying && (
        <View style={styles.controls}>
          <Text style={styles.potentialPayoutText}>
            {currentMultiplier.toFixed(2)}x · ₹{potentialPayout.toFixed(2)}
          </Text>
          <View style={styles.actionRow}>
            <Pressable onPress={advance} disabled={busy} style={styles.advanceBtn}>
              <Text style={styles.advanceBtnText}>Next Lane</Text>
            </Pressable>
            <Pressable
              onPress={cashOut}
              disabled={busy || round.currentStep === 0}
              style={[styles.cashOutBtn, round.currentStep === 0 && styles.cashOutBtnDisabled]}
            >
              <Text style={styles.cashOutBtnText}>Cash Out</Text>
            </Pressable>
          </View>
        </View>
      )}

      {isSettled && (
        <View style={styles.controls}>
          <Pressable onPress={playAgain} style={styles.startBtn}>
            <Text style={styles.startBtnText}>Play Again</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1A1B1E' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: '#FFFFFF', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  balanceChip: { color: '#3ECF8E', fontSize: 15, fontWeight: '700', minWidth: 40, textAlign: 'right' },
  historyScroll: { height: 40, flexGrow: 0 },
  historyRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  historyEmptyText: { color: '#8A8A8E', fontSize: 12 },
  historyChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#2C2D31',
  },
  historyChipWon: {},
  historyChipLost: {},
  historyChipText: { fontSize: 12, fontWeight: '700' },
  roadWrap: {
    marginHorizontal: 12,
    backgroundColor: '#000000',
    borderRadius: 16,
    paddingVertical: 16,
  },
  roadContent: { paddingHorizontal: 12, gap: LANE_GAP, alignItems: 'center' },
  lane: {
    width: LANE_WIDTH,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#2C2D31',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 8,
  },
  laneCrossed: { backgroundColor: '#1F4A38' },
  chicken: { fontSize: 26, position: 'absolute', top: 6 },
  laneMultiplier: { color: '#B8B8BE', fontSize: 12, fontWeight: '700' },
  laneMultiplierCrossed: { color: '#3ECF8E' },
  banner: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bannerWon: { backgroundColor: 'rgba(62,207,142,0.15)' },
  bannerLost: { backgroundColor: 'rgba(255,59,78,0.15)' },
  bannerText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  controls: { marginTop: 16, paddingHorizontal: 12, gap: 14 },
  difficultyRow: { flexDirection: 'row', gap: 8 },
  difficultyBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#2C2D31',
    alignItems: 'center',
  },
  difficultyBtnActive: { backgroundColor: '#3ECF8E' },
  difficultyText: { color: '#B8B8BE', fontSize: 13, fontWeight: '700' },
  difficultyTextActive: { color: '#0A0A0D' },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    paddingVertical: 10,
  },
  stakeStepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3A3A3E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stakeStepText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  stakeInput: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', minWidth: 70, padding: 0 },
  startBtn: {
    backgroundColor: '#3ECF8E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startBtnText: { color: '#0A0A0D', fontSize: 16, fontWeight: '800' },
  potentialPayoutText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  actionRow: { flexDirection: 'row', gap: 12 },
  advanceBtn: {
    flex: 1,
    backgroundColor: '#4B7BEC',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  advanceBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
  cashOutBtn: {
    flex: 1,
    backgroundColor: '#3ECF8E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cashOutBtnDisabled: { opacity: 0.4 },
  cashOutBtnText: { color: '#0A0A0D', fontSize: 16, fontWeight: '800' },
});
