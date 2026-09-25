import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorBetResult,
  AviatorConfig,
  AviatorHistoryEntry,
  AviatorMyBet,
  AviatorRoundView,
  cashOutCricketXBet,
  fetchCricketXConfig,
  fetchCricketXCurrentRound,
  fetchCricketXHistory,
  fetchCricketXMyBets,
  placeCricketXBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD66B';
const DEFAULT_GROWTH = Math.log(2) / 5;
const STAKE_STEPS = [10, 20, 50, 100, 200, 500];
const QUICK = [10, 50, 100, 500];
const AUTO_STEPS = [1.2, 1.5, 2, 3, 5, 10, 20, 50];
/** The ball climbs along its arc for this long, then hovers near the top. */
const ASCEND_S = 8;
const TOAST_MS = 1800;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function multColor(m: number): string {
  if (m < 2) return '#4FC3FF';
  if (m < 10) return '#B06CFF';
  return '#FF4FA0';
}

// ---------- scene ----------

/** Night stadium: sky, floodlights, crowd, striped outfield, pitch. */
const Stadium = memo(function Stadium({ w, h }: { w: number; h: number }) {
  const crowd = useMemo(() => {
    let seed = 11;
    const rnd = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const colors = ['#FF4F6D', '#FFD66B', '#4FC3FF', '#FFFFFF', '#7EE2A3', '#B06CFF'];
    return Array.from({ length: 150 }, () => ({ x: rnd() * w, y: h * (0.3 + rnd() * 0.16), r: 0.8 + rnd() * 1.4, c: colors[Math.floor(rnd() * colors.length)], o: 0.35 + rnd() * 0.5 }));
  }, [w, h]);
  const fieldTop = h * 0.5;
  const stripes = 7;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#050A1E" />
          <Stop offset="1" stopColor="#1A2350" />
        </SvgLinearGradient>
        <RadialGradient id="flood" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFBEA" stopOpacity={0.95} />
          <Stop offset="0.3" stopColor="#FFF1B8" stopOpacity={0.35} />
          <Stop offset="1" stopColor="#FFF1B8" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6D0" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#FFF6D0" stopOpacity={0} />
        </SvgLinearGradient>
        <SvgLinearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#1F8A3C" />
          <Stop offset="1" stopColor="#0B4A1C" />
        </SvgLinearGradient>
        <SvgLinearGradient id="stand" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#161B3A" />
          <Stop offset="1" stopColor="#0C0F24" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill="url(#sky)" />
      {/* Floodlight beams and heads */}
      <Polygon points={`${w * 0.08},${h * 0.1} ${w * 0.45},${h * 0.55} ${w * 0.1},${h * 0.62}`} fill="url(#beam)" />
      <Polygon points={`${w * 0.92},${h * 0.1} ${w * 0.55},${h * 0.55} ${w * 0.9},${h * 0.62}`} fill="url(#beam)" />
      <Circle cx={w * 0.08} cy={h * 0.1} r={h * 0.16} fill="url(#flood)" />
      <Circle cx={w * 0.92} cy={h * 0.1} r={h * 0.16} fill="url(#flood)" />
      {/* Stands and crowd */}
      <Path d={`M0 ${h * 0.28} Q ${w / 2} ${h * 0.22} ${w} ${h * 0.28} L ${w} ${fieldTop} L 0 ${fieldTop} Z`} fill="url(#stand)" />
      {crowd.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.c} opacity={p.o} />
      ))}
      <Rect x={0} y={h * 0.47} width={w} height={h * 0.035} fill="#0E1A3A" />
      <Rect x={0} y={h * 0.47} width={w} height={2} fill="#4FC3FF" opacity={0.6} />
      {/* Outfield with mowing stripes and the boundary rope */}
      <Rect x={0} y={fieldTop} width={w} height={h - fieldTop} fill="url(#grass)" />
      {Array.from({ length: stripes }, (_, i) =>
        i % 2 ? <Rect key={i} x={(w / stripes) * i} y={fieldTop} width={w / stripes} height={h - fieldTop} fill="#FFFFFF" opacity={0.05} /> : null
      )}
      <Ellipse cx={w / 2} cy={h * 1.05} rx={w * 0.62} ry={h * 0.5} fill="none" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={2} />
      {/* Pitch with creases and stumps where the batter stands */}
      <Polygon points={`${w * 0.02},${h} ${w * 0.2},${h} ${w * 0.3},${h * 0.72} ${w * 0.2},${h * 0.72}`} fill="#C9A86A" opacity={0.85} />
      <Line x1={w * 0.08} y1={h * 0.9} x2={w * 0.21} y2={h * 0.9} stroke="#FFFFFF" strokeWidth={2} opacity={0.8} />
      {[0, 1, 2].map((i) => (
        <Line key={i} x1={w * (0.11 + i * 0.012)} y1={h * 0.9} x2={w * (0.11 + i * 0.012)} y2={h * 0.8} stroke="#F4E3B5" strokeWidth={2.5} />
      ))}
    </Svg>
  );
});

/** A red leather ball with a white seam, turned by `spin` degrees. */
function Ball({ size, spin }: { size: number; spin: number }) {
  const r = size / 2;
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient id="leather" cx="35%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#FF6B6B" />
          <Stop offset="0.6" stopColor="#C8102E" />
          <Stop offset="1" stopColor="#6E0514" />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 1} fill="url(#leather)" />
      <G rotation={spin} origin={`${r}, ${r}`}>
        <Path d={`M ${r * 0.35} ${r * 0.2} Q ${r * 0.85} ${r} ${r * 0.35} ${r * 1.8}`} stroke="#FFF4E0" strokeWidth={1.4} fill="none" />
        <Path d={`M ${r * 0.5} ${r * 0.15} Q ${r} ${r} ${r * 0.5} ${r * 1.85}`} stroke="#FFF4E0" strokeWidth={0.8} strokeDasharray="1.5,1.5" fill="none" />
      </G>
    </Svg>
  );
}

// ---------- bet panel ----------

type PanelState = {
  amount: number;
  autoOn: boolean;
  autoAt: number;
  bet: AviatorBetResult | null;
  queued: boolean;
  cashedAt: number | null;
  busy: boolean;
};

function initialPanel(amount: number): PanelState {
  return { amount, autoOn: false, autoAt: 2, bet: null, queued: false, cashedAt: null, busy: false };
}

// ---------- screen ----------

export default function CricketXScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<AviatorConfig | null>(null);
  const [view, setView] = useState<AviatorRoundView | null>(null);
  const [history, setHistory] = useState<AviatorHistoryEntry[]>([]);
  const [myBets, setMyBets] = useState<AviatorMyBet[]>([]);
  const [panels, setPanels] = useState<[PanelState, PanelState]>([initialPanel(10), initialPanel(20)]);
  const [toast, setToast] = useState<{ text: string; good: boolean } | null>(null);
  const [, setFrame] = useState(0);

  const offsetRef = useRef(0);
  const mountedRef = useRef(true);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const periodRef = useRef<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const caughtAnim = useRef(new Animated.Value(0)).current;

  const growth = config?.growthRate ?? DEFAULT_GROWTH;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const minAuto = config?.minAutoCashout ?? 1.01;

  const showToast = useCallback((text: string, good = false) => {
    setToast({ text, good });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const setPanel = useCallback((i: 0 | 1, patch: Partial<PanelState>) => {
    setPanels((p) => {
      const next = [...p] as [PanelState, PanelState];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }, []);

  const loadLists = useCallback(() => {
    fetchCricketXHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    fetchCricketXMyBets()
      .then((b) => mountedRef.current && setMyBets(b.slice(0, 15)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchCricketXConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    loadLists();
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadLists]);

  // Round polling, quicker while the ball is in the air.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    const loop = async () => {
      let delay = 700;
      try {
        const sentAt = Date.now();
        const v = await fetchCricketXCurrentRound();
        const receivedAt = Date.now();
        if (!alive) return;
        if (v.serverTime) {
          const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
          offsetRef.current = offsetRef.current === 0 ? measured : offsetRef.current * 0.7 + measured * 0.3;
        }
        setView(v);
        if (v.phase === 'FLYING') delay = 350;
      } catch {
        delay = 1500;
      }
      if (alive) timer = setTimeout(loop, delay);
    };
    loop();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const srvNow = Date.now() + offsetRef.current;
  const flyStart = view ? new Date(view.flyStartTime).getTime() : 0;
  const localPhase = !view ? 'BETTING' : view.phase === 'CRASHED' ? 'CRASHED' : srvNow < flyStart ? 'BETTING' : 'FLYING';
  const elapsed = Math.max(0, (srvNow - flyStart) / 1000);
  const liveMult = localPhase === 'CRASHED' ? view?.crashMultiplier ?? 1 : localPhase === 'FLYING' ? round2(Math.exp(growth * elapsed)) : 1;

  // Smooth frames while the ball flies or the countdown runs.
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const tick = (t: number) => {
      if (t - last > 33) {
        last = t;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // New round: clear last round's bets and place any queued ones.
  useEffect(() => {
    if (!view) return;
    if (periodRef.current === view.periodNumber) return;
    const first = periodRef.current === null;
    periodRef.current = view.periodNumber;
    if (first) return;
    caughtAnim.setValue(0);
    loadLists();
    refreshWallet();
    panelsRef.current.forEach((p, i) => {
      setPanel(i as 0 | 1, { bet: null, cashedAt: null });
      if (p.queued && view.phase === 'BETTING') {
        setPanel(i as 0 | 1, { queued: false });
        placeBet(i as 0 | 1, true);
      }
    });
    // placeBet is stable enough for this once-per-round effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.periodNumber]);

  // Caught: pop the banner, refresh wallet and lists.
  const crashedPeriod = view?.phase === 'CRASHED' ? view.periodNumber : null;
  useEffect(() => {
    if (!crashedPeriod) return;
    caughtAnim.setValue(0);
    Animated.spring(caughtAnim, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    setTimeout(() => {
      if (!mountedRef.current) return;
      refreshWallet();
      loadLists();
    }, 600);
  }, [crashedPeriod, caughtAnim, refreshWallet, loadLists]);

  const placeBet = useCallback(
    async (i: 0 | 1, fromQueue = false) => {
      const p = panelsRef.current[i];
      if (p.busy || p.bet) return;
      if (p.amount > coins && !fromQueue) return showToast('Insufficient balance');
      setPanel(i, { busy: true });
      try {
        const bet = await placeCricketXBet(p.amount, p.autoOn ? p.autoAt : undefined);
        if (!mountedRef.current) return;
        setPanel(i, { bet, busy: false });
        refreshWallet();
      } catch (err) {
        if (!mountedRef.current) return;
        setPanel(i, { busy: false });
        showToast(errorMessage(err));
      }
    },
    [coins, refreshWallet, setPanel, showToast]
  );

  const cashOut = useCallback(
    async (i: 0 | 1) => {
      const p = panelsRef.current[i];
      if (!p.bet || p.busy || p.cashedAt) return;
      setPanel(i, { busy: true });
      try {
        const res = await cashOutCricketXBet(p.bet.id);
        if (!mountedRef.current) return;
        setPanel(i, { busy: false, cashedAt: res.multiplier });
        showToast(`+₹${res.payout.toFixed(2)} @ ${res.multiplier.toFixed(2)}x`, true);
        refreshWallet();
      } catch (err) {
        if (!mountedRef.current) return;
        setPanel(i, { busy: false });
        showToast(errorMessage(err));
      }
    },
    [refreshWallet, setPanel, showToast]
  );

  // Auto cash-out: once the ball passes a panel's target, cash out (the
  // server pays exactly the target).
  useEffect(() => {
    if (localPhase !== 'FLYING') return;
    panels.forEach((p, i) => {
      if (p.bet && !p.cashedAt && !p.busy && p.bet.autoCashoutAt && liveMult >= Number(p.bet.autoCashoutAt)) cashOut(i as 0 | 1);
    });
  });

  const onMain = (i: 0 | 1) => {
    const p = panels[i];
    if (p.bet && localPhase === 'FLYING' && !p.cashedAt) return cashOut(i);
    if (p.bet) return;
    if (p.queued) return setPanel(i, { queued: false });
    if (localPhase === 'BETTING') return placeBet(i);
    setPanel(i, { queued: true });
  };

  const stepStake = (i: 0 | 1, dir: 1 | -1) => {
    const steps = STAKE_STEPS.filter((v) => v >= minStake && v <= maxStake);
    const idx = Math.max(0, steps.indexOf(panels[i].amount));
    setPanel(i, { amount: steps[Math.max(0, Math.min(steps.length - 1, idx + dir))] ?? panels[i].amount });
  };
  const stepAuto = (i: 0 | 1, dir: 1 | -1) => {
    const steps = AUTO_STEPS.filter((v) => v >= minAuto);
    const idx = Math.max(0, steps.indexOf(panels[i].autoAt));
    setPanel(i, { autoAt: steps[Math.max(0, Math.min(steps.length - 1, idx + dir))] ?? panels[i].autoAt });
  };

  // ---- scene geometry ----
  const SW = W - 20;
  const SH = Math.min(SW * 0.72, 320);
  const origin = { x: SW * 0.2, y: SH * 0.8 };
  const end = { x: SW * 0.86, y: SH * 0.2 };
  const pointAt = (t: number) => ({
    x: origin.x + (end.x - origin.x) * t,
    y: origin.y - (origin.y - end.y) * Math.pow(t, 1.8),
  });
  const t = localPhase === 'BETTING' ? 0 : Math.min(1, (localPhase === 'CRASHED' && view?.crashMultiplier ? Math.log(view.crashMultiplier) / growth : elapsed) / ASCEND_S);
  const hover = t >= 1 && localPhase === 'FLYING' ? Math.sin(srvNow / 600) * SH * 0.04 : 0;
  const ballPos = pointAt(t);
  ballPos.y += hover;
  const trail = Array.from({ length: 28 }, (_, k) => pointAt((t * k) / 27));
  const trailD = trail.map((p, k) => `${k ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaD = `${trailD} L ${ballPos.x.toFixed(1)} ${origin.y} Z`;
  const ballSize = SH * 0.09;
  const betLeft = localPhase === 'BETTING' ? Math.max(0, (flyStart - srvNow) / 1000) : 0;
  const betTotal = config?.bettingDurationSeconds ?? 6;
  const crashed = localPhase === 'CRASHED';
  const color = crashed ? '#FF4F4F' : multColor(liveMult);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#0A1030', '#050818']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="cricket" size={22} color={GOLD} />
          <Text style={styles.title}>
            CRICKET <Text style={{ color: '#FF4F6D' }}>X</Text>
          </Text>
        </Pressable>
        <View style={styles.topRight}>
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
            <Text style={styles.balanceText}>₹{coins.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositBtn}>
            <MaterialCommunityIcons name="plus" size={18} color="#1A1200" />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}>
        {/* Recent results */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.histRow}>
          {history.map((h) => {
            const m = Number(h.crashMultiplier);
            return (
              <View key={h.periodNumber} style={[styles.histChip, { borderColor: multColor(m) }]}>
                <Text style={[styles.histText, { color: multColor(m) }]}>{m.toFixed(2)}x</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Stadium scene */}
        <View style={[styles.scene, { width: SW, height: SH }]}>
          <Stadium w={SW} h={SH} />
          <Svg width={SW} height={SH} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient id="trailFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.45} />
                <Stop offset="1" stopColor={color} stopOpacity={0.02} />
              </SvgLinearGradient>
            </Defs>
            {t > 0 && (
              <>
                <Path d={areaD} fill="url(#trailFill)" />
                <Path d={trailD} stroke={color} strokeWidth={3.5} fill="none" strokeLinecap="round" />
                <Path d={trailD} stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.2} fill="none" strokeDasharray="4,6" />
              </>
            )}
          </Svg>
          {/* Batter at the crease */}
          <View pointerEvents="none" style={[styles.batter, { left: origin.x - 34, top: origin.y - 50 }]}>
            <MaterialCommunityIcons name="cricket" size={46} color="#FFFFFF" style={styles.batterGlow} />
          </View>
          {/* Ball */}
          <View pointerEvents="none" style={{ position: 'absolute', left: ballPos.x - ballSize / 2, top: ballPos.y - ballSize / 2 }}>
            <Ball size={ballSize} spin={elapsed * 540} />
          </View>
          {crashed && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.glove,
                { left: ballPos.x - 26, top: ballPos.y - 24, transform: [{ scale: caughtAnim.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] },
              ]}
            >
              <MaterialCommunityIcons name="hand-back-right" size={44} color="#FFD6A5" />
            </Animated.View>
          )}

          {/* Centre read-out */}
          <View pointerEvents="none" style={styles.centre}>
            {localPhase === 'BETTING' ? (
              <>
                <Text style={styles.nextText}>NEXT BALL IN</Text>
                <Text style={styles.countText}>{betLeft.toFixed(1)}s</Text>
                <View style={styles.countTrack}>
                  <View style={[styles.countFill, { width: `${Math.min(100, (betLeft / betTotal) * 100)}%` }]} />
                </View>
              </>
            ) : (
              <>
                {crashed && (
                  <Animated.Text style={[styles.caught, { transform: [{ scale: caughtAnim.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }] }]}>
                    CAUGHT!
                  </Animated.Text>
                )}
                <Text style={[styles.multText, { color, textShadowColor: color }]}>{liveMult.toFixed(2)}x</Text>
              </>
            )}
          </View>
        </View>

        {/* Two bet panels */}
        {([0, 1] as const).map((i) => {
          const p = panels[i];
          const live = p.bet && localPhase === 'FLYING' && !p.cashedAt;
          const lostBet = p.bet && crashed && !p.cashedAt;
          let label = `BET`;
          let sub = `₹${p.amount.toFixed(2)}`;
          let colors: [string, string] = ['#2FD16B', '#138A3E'];
          if (live) {
            label = 'CASH OUT';
            sub = `₹${round2(Number(p.bet!.amount) * liveMult).toFixed(2)}`;
            colors = ['#FFB23F', '#E07A10'];
          } else if (p.cashedAt) {
            label = 'CASHED OUT';
            sub = `@ ${p.cashedAt.toFixed(2)}x`;
            colors = ['#3A4A7A', '#26335C'];
          } else if (lostBet) {
            label = 'CAUGHT';
            sub = `-₹${Number(p.bet!.amount).toFixed(2)}`;
            colors = ['#5A2A3A', '#3A1422'];
          } else if (p.bet) {
            label = 'WAITING';
            sub = 'for the shot';
            colors = ['#3A4A7A', '#26335C'];
          } else if (p.queued) {
            label = 'CANCEL';
            sub = 'bet next ball';
            colors = ['#FF5A6A', '#C21F31'];
          }
          const locked = !!p.bet || p.queued;
          return (
            <View key={i} style={styles.panel}>
              <View style={styles.panelLeft}>
                <View style={styles.stakeRow}>
                  <Pressable onPress={() => stepStake(i, -1)} disabled={locked} style={[styles.roundBtn, locked && styles.dim]}>
                    <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF" />
                  </Pressable>
                  <Text style={styles.stakeText}>₹{p.amount}</Text>
                  <Pressable onPress={() => stepStake(i, 1)} disabled={locked} style={[styles.roundBtn, locked && styles.dim]}>
                    <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
                  </Pressable>
                </View>
                <View style={styles.quickRow}>
                  {QUICK.filter((q) => q <= maxStake).map((q) => (
                    <Pressable key={q} disabled={locked} onPress={() => setPanel(i, { amount: q })} style={[styles.quick, p.amount === q && styles.quickOn, locked && styles.dim]}>
                      <Text style={styles.quickText}>{q}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.autoRow}>
                  <Text style={styles.autoLabel}>Auto</Text>
                  <Switch
                    value={p.autoOn}
                    disabled={locked}
                    onValueChange={(v) => setPanel(i, { autoOn: v })}
                    trackColor={{ true: '#2FD16B', false: '#3A3F5C' }}
                    thumbColor="#FFFFFF"
                    style={{ transform: [{ scale: 0.8 }] }}
                  />
                  <Pressable onPress={() => stepAuto(i, -1)} disabled={locked || !p.autoOn} style={[styles.miniBtn, (locked || !p.autoOn) && styles.dim]}>
                    <MaterialCommunityIcons name="minus" size={14} color="#FFFFFF" />
                  </Pressable>
                  <Text style={[styles.autoValue, !p.autoOn && { opacity: 0.4 }]}>{p.autoAt.toFixed(2)}x</Text>
                  <Pressable onPress={() => stepAuto(i, 1)} disabled={locked || !p.autoOn} style={[styles.miniBtn, (locked || !p.autoOn) && styles.dim]}>
                    <MaterialCommunityIcons name="plus" size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              </View>
              <Pressable onPress={() => onMain(i)} disabled={p.busy} style={({ pressed }) => [styles.mainWrap, pressed && styles.pressed]}>
                <LinearGradient colors={colors} style={styles.mainBtn}>
                  <Text style={styles.mainLabel}>{p.busy ? '…' : label}</Text>
                  <Text style={styles.mainSub}>{sub}</Text>
                </LinearGradient>
              </Pressable>
            </View>
          );
        })}

        {/* My bets */}
        <Text style={styles.sectionTitle}>MY BETS</Text>
        {myBets.length === 0 ? (
          <Text style={styles.emptyText}>No bets yet — place one above.</Text>
        ) : (
          myBets.map((b) => {
            const won = b.status === 'WON';
            const pending = b.status === 'PENDING';
            return (
              <View key={b.id} style={styles.betRow}>
                <Text style={styles.betTime}>{new Date(b.createdAt).toLocaleTimeString()}</Text>
                <Text style={styles.betAmt}>₹{Number(b.amount).toFixed(2)}</Text>
                <Text style={[styles.betMult, { color: won ? '#7EE2A3' : pending ? '#FFFFFF' : '#FF7A8A' }]}>
                  {won ? `${Number(b.cashoutMultiplier).toFixed(2)}x` : pending ? '—' : `${Number(b.round.crashMultiplier).toFixed(2)}x`}
                </Text>
                <Text style={[styles.betWin, { color: won ? '#7EE2A3' : '#8A8FA8' }]}>{won ? `+₹${Number(b.payout).toFixed(2)}` : pending ? 'live' : '—'}</Text>
              </View>
            );
          })
        )}
        <Text style={styles.footNote}>Provably fair · house edge {config?.houseEdgePercent ?? 10}% · bet ₹{minStake}–₹{maxStake}</Text>
      </ScrollView>

      {toast && (
        <View pointerEvents="none" style={[styles.toast, toast.good && styles.toastGood]}>
          <Text style={[styles.toastText, toast.good && { color: '#0B3A1C' }]}>{toast.text}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050818' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  depositBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: GOLD },

  histRow: { gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  histChip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  histText: { fontSize: 12, fontWeight: '900' },

  scene: { alignSelf: 'center', borderRadius: 18, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(79,195,255,0.35)' },
  batter: { position: 'absolute' },
  batterGlow: { textShadowColor: '#4FC3FF', textShadowRadius: 12 },
  glove: { position: 'absolute' },
  centre: { position: 'absolute', top: '18%', left: 0, right: 0, alignItems: 'center' },
  nextText: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  countText: { color: GOLD, fontSize: 34, fontWeight: '900', marginTop: 2 },
  countTrack: { width: 160, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginTop: 6 },
  countFill: { height: '100%', backgroundColor: '#FF4F6D', borderRadius: 4 },
  caught: { color: '#FF4F4F', fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2, textShadowColor: '#000', textShadowRadius: 6 },
  multText: { fontSize: 52, fontWeight: '900', textShadowRadius: 18, textShadowOffset: { width: 0, height: 0 } },

  panel: { flexDirection: 'row', gap: 10, marginHorizontal: 10, marginTop: 10, padding: 10, borderRadius: 16, backgroundColor: '#121A3A', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  panelLeft: { flex: 1, gap: 6 },
  stakeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 20, padding: 3 },
  roundBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  stakeText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  quickRow: { flexDirection: 'row', gap: 4 },
  quick: { flex: 1, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  quickOn: { backgroundColor: 'rgba(255,214,107,0.25)', borderWidth: 1, borderColor: GOLD },
  quickText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  autoLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '800' },
  miniBtn: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  autoValue: { color: GOLD, fontSize: 13, fontWeight: '900', minWidth: 48, textAlign: 'center' },
  mainWrap: { width: '42%' },
  mainBtn: { flex: 1, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  mainLabel: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  mainSub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', marginTop: 2 },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.4 },

  sectionTitle: { color: GOLD, fontSize: 13, fontWeight: '900', letterSpacing: 2, marginTop: 16, marginHorizontal: 14 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginHorizontal: 14, marginTop: 6 },
  betRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  betTime: { flex: 1.2, color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  betAmt: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  betMult: { flex: 1, fontSize: 13, fontWeight: '900', textAlign: 'center' },
  betWin: { flex: 1, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  footNote: { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center', marginTop: 14 },

  toast: { position: 'absolute', alignSelf: 'center', top: '40%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.88)', borderWidth: 1, borderColor: '#FF4F6D' },
  toastGood: { backgroundColor: '#7EE2A3', borderColor: '#2FD16B' },
  toastText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
