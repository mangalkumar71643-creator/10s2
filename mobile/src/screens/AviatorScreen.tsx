import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { ApiClientError } from '../api/client';
import {
  AviatorBetResult,
  AviatorConfig,
  AviatorHistoryEntry,
  AviatorMyBet,
  AviatorRoundView,
  cashOutAviatorBet,
  fetchAviatorConfig,
  fetchAviatorCurrentRound,
  fetchAviatorHistory,
  fetchAviatorMyBets,
  fetchAviatorMyCurrentBet,
  placeAviatorBet,
} from '../api/backend';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';

// ---- Aviator's own visual identity — a deep night sky, distinct from the
// crimson/gold theme used everywhere else in the app (per user request:
// every game should have its own look, not share Win Go's table felt). ----
const SKY_TOP = '#080A24';
const SKY_MID = '#20103F';
const SKY_BOTTOM = '#33113D';
const GOLD = '#F0B93D';
const GOLD_LIGHT = '#FFDE8C';
const PINK = '#FF6FA5';
const POSITIVE = '#3ECF8E';
const NEGATIVE = '#FF6B6B';
const CARD_BG = 'rgba(255,255,255,0.06)';
const CARD_BORDER = 'rgba(255,255,255,0.12)';

const STAKE_PRESETS = [10, 50, 100, 500];
const STAKE_STEP = 10;
const LOCAL_TICK_MS = 60;
const POLL_MS = 1000;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatMultiplier(m: number): string {
  return `${m.toFixed(2)}x`;
}

/** Screen-space "how far up the climb" fraction — asymptotic so it always
 * keeps visibly climbing without ever needing to know the eventual crash
 * point (which the client never learns ahead of time; see aviatorService's
 * commit-reveal design). Purely cosmetic, not used for any payout math. */
function screenProgress(multiplier: number): number {
  return 1 - 1 / (1 + 0.35 * Math.log(multiplier));
}

function historyChipStyle(m: number): { bg: string; fg: string } {
  if (m >= 10) return { bg: 'rgba(240,185,61,0.18)', fg: GOLD };
  if (m >= 2) return { bg: 'rgba(255,111,165,0.18)', fg: PINK };
  return { bg: 'rgba(140,150,255,0.18)', fg: '#9FB0FF' };
}

type FlightCanvasProps = { width: number; height: number; multiplier: number; crashed: boolean };

function FlightCanvas({ width, height, multiplier, crashed }: FlightCanvasProps) {
  const pad = 18;
  const cw = width - pad * 2;
  const ch = height - pad * 2;

  const points = useMemo(() => {
    const steps = 36;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= steps; i++) {
      const m = 1 + ((multiplier - 1) * i) / steps;
      const p = screenProgress(m);
      const x = pad + Math.min(1, p * 1.15) * cw;
      const y = pad + ch - p * ch;
      pts.push({ x, y });
    }
    return pts;
  }, [multiplier, cw, ch]);

  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
  }, [points]);

  const tip = points[points.length - 1];
  const prev = points[Math.max(0, points.length - 4)];
  const angle = (Math.atan2(tip.y - prev.y, tip.x - prev.x) * 180) / Math.PI;

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Path d={pathD} stroke="rgba(255,170,60,0.35)" strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={pathD} stroke={crashed ? NEGATIVE : GOLD} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={points[0].x} cy={points[0].y} r={4} fill={GOLD_LIGHT} />
      </Svg>
      <View
        style={{
          position: 'absolute',
          left: tip.x - 20,
          top: tip.y - 20,
          width: 40,
          height: 40,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ rotate: `${angle}deg` }],
        }}
      >
        <MaterialCommunityIcons name="send" size={26} color={crashed ? NEGATIVE : '#FFFFFF'} />
      </View>
    </View>
  );
}

export default function AviatorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<AviatorConfig | null>(null);
  const [round, setRound] = useState<AviatorRoundView | null>(null);
  const [history, setHistory] = useState<AviatorHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<AviatorMyBet[]>([]);
  const [myBet, setMyBet] = useState<AviatorBetResult | null>(null);
  const [liveMultiplier, setLiveMultiplier] = useState(1);
  const [stake, setStake] = useState(10);
  const [autoCashoutOn, setAutoCashoutOn] = useState(false);
  const [autoCashoutText, setAutoCashoutText] = useState('2.00');
  const [placing, setPlacing] = useState(false);
  const [cashingOut, setCashingOut] = useState(false);
  const [lastResult, setLastResult] = useState<{ crash: number; won: boolean; payout: number } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 220 });

  const roundRef = useRef<AviatorRoundView | null>(null);
  roundRef.current = round;
  const configRef = useRef<AviatorConfig | null>(null);
  configRef.current = config;
  const myBetRef = useRef<AviatorBetResult | null>(null);
  myBetRef.current = myBet;
  const prevPhaseRef = useRef<string | null>(null);
  const prevPeriodRef = useRef<string | null>(null);

  const cashPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    fetchAviatorConfig()
      .then((c) => {
        setConfig(c);
        setStake(c.minStake);
      })
      .catch(() => {});
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const rows = await fetchAviatorHistory();
      setHistory(rows);
    } catch {
      // transient — keep showing the previous list
    }
  }, []);

  const loadMyBets = useCallback(async () => {
    try {
      const rows = await fetchAviatorMyBets();
      setMyBets(rows);
    } catch {
      // not logged in / transient
    }
  }, []);

  const loadMyCurrentBet = useCallback(async () => {
    try {
      const bet = await fetchAviatorMyCurrentBet();
      setMyBet(bet);
    } catch {
      // not logged in / transient — leave as-is
    }
  }, []);

  const resyncingRef = useRef(false);
  const poll = useCallback(async () => {
    if (resyncingRef.current) return;
    resyncingRef.current = true;
    try {
      const view = await fetchAviatorCurrentRound();
      setRound(view);

      const phaseChanged = prevPhaseRef.current !== null && prevPhaseRef.current !== view.phase;
      const periodChanged = prevPeriodRef.current !== null && prevPeriodRef.current !== view.periodNumber;

      if (periodChanged) {
        setLastResult(null);
        setMyBet(null);
        loadMyCurrentBet();
      } else if (phaseChanged && view.phase === 'CRASHED') {
        loadMyCurrentBet();
        loadMyBets();
        loadHistory();
        refreshWallet().catch(() => {});
        const bet = myBetRef.current;
        if (bet) {
          const won = bet.status === 'WON';
          setLastResult({ crash: view.crashMultiplier ?? 0, won, payout: Number(bet.payout) });
        }
      } else if (prevPhaseRef.current === null) {
        // first load — hydrate whatever bet already exists for this round
        loadMyCurrentBet();
        loadMyBets();
        loadHistory();
      }

      prevPhaseRef.current = view.phase;
      prevPeriodRef.current = view.periodNumber;
    } catch {
      // transient network error — next tick retries
    } finally {
      resyncingRef.current = false;
    }
  }, [loadHistory, loadMyBets, loadMyCurrentBet, refreshWallet]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') poll();
    });
    return () => sub.remove();
  }, [poll]);

  // Smooth local ticker for the multiplier/plane during FLYING — derived
  // from the round's absolute flyStartTime every tick (self-correcting,
  // same reasoning as the Win Go countdown fix: never drift, never freeze).
  useEffect(() => {
    if (round?.phase !== 'FLYING') {
      if (round?.phase === 'CRASHED' && round.crashMultiplier !== null) {
        setLiveMultiplier(round.crashMultiplier);
      } else if (round?.phase === 'BETTING') {
        setLiveMultiplier(1);
      }
      return;
    }
    const growthRate = configRef.current?.growthRate ?? Math.log(2) / 5;
    const flyStart = new Date(round.flyStartTime).getTime();
    const tick = () => {
      const elapsed = Math.max(0, (Date.now() - flyStart) / 1000);
      setLiveMultiplier(round2(Math.exp(growthRate * elapsed)));
    };
    tick();
    const id = setInterval(tick, LOCAL_TICK_MS);
    return () => clearInterval(id);
  }, [round?.phase, round?.flyStartTime, round?.crashMultiplier]);

  useEffect(() => {
    if (round?.phase === 'FLYING' && myBet?.status === 'PENDING') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(cashPulse, { toValue: 1.05, duration: 480, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(cashPulse, { toValue: 1, duration: 480, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
    cashPulse.setValue(1);
  }, [round?.phase, myBet?.status, cashPulse]);

  const phase = round?.phase ?? 'BETTING';

  const handleStakePreset = (v: number) => setStake(v);
  const nudgeStake = (delta: number) => {
    if (!config) return;
    setStake((s) => Math.min(config.maxStake, Math.max(config.minStake, round2(s + delta))));
  };

  const handlePlaceBet = async () => {
    if (!config || placing) return;
    setPlacing(true);
    try {
      const auto = autoCashoutOn ? Number(autoCashoutText) : undefined;
      if (autoCashoutOn && (!auto || auto < config.minAutoCashout)) {
        Alert.alert('Invalid auto cash-out', `Must be at least ${config.minAutoCashout}x.`);
        return;
      }
      const bet = await placeAviatorBet(stake, auto);
      setMyBet(bet);
      refreshWallet().catch(() => {});
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Could not place bet.';
      Alert.alert('Bet failed', message);
    } finally {
      setPlacing(false);
    }
  };

  const handleCashOut = async () => {
    if (!myBet || cashingOut) return;
    setCashingOut(true);
    try {
      const result = await cashOutAviatorBet(myBet.id);
      setMyBet({ ...myBet, status: 'WON', payout: String(result.payout), cashoutMultiplier: String(result.multiplier) });
      setLastResult({ crash: result.multiplier, won: true, payout: result.payout });
      refreshWallet().catch(() => {});
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : 'Could not cash out.';
      Alert.alert('Cash out failed', message);
    } finally {
      setCashingOut(false);
    }
  };

  const potentialPayout = round2(stake * liveMultiplier);
  const hasPendingBet = myBet?.status === 'PENDING';

  return (
    <View style={styles.root}>
      <LinearGradient colors={[SKY_TOP, SKY_MID, SKY_BOTTOM]} style={StyleSheet.absoluteFill} />
      <StarsLayer />

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Aviator</Text>
        <Pressable
          onPress={() =>
            Alert.alert(
              'Provably fair',
              `This round's result hash is published before it flies, so it can't be changed once betting opens. Once it crashes, the seed behind it is revealed so anyone can verify it.\n\nHash: ${
                round?.serverSeedHash?.slice(0, 24) ?? '…'
              }…`
            )
          }
          hitSlop={10}
          style={styles.headerBtn}
        >
          <MaterialCommunityIcons name="shield-check-outline" size={24} color={GOLD} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historyStrip} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {history.map((h) => {
            const c = historyChipStyle(Number(h.crashMultiplier));
            return (
              <View key={h.periodNumber} style={[styles.historyChip, { backgroundColor: c.bg }]}>
                <Text style={[styles.historyChipText, { color: c.fg }]}>{formatMultiplier(Number(h.crashMultiplier))}</Text>
              </View>
            );
          })}
        </ScrollView>

        <View
          style={styles.canvasCard}
          onLayout={(e) => setCanvasSize({ width: e.nativeEvent.layout.width, height: 220 })}
        >
          {canvasSize.width > 0 && (
            <FlightCanvas width={canvasSize.width} height={canvasSize.height} multiplier={Math.max(1, liveMultiplier)} crashed={phase === 'CRASHED'} />
          )}

          <View style={styles.canvasOverlay} pointerEvents="none">
            {phase === 'BETTING' && (
              <>
                <Text style={styles.overlayCaption}>NEXT ROUND IN</Text>
                <BettingCountdown flyStartTime={round?.flyStartTime ?? null} />
              </>
            )}
            {phase === 'FLYING' && <Text style={styles.multiplierText}>{formatMultiplier(liveMultiplier)}</Text>}
            {phase === 'CRASHED' && (
              <>
                <Text style={[styles.multiplierText, { color: NEGATIVE }]}>{formatMultiplier(round?.crashMultiplier ?? liveMultiplier)}</Text>
                <Text style={styles.crashedCaption}>FLEW AWAY</Text>
              </>
            )}
          </View>
        </View>

        {lastResult && phase === 'CRASHED' && (
          <View style={[styles.resultBanner, { borderColor: lastResult.won ? POSITIVE : NEGATIVE }]}>
            <Text style={[styles.resultBannerText, { color: lastResult.won ? POSITIVE : NEGATIVE }]}>
              {lastResult.won ? `You won ₹${lastResult.payout.toFixed(2)}!` : 'You lost this round.'}
            </Text>
          </View>
        )}

        <View style={styles.betCard}>
          {hasPendingBet && phase === 'FLYING' ? (
            <Animated.View style={{ transform: [{ scale: cashPulse }] }}>
              <Pressable style={styles.cashOutBtn} onPress={handleCashOut} disabled={cashingOut}>
                <Text style={styles.cashOutLabel}>CASH OUT</Text>
                <Text style={styles.cashOutAmount}>₹{potentialPayout.toFixed(2)}</Text>
              </Pressable>
            </Animated.View>
          ) : hasPendingBet ? (
            <View style={styles.placedBanner}>
              <MaterialCommunityIcons name="check-circle-outline" size={18} color={GOLD} />
              <Text style={styles.placedBannerText}>Bet placed: ₹{Number(myBet!.amount).toFixed(2)} — waiting for takeoff</Text>
            </View>
          ) : phase === 'FLYING' ? (
            <View style={styles.closedBanner}>
              <Text style={styles.closedBannerText}>Betting closed — round in progress</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Bet amount</Text>
              <View style={styles.stakeRow}>
                <Pressable style={styles.stakeStepBtn} onPress={() => nudgeStake(-STAKE_STEP)}>
                  <Text style={styles.stakeStepText}>−</Text>
                </Pressable>
                <TextInput
                  style={styles.stakeInput}
                  keyboardType="numeric"
                  value={String(stake)}
                  onChangeText={(t) => {
                    const n = Number(t.replace(/[^0-9.]/g, ''));
                    setStake(Number.isFinite(n) ? n : 0);
                  }}
                />
                <Pressable style={styles.stakeStepBtn} onPress={() => nudgeStake(STAKE_STEP)}>
                  <Text style={styles.stakeStepText}>+</Text>
                </Pressable>
              </View>
              <View style={styles.presetRow}>
                {STAKE_PRESETS.map((v) => (
                  <Pressable key={v} style={[styles.presetChip, stake === v && styles.presetChipActive]} onPress={() => handleStakePreset(v)}>
                    <Text style={[styles.presetChipText, stake === v && styles.presetChipTextActive]}>₹{v}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.autoRow} onPress={() => setAutoCashoutOn((v) => !v)}>
                <MaterialCommunityIcons name={autoCashoutOn ? 'checkbox-marked' : 'checkbox-blank-outline'} size={20} color={GOLD} />
                <Text style={styles.autoRowLabel}>Auto cash-out at</Text>
                <TextInput
                  style={[styles.autoInput, !autoCashoutOn && styles.autoInputDisabled]}
                  editable={autoCashoutOn}
                  keyboardType="numeric"
                  value={autoCashoutText}
                  onChangeText={setAutoCashoutText}
                />
                <Text style={styles.autoRowLabel}>x</Text>
              </Pressable>

              <Pressable
                style={[styles.betBtn, phase !== 'BETTING' && styles.betBtnDisabled]}
                onPress={handlePlaceBet}
                disabled={placing || phase !== 'BETTING'}
              >
                <Text style={styles.betBtnText}>PLACE BET · ₹{stake.toFixed(2)}</Text>
              </Pressable>
            </>
          )}
        </View>

        {myBets.length > 0 && (
          <View style={styles.myBetsCard}>
            <Text style={styles.sectionLabel}>Your recent bets</Text>
            {myBets.slice(0, 6).map((b) => (
              <View key={b.id} style={styles.myBetRow}>
                <Text style={styles.myBetAmount}>₹{Number(b.amount).toFixed(2)}</Text>
                <Text style={[styles.myBetStatus, { color: b.status === 'WON' ? POSITIVE : b.status === 'LOST' ? NEGATIVE : GOLD }]}>
                  {b.status === 'WON'
                    ? `${Number(b.cashoutMultiplier).toFixed(2)}x → +₹${Number(b.payout).toFixed(2)}`
                    : b.status === 'LOST'
                    ? 'Lost'
                    : 'Pending'}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function BettingCountdown({ flyStartTime }: { flyStartTime: string | null }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!flyStartTime) return;
    const target = new Date(flyStartTime).getTime();
    const tick = () => setRemaining(Math.max(0, Math.round((target - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [flyStartTime]);
  return <Text style={styles.countdownText}>{remaining}s</Text>;
}

function StarsLayer() {
  const stars = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        key: i,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 55}%`,
        size: 1 + Math.random() * 2,
        opacity: new Animated.Value(0.3 + Math.random() * 0.6),
      })),
    []
  );

  useEffect(() => {
    const loops = stars.map((s) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(s.opacity, { toValue: 0.15, duration: 1200 + Math.random() * 1600, useNativeDriver: true }),
          Animated.timing(s.opacity, { toValue: 0.9, duration: 1200 + Math.random() * 1600, useNativeDriver: true }),
        ])
      )
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [stars]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((s) => (
        <Animated.View
          key={s.key}
          style={{
            position: 'absolute',
            left: s.left as any,
            top: s.top as any,
            width: s.size,
            height: s.size,
            borderRadius: s.size / 2,
            backgroundColor: '#FFFFFF',
            opacity: s.opacity,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SKY_TOP },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', letterSpacing: 0.5 },
  scrollBody: { paddingBottom: 40 },
  historyStrip: { maxHeight: 44, marginBottom: 12 },
  historyChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, justifyContent: 'center' },
  historyChipText: { fontSize: 13, fontWeight: '700' },
  canvasCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: CARD_BORDER,
    height: 220,
  },
  canvasOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  overlayCaption: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, marginBottom: 6 },
  countdownText: { color: '#FFFFFF', fontSize: 40, fontWeight: '800' },
  multiplierText: { color: '#FFFFFF', fontSize: 44, fontWeight: '800' },
  crashedCaption: { color: NEGATIVE, fontSize: 13, fontWeight: '800', letterSpacing: 2, marginTop: 4 },
  resultBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  resultBannerText: { fontSize: 14, fontWeight: '700' },
  betCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  sectionLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  stakeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stakeStepBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stakeStepText: { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  stakeInput: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingVertical: 8,
  },
  presetRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  presetChip: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  presetChipActive: { backgroundColor: GOLD },
  presetChipText: { color: 'rgba(255,255,255,0.75)', fontWeight: '700', fontSize: 13 },
  presetChipTextActive: { color: '#241048' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  autoRowLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600' },
  autoInput: {
    width: 64,
    color: '#FFFFFF',
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  autoInputDisabled: { opacity: 0.4 },
  betBtn: { marginTop: 18, backgroundColor: GOLD, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  betBtnDisabled: { opacity: 0.4 },
  betBtnText: { color: '#241048', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  cashOutBtn: {
    backgroundColor: POSITIVE,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  cashOutLabel: { color: '#08231A', fontSize: 13, fontWeight: '800', letterSpacing: 1.5 },
  cashOutAmount: { color: '#08231A', fontSize: 26, fontWeight: '800', marginTop: 2 },
  placedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 10 },
  placedBannerText: { color: 'rgba(255,255,255,0.85)', fontWeight: '600' },
  closedBanner: { alignItems: 'center', paddingVertical: 10 },
  closedBannerText: { color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  myBetsCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
  },
  myBetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  myBetAmount: { color: '#FFFFFF', fontWeight: '700' },
  myBetStatus: { fontWeight: '700' },
});
