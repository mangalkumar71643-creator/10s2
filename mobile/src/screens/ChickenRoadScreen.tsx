import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
const QUICK_STAKES = [10, 100, 500, 1000];

// The extracted road-panel art (tree/lamp/sidewalk/2 manhole covers) is the
// first, fixed-size segment of a horizontally scrollable road — it already
// bakes in real manhole art for lanes 0 and 1. Every lane beyond that is
// drawn in code as a plain strip of the same road color with the same
// dashed white divider style repeating, so a round with many steps can be
// scrolled through. Round manhole-cover art for those later lanes will be
// dropped in later — for now they only show the multiplier text.
const SCREEN_WIDTH = Dimensions.get('window').width;
const PANEL_SOURCE_WIDTH = 1216;
const PANEL_SOURCE_HEIGHT = 1294;
const PANEL_ASPECT = PANEL_SOURCE_HEIGHT / PANEL_SOURCE_WIDTH;
const PANEL_WIDTH = SCREEN_WIDTH * 0.94;
const PANEL_HEIGHT = PANEL_WIDTH * PANEL_ASPECT;

// Fractional hotspot positions measured off the source image.
const NEAR_MANHOLE = { xFrac: 0.59, yFrac: 0.62 };
const FAR_MANHOLE = { xFrac: 0.93, yFrac: 0.62 };
const CHICKEN_IDLE_SPOT = { xFrac: 0.3, yFrac: 0.62 };

// Spacing between consecutive lane markers, derived from the two manholes
// already baked into the source art — every later lane repeats this pitch.
const LANE_PITCH = (FAR_MANHOLE.xFrac - NEAR_MANHOLE.xFrac) * PANEL_WIDTH;
const ROAD_COLOR = '#696666';

// Dash/gap run lengths measured off the source image's own divider line
// (~69px dash / ~70px gap out of a 1294px-tall, 1216px-wide source),
// scaled onto the panel's rendered height so the code-drawn dividers match.
const DASH_LEN = PANEL_HEIGHT * (69 / PANEL_SOURCE_HEIGHT);
const GAP_LEN = PANEL_HEIGHT * (70 / PANEL_SOURCE_HEIGHT);
const DASH_WIDTH = 3;

function laneX(step: number): number {
  return NEAR_MANHOLE.xFrac * PANEL_WIDTH + step * LANE_PITCH;
}

const CHICKEN_ASPECT = 650 / 562;
const CHICKEN_WIDTH = 60;
const CHICKEN_HEIGHT = CHICKEN_WIDTH * CHICKEN_ASPECT;
const HOP_DURATION_MS = 380;

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

function quickStakeLabel(amount: number): string {
  return amount >= 1000 ? `${amount / 1000}K` : String(amount);
}

type ResultBanner = { kind: 'won'; payout: number } | { kind: 'busted' };

const DASH_COUNT = Math.ceil(PANEL_HEIGHT / (DASH_LEN + GAP_LEN)) + 1;

function DashedDivider({ left }: { left: number }) {
  return (
    <View style={{ position: 'absolute', left, top: 0, width: DASH_WIDTH, height: PANEL_HEIGHT }} pointerEvents="none">
      {Array.from({ length: DASH_COUNT }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            top: i * (DASH_LEN + GAP_LEN),
            width: DASH_WIDTH,
            height: DASH_LEN,
            backgroundColor: '#FFFFFF',
            opacity: 0.85,
          }}
        />
      ))}
    </View>
  );
}

function HistoryChip({ round }: { round: ChickenRoadRound }) {
  const won = round.status === 'WON';
  return (
    <View style={styles.historyChip}>
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stake, setStake] = useState(MIN_STAKE);
  const [stakeText, setStakeText] = useState(String(MIN_STAKE));
  const [round, setRound] = useState<ChickenRoadRound | null>(null);
  const [history, setHistory] = useState<ChickenRoadRound[]>([]);
  const [banner, setBanner] = useState<ResultBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [hopOffset, setHopOffset] = useState(0);
  const [shakeX, setShakeX] = useState(0);
  const hopRafRef = useRef<number | null>(null);
  const roadScrollRef = useRef<ScrollView | null>(null);

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

  // Lanes 0 and 1 sit on the real manhole art baked into the background
  // image; every lane after that is a code-drawn extension of the same
  // road color, repeating the pitch measured between those two manholes.
  const maxSteps = activeConfig?.steps ?? 1;
  const extraLaneCount = Math.max(0, maxSteps - 1);
  const extraWidth = extraLaneCount * LANE_PITCH;
  const totalRoadWidth = PANEL_WIDTH + extraWidth;
  const extraLaneSteps = useMemo(
    () => Array.from({ length: extraLaneCount }, (_, i) => i + 2),
    [extraLaneCount]
  );

  useEffect(() => {
    return () => {
      if (hopRafRef.current !== null) cancelAnimationFrame(hopRafRef.current);
    };
  }, []);

  // Keep the chicken's current lane comfortably in view as the round
  // advances, without blocking the player from scrolling ahead manually.
  useEffect(() => {
    if (!round) return;
    const targetX = Math.max(0, laneX(round.currentStep) - PANEL_WIDTH * 0.35);
    roadScrollRef.current?.scrollTo({ x: targetX, animated: true });
  }, [round?.currentStep, round]);

  // A quick in-place hop each time the chicken survives a lane — there's
  // nowhere further to walk to on this fixed image, so "moving forward"
  // reads as a little jump rather than a horizontal slide.
  const hop = useCallback(() => {
    if (hopRafRef.current !== null) cancelAnimationFrame(hopRafRef.current);
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / HOP_DURATION_MS);
      setHopOffset(-Math.sin(t * Math.PI) * (CHICKEN_HEIGHT * 0.22));
      if (t < 1) {
        hopRafRef.current = requestAnimationFrame(step);
      } else {
        hopRafRef.current = null;
        setHopOffset(0);
      }
    };
    hopRafRef.current = requestAnimationFrame(step);
  }, []);

  const shakeInPlace = useCallback(() => {
    const offsets = [-6, 6, -4, 4, 0];
    offsets.forEach((offset, i) => {
      setTimeout(() => setShakeX(offset), i * 80);
    });
  }, []);

  const setStakeValue = (value: number) => {
    setStake(value);
    setStakeText(String(value));
  };

  const commitStakeText = () => {
    const parsed = parseInt(stakeText, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(config?.minStake ?? MIN_STAKE, parsed) : MIN_STAKE;
    setStakeValue(clamped);
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
        shakeInPlace();
        setBanner({ kind: 'busted' });
        refreshWallet();
        loadHistory();
      } else {
        hop();
        if (result.round.status === 'WON') {
          setBanner({ kind: 'won', payout: Number(result.round.payout) });
          refreshWallet();
          loadHistory();
        }
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
    setHopOffset(0);
    setShakeX(0);
  };

  const isPlaying = round?.status === 'PENDING';
  const isSettled = round && round.status !== 'PENDING';
  const currentMultiplier = round ? Number(round.multiplier) : 1;
  const potentialPayout = round ? round2(Number(round.stake) * currentMultiplier) : 0;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={26} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.logoEgg}>🥚</Text>
        <View>
          <Text style={styles.logoText}>CHICKEN</Text>
          <Text style={styles.logoText}>ROAD</Text>
        </View>
        <View style={styles.headerSpacer} />
        <View style={styles.balancePill}>
          <Text style={styles.balanceRupee}>₹</Text>
          <Text style={styles.balanceAmount}>{coins.toFixed(2)}</Text>
        </View>
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

      <ScrollView
        ref={roadScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.roadWrap, { width: PANEL_WIDTH, height: PANEL_HEIGHT }]}
        contentContainerStyle={{ width: totalRoadWidth, height: PANEL_HEIGHT }}
      >
        <Image
          source={require('../../assets/chicken-road-panel-bg.png')}
          style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
          resizeMode="contain"
        />

        <View
          style={[
            styles.manholeLabel,
            { left: NEAR_MANHOLE.xFrac * PANEL_WIDTH - 40, top: NEAR_MANHOLE.yFrac * PANEL_HEIGHT - 12 },
          ]}
          pointerEvents="none"
        >
          <Text style={styles.manholeLabelText}>{currentMultiplier.toFixed(2)}x</Text>
        </View>

        {activeConfig?.multipliers[1] !== undefined && (
          <View
            style={[
              styles.manholeLabel,
              { left: FAR_MANHOLE.xFrac * PANEL_WIDTH - 40, top: FAR_MANHOLE.yFrac * PANEL_HEIGHT - 12 },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.manholeLabelText}>{activeConfig.multipliers[1].toFixed(2)}x</Text>
          </View>
        )}

        {extraLaneCount > 0 && (
          <View
            style={{
              position: 'absolute',
              left: PANEL_WIDTH,
              top: 0,
              width: extraWidth,
              height: PANEL_HEIGHT,
              backgroundColor: ROAD_COLOR,
            }}
          >
            {extraLaneSteps.map((step) => (
              <DashedDivider key={`d-${step}`} left={laneX(step) - LANE_PITCH / 2 - PANEL_WIDTH} />
            ))}
            {extraLaneSteps.map((step) => {
              const mult = activeConfig?.multipliers[step];
              if (mult === undefined) return null;
              return (
                <View
                  key={`m-${step}`}
                  style={[
                    styles.manholeLabel,
                    { left: laneX(step) - PANEL_WIDTH - 40, top: NEAR_MANHOLE.yFrac * PANEL_HEIGHT - 12 },
                  ]}
                  pointerEvents="none"
                >
                  <Text style={styles.manholeLabelText}>{mult.toFixed(2)}x</Text>
                </View>
              );
            })}
          </View>
        )}

        <View
          style={[
            styles.chickenOverlay,
            {
              width: CHICKEN_WIDTH,
              height: CHICKEN_HEIGHT,
              left:
                (round ? laneX(round.currentStep) : CHICKEN_IDLE_SPOT.xFrac * PANEL_WIDTH) -
                CHICKEN_WIDTH / 2 +
                shakeX,
              top: NEAR_MANHOLE.yFrac * PANEL_HEIGHT - CHICKEN_HEIGHT + hopOffset,
            },
          ]}
          pointerEvents="none"
        >
          <Image
            source={require('../../assets/chicken-road-chicken.png')}
            style={{ width: CHICKEN_WIDTH, height: CHICKEN_HEIGHT }}
            resizeMode="contain"
          />
        </View>
      </ScrollView>

      {banner && (
        <View style={[styles.banner, banner.kind === 'won' ? styles.bannerWon : styles.bannerLost]}>
          <Text style={styles.bannerText}>
            {banner.kind === 'won' ? `Cashed out! Won ₹${banner.payout.toFixed(2)}` : 'The chicken got hit — round lost.'}
          </Text>
        </View>
      )}

      {!round && (
        <View style={styles.controls}>
          <View style={styles.stakeRow}>
            <Pressable onPress={() => setStakeValue(config?.minStake ?? MIN_STAKE)} style={styles.stakeMinMaxBtn}>
              <Text style={styles.stakeMinMaxText}>MIN</Text>
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
            <Pressable onPress={() => setStakeValue(config?.maxStake ?? 500)} style={styles.stakeMinMaxBtn}>
              <Text style={styles.stakeMinMaxText}>MAX</Text>
            </Pressable>
          </View>

          <View style={styles.presetRow}>
            {QUICK_STAKES.map((amount) => (
              <Pressable key={amount} onPress={() => setStakeValue(amount)} style={styles.presetBtn}>
                <Text style={styles.presetText}>
                  {quickStakeLabel(amount)} <Text style={styles.presetRupee}>₹</Text>
                </Text>
              </Pressable>
            ))}
          </View>

          <View>
            <Pressable onPress={() => setPickerOpen((v) => !v)} style={styles.difficultyDropdown}>
              <Text style={styles.difficultyDropdownText}>{DIFFICULTY_LABELS[difficulty]}</Text>
              <MaterialCommunityIcons
                name={pickerOpen ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#B8B8BE"
              />
            </Pressable>
            {pickerOpen && (
              <View style={styles.difficultyMenu}>
                {DIFFICULTY_ORDER.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setDifficulty(d);
                      setPickerOpen(false);
                    }}
                    style={styles.difficultyMenuItem}
                  >
                    <Text
                      style={[styles.difficultyMenuItemText, d === difficulty && styles.difficultyMenuItemTextActive]}
                    >
                      {DIFFICULTY_LABELS[d]}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          <Pressable onPress={start} disabled={busy} style={styles.playBtn}>
            <Text style={styles.playBtnText}>Play</Text>
          </Pressable>
        </View>
      )}

      {isPlaying && round && (
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
          <Pressable onPress={playAgain} style={styles.playBtn}>
            <Text style={styles.playBtnText}>Play Again</Text>
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
    gap: 6,
  },
  backBtn: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  logoEgg: { fontSize: 22 },
  logoText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', lineHeight: 13 },
  headerSpacer: { flex: 1 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  balanceRupee: {
    color: '#0A0A0D',
    backgroundColor: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    borderRadius: 8,
    width: 16,
    height: 16,
    textAlign: 'center',
    lineHeight: 16,
    overflow: 'hidden',
  },
  balanceAmount: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
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
  historyChipText: { fontSize: 12, fontWeight: '700' },
  roadWrap: {
    alignSelf: 'center',
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  manholeLabel: {
    position: 'absolute',
    width: 80,
    alignItems: 'center',
  },
  manholeLabelText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  chickenOverlay: { position: 'absolute' },
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
  controls: { marginTop: 16, paddingHorizontal: 12, gap: 12 },
  stakeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  stakeMinMaxBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#3A3A3E',
  },
  stakeMinMaxText: { color: '#B8B8BE', fontSize: 12, fontWeight: '700' },
  stakeInput: { flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '700', padding: 0 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#2C2D31',
    alignItems: 'center',
  },
  presetText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  presetRupee: { color: '#8A8A8E' },
  difficultyDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  difficultyDropdownText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  difficultyMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#2C2D31',
    borderRadius: 14,
    overflow: 'hidden',
    zIndex: 10,
    elevation: 10,
  },
  difficultyMenuItem: { paddingHorizontal: 16, paddingVertical: 12 },
  difficultyMenuItemText: { color: '#B8B8BE', fontSize: 14, fontWeight: '600' },
  difficultyMenuItemTextActive: { color: '#3ECF8E' },
  playBtn: {
    backgroundColor: '#3ECF8E',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  playBtnText: { color: '#0A0A0D', fontSize: 16, fontWeight: '800' },
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
