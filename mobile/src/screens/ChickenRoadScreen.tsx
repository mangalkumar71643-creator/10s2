import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
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
const LANE_WIDTH = 84;
const DIVIDER_WIDTH = 22;
const COOP_WIDTH = 92;
const QUICK_STAKES = [10, 100, 500, 1000];
const LANE_PITCH = LANE_WIDTH + DIVIDER_WIDTH;
const ROAD_CONTENT_PADDING = 16;
const CHICKEN_SIZE = 58;
const LANE_BADGE_SIZE = 74;
const LANE_SLOT_HEIGHT = 130;
// The badge sits flush with the bottom of the lane slot (see laneSlot's
// justifyContent: 'flex-end') — center the chicken on that same badge
// instead of floating near the top of the slot.
const CHICKEN_TOP = LANE_SLOT_HEIGHT - LANE_BADGE_SIZE / 2 - CHICKEN_SIZE / 2;
const WALK_DURATION_MS = 420;
const LEG_TOGGLE_MS = 110;

/** Center-x (in the road ScrollView's own content coordinates) of the
 * chicken's resting spot at a given step — step 0 is just before lane 1,
 * so starting a round visibly walks it in from behind the coop. */
function laneCenterX(step: number): number {
  return ROAD_CONTENT_PADDING + (step - 1) * LANE_PITCH + LANE_WIDTH / 2;
}

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

// Drawn instead of using the 🐔 emoji glyph — different Android fonts render
// that inconsistently (some show only a rotated head), so a plain vector
// bird guarantees the same look everywhere. Styled after the reference
// screenshot's mascot: a bold dark outline on every shape (what actually
// reads as a "real" game asset rather than a placeholder), a chubby
// rounded body with folded wings, a scalloped comb + wattle, glossy
// highlight patches for a toy-like 3D look, and `legPhase` swapping which
// foot is planted vs. lifted so toggling it every ~110ms during a walk
// reads as a stride instead of a static pose.
function ChickenSprite({ size, legPhase = 0, hit = false }: { size: number; legPhase?: 0 | 1; hit?: boolean }) {
  const shadeColor = hit ? '#F0B0AE' : '#DDE1EC';
  const outline = '#3B2A1F';
  const frontLegUp = legPhase === 1;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id="bodyGrad" cx="35%" cy="28%" r="80%">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor={shadeColor} />
        </RadialGradient>
        <RadialGradient id="headGrad" cx="35%" cy="28%" r="80%">
          <Stop offset="0%" stopColor="#FFFFFF" />
          <Stop offset="100%" stopColor={shadeColor} />
        </RadialGradient>
        <RadialGradient id="beakGrad" cx="35%" cy="20%" r="90%">
          <Stop offset="0%" stopColor="#FFD166" />
          <Stop offset="100%" stopColor="#F5A623" />
        </RadialGradient>
      </Defs>

      <Ellipse cx={50} cy={95} rx={22} ry={3.5} fill="rgba(0,0,0,0.25)" />

      {/* legs (drawn first so the body overlaps their hip joint) */}
      <Rect
        x={38}
        y={76}
        width={8}
        height={frontLegUp ? 9 : 14}
        rx={4}
        fill="#F5A623"
        stroke={outline}
        strokeWidth={2}
      />
      <Rect
        x={54}
        y={76}
        width={8}
        height={frontLegUp ? 14 : 9}
        rx={4}
        fill="#F5A623"
        stroke={outline}
        strokeWidth={2}
      />
      <Ellipse cx={42} cy={frontLegUp ? 85 : 90} rx={6} ry={2.5} fill="#F5A623" stroke={outline} strokeWidth={1.5} />
      <Ellipse cx={58} cy={frontLegUp ? 90 : 85} rx={6} ry={2.5} fill="#F5A623" stroke={outline} strokeWidth={1.5} />

      {/* folded wings, tucked behind the body's silhouette */}
      <Ellipse cx={25} cy={56} rx={9} ry={15} fill="#ECEAE4" stroke={outline} strokeWidth={2.5} />
      <Ellipse cx={75} cy={56} rx={9} ry={15} fill="#ECEAE4" stroke={outline} strokeWidth={2.5} />

      {/* body */}
      <Ellipse cx={50} cy={55} rx={27} ry={27} fill="url(#bodyGrad)" stroke={outline} strokeWidth={3} />
      <Ellipse cx={39} cy={44} rx={9} ry={11} fill="rgba(255,255,255,0.55)" />

      {/* head */}
      <Circle cx={50} cy={24} r={17} fill="url(#headGrad)" stroke={outline} strokeWidth={3} />
      <Ellipse cx={43} cy={17} rx={5} ry={6} fill="rgba(255,255,255,0.55)" />

      {/* scalloped comb */}
      <Circle cx={37} cy={10} r={5} fill="#FF4D4D" stroke={outline} strokeWidth={2} />
      <Circle cx={50} cy={6} r={5.5} fill="#FF4D4D" stroke={outline} strokeWidth={2} />
      <Circle cx={63} cy={10} r={5} fill="#FF4D4D" stroke={outline} strokeWidth={2} />

      {/* wattle, peeking out just under the beak */}
      <Ellipse cx={50} cy={40} rx={3.5} ry={4.5} fill="#FF4D4D" stroke={outline} strokeWidth={2} />

      {/* beak */}
      <Path d="M 44 33 L 56 33 L 50 41 Z" fill="url(#beakGrad)" stroke={outline} strokeWidth={2} />

      {/* eyes, with a small shine dot each */}
      <Circle cx={41} cy={21} r={4} fill={outline} />
      <Circle cx={59} cy={21} r={4} fill={outline} />
      <Circle cx={39.5} cy={19.5} r={1.2} fill="#FFFFFF" />
      <Circle cx={57.5} cy={19.5} r={1.2} fill="#FFFFFF" />
    </Svg>
  );
}

function LaneDivider() {
  return (
    <View style={styles.laneDivider}>
      {Array.from({ length: 8 }, (_, i) => (
        <View key={i} style={styles.laneDividerDash} />
      ))}
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
  const [chickenX, setChickenX] = useState(laneCenterX(0));
  const [legPhase, setLegPhase] = useState<0 | 1>(0);
  const [hitFlash, setHitFlash] = useState(false);
  const chickenXRef = useRef(chickenX);
  const walkRafRef = useRef<number | null>(null);
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
        if (current) {
          setRound(current);
          const x = laneCenterX(current.currentStep);
          chickenXRef.current = x;
          setChickenX(x);
        }
      })
      .catch(() => {});
    loadHistory();
  }, [loadHistory]);

  const activeConfig = useMemo(
    () => config?.difficulties.find((d) => d.difficulty === (round?.difficulty ?? difficulty)) ?? null,
    [config, difficulty, round]
  );

  // Slides the chicken from its current spot to a target lane over
  // WALK_DURATION_MS, toggling legPhase every LEG_TOGGLE_MS so it reads
  // as a walking stride rather than a teleport.
  const walkTo = useCallback((targetX: number) => {
    if (walkRafRef.current !== null) cancelAnimationFrame(walkRafRef.current);
    const startX = chickenXRef.current;
    const startTime = Date.now();
    const step = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / WALK_DURATION_MS);
      const x = startX + (targetX - startX) * t;
      chickenXRef.current = x;
      setChickenX(x);
      setLegPhase(Math.floor(elapsed / LEG_TOGGLE_MS) % 2 === 0 ? 0 : 1);
      if (t < 1) {
        walkRafRef.current = requestAnimationFrame(step);
      } else {
        walkRafRef.current = null;
        setLegPhase(0);
      }
    };
    walkRafRef.current = requestAnimationFrame(step);
    roadScrollRef.current?.scrollTo({ x: Math.max(0, targetX - LANE_WIDTH), animated: true });
  }, []);

  // No forward movement on a bust — a quick shake in place instead.
  const shakeInPlace = useCallback(() => {
    setHitFlash(true);
    const baseX = chickenXRef.current;
    const offsets = [-6, 6, -4, 4, 0];
    offsets.forEach((offset, i) => {
      setTimeout(() => setChickenX(baseX + offset), i * 80);
    });
    setTimeout(() => setHitFlash(false), offsets.length * 80);
  }, []);

  useEffect(() => {
    return () => {
      if (walkRafRef.current !== null) cancelAnimationFrame(walkRafRef.current);
    };
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
      const x = laneCenterX(0);
      chickenXRef.current = x;
      setChickenX(x);
      roadScrollRef.current?.scrollTo({ x: 0, animated: false });
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
        walkTo(laneCenterX(result.round.currentStep));
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
    const x = laneCenterX(0);
    chickenXRef.current = x;
    setChickenX(x);
    setLegPhase(0);
    setHitFlash(false);
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

      <View style={styles.roadWrap}>
        <View style={styles.coop}>
          {!round && <ChickenSprite size={62} />}
        </View>
        <ScrollView
          ref={roadScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.roadContent}
        >
          {(activeConfig?.multipliers ?? []).map((mult, step) => {
            if (step === 0) return null;
            const crossed = round ? step <= round.currentStep : false;
            return (
              <React.Fragment key={step}>
                {step > 1 && <LaneDivider />}
                <View style={styles.laneSlot}>
                  <View style={[styles.laneBadge, crossed && styles.laneBadgeCrossed]}>
                    <Text style={[styles.laneBadgeText, crossed && styles.laneBadgeTextCrossed]}>
                      {mult.toFixed(2)}x
                    </Text>
                  </View>
                </View>
              </React.Fragment>
            );
          })}
          {round && (
            <View style={[styles.chickenOverlay, { left: chickenX - CHICKEN_SIZE / 2 }]}>
              <ChickenSprite size={CHICKEN_SIZE} legPhase={legPhase} hit={hitFlash} />
            </View>
          )}
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

const ROAD_BG = '#262A52';
const COOP_BG = '#1B1E3D';
const LANE_BADGE_BG = '#3A3F73';
const LANE_BADGE_RING = '#4B5190';

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
  balanceRupee: { color: '#0A0A0D', backgroundColor: '#FFFFFF', fontSize: 11, fontWeight: '800', borderRadius: 8, width: 16, height: 16, textAlign: 'center', lineHeight: 16, overflow: 'hidden' },
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
    flexDirection: 'row',
    marginHorizontal: 12,
    backgroundColor: ROAD_BG,
    borderRadius: 16,
    overflow: 'hidden',
    height: 190,
  },
  coop: {
    width: COOP_WIDTH,
    backgroundColor: COOP_BG,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  roadContent: { alignItems: 'center', paddingHorizontal: 16 },
  laneSlot: { width: LANE_WIDTH, height: LANE_SLOT_HEIGHT, alignItems: 'center', justifyContent: 'flex-end' },
  chickenOverlay: { position: 'absolute', top: CHICKEN_TOP, width: CHICKEN_SIZE, height: CHICKEN_SIZE },
  laneBadge: {
    width: LANE_BADGE_SIZE,
    height: LANE_BADGE_SIZE,
    borderRadius: LANE_BADGE_SIZE / 2,
    backgroundColor: LANE_BADGE_BG,
    borderWidth: 4,
    borderColor: LANE_BADGE_RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laneBadgeCrossed: { backgroundColor: '#1F4A38', borderColor: '#3ECF8E' },
  laneBadgeText: { color: '#C7CBEF', fontSize: 14, fontWeight: '700' },
  laneBadgeTextCrossed: { color: '#3ECF8E' },
  laneDivider: {
    width: DIVIDER_WIDTH,
    height: 118,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  laneDividerDash: { width: 2, height: 7, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.3)' },
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
