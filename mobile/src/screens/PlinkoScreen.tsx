import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import { PlinkoConfig, PlinkoRisk, dropPlinkoBall, fetchPlinkoConfig } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const RISKS: { key: PlinkoRisk; label: string; color: string }[] = [
  { key: 'LOW', label: 'Low', color: '#2ECC71' },
  { key: 'MEDIUM', label: 'Medium', color: '#FFA629' },
  { key: 'HIGH', label: 'High', color: '#FF3D6E' },
];
const DEFAULT_ROWS = 12;
const DEFAULT_STAKE = 10;
const SEGMENT_MS = 115;
const AUTO_OPTIONS = [10, 25, 50, 100];
const AUTO_GAP_MS = 320;
const BIG_WIN_MULTIPLIER = 10;
const BIG_WIN_MS = 3000;
const HISTORY_LEN = 8;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

// Slot colours run from gold in the middle to hot red at the edges.
const SLOT_STOPS: [number, [number, number, number]][] = [
  [0, [255, 201, 40]],
  [0.55, [255, 122, 26]],
  [1, [255, 45, 85]],
];
function slotColor(k: number, rows: number): string {
  const t = Math.abs(k - rows / 2) / (rows / 2);
  for (let i = 1; i < SLOT_STOPS.length; i++) {
    const [t1, c1] = SLOT_STOPS[i];
    const [t0, c0] = SLOT_STOPS[i - 1];
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * f));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(255,45,85)';
}

function formatMult(m: number, compact: boolean): string {
  const s = m >= 100 ? String(Math.floor(m)) : String(m);
  return compact ? s : `${s}x`;
}

type Geometry = {
  rows: number;
  cx: number;
  sx: number;
  sy: number;
  top: number;
  pinR: number;
  ballR: number;
  slotTop: number;
  slotH: number;
  height: number;
};

function rowY(g: Geometry, i: number) {
  return g.top + i * g.sy;
}

function slotX(g: Geometry, k: number) {
  return g.cx + (k - g.rows / 2) * g.sx;
}

/** Keyframes for a ball following `path`: dropped onto the top pin, then
 * one little arc per row onto the next pin, then into its slot. */
function ballKeyframes(g: Geometry, path: number[]) {
  const pts: { x: number; y: number; h: number }[] = [{ x: g.cx, y: g.top - g.sy * 1.1, h: 0 }];
  let rights = 0;
  for (let i = 0; i < g.rows; i++) {
    pts.push({ x: g.cx + (rights - i / 2) * g.sx, y: rowY(g, i) - g.pinR - g.ballR, h: i === 0 ? 0 : g.sy * 0.32 });
    rights += path[i];
  }
  pts.push({ x: slotX(g, rights), y: g.slotTop + g.slotH * 0.3, h: g.sy * 0.32 });

  const input: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const taus = [0, 0.25, 0.5, 0.75];
  for (let s = 0; s < pts.length - 1; s++) {
    const a = pts[s];
    const b = pts[s + 1];
    for (const t of taus) {
      input.push(s + t);
      xs.push(a.x + (b.x - a.x) * t);
      ys.push(a.y + (b.y - a.y) * t - b.h * 4 * t * (1 - t));
    }
  }
  const last = pts[pts.length - 1];
  input.push(pts.length - 1);
  xs.push(last.x);
  ys.push(last.y);
  return { input, xs, ys, segments: pts.length - 1, slot: rights };
}

const Pins = memo(function Pins({ g, width }: { g: Geometry; width: number }) {
  const pins: React.ReactElement[] = [];
  for (let i = 0; i < g.rows; i++) {
    for (let j = 0; j < i + 3; j++) {
      const x = g.cx + (j - (i + 2) / 2) * g.sx;
      const y = rowY(g, i);
      pins.push(<Circle key={`h${i}-${j}`} cx={x} cy={y} r={g.pinR * 2.1} fill="url(#pinGlow)" />);
      pins.push(<Circle key={`p${i}-${j}`} cx={x} cy={y} r={g.pinR} fill="#FFFFFF" />);
    }
  }
  return (
    <Svg width={width} height={g.height} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#C9A7FF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#C9A7FF" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {pins}
    </Svg>
  );
});

type Ball = { id: number; stake: number; payout: number; multiplier: number; anim: Animated.Value; frames: ReturnType<typeof ballKeyframes> };
type Floater = { id: number; x: number; text: string; color: string; anim: Animated.Value };

export default function PlinkoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<PlinkoConfig | null>(null);
  const [risk, setRisk] = useState<PlinkoRisk>('MEDIUM');
  const [rows, setRows] = useState(DEFAULT_ROWS);
  const [stake, setStake] = useState(DEFAULT_STAKE);
  const [stakeText, setStakeText] = useState(DEFAULT_STAKE.toFixed(2));
  const [boardSize, setBoardSize] = useState<{ w: number; h: number } | null>(null);
  const [balls, setBalls] = useState<Ball[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [recent, setRecent] = useState<{ id: number; m: number; slot: number; rows: number }[]>([]);
  const [localBalance, setLocalBalance] = useState(coins);
  const [bigWin, setBigWin] = useState<{ m: number; amount: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [autoPickerOpen, setAutoPickerOpen] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const [rulesOpen, setRulesOpen] = useState(false);

  const idRef = useRef(1);
  const inFlightRef = useRef(0);
  const [inFlight, setInFlight] = useState(0);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLeftRef = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const maxPayout = config?.maxPayout ?? 10000;
  const table = config?.multipliers[risk]?.[String(rows)] ?? null;
  const busy = inFlight > 0 || autoLeft > 0;

  useEffect(() => {
    mountedRef.current = true;
    fetchPlinkoConfig()
      .then(setConfig)
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (autoTimer.current) clearTimeout(autoTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // The shown balance runs locally while balls are falling (stake off on
  // drop, win on landing) so a win never shows before its ball lands; it
  // re-syncs with the wallet whenever the board is quiet.
  useEffect(() => {
    if (inFlight === 0) setLocalBalance(coins);
  }, [coins, inFlight]);

  useEffect(() => {
    if (!bigWin) return;
    const id = setTimeout(() => setBigWin(null), BIG_WIN_MS);
    return () => clearTimeout(id);
  }, [bigWin]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }, []);

  const geometry: Geometry | null = useMemo(() => {
    if (!boardSize) return null;
    const sx = (boardSize.w - 16) / (rows + 2);
    const slotH = Math.max(22, Math.min(32, sx * 1.2));
    const headroom = sx * 1.3 + 8;
    const avail = boardSize.h - headroom - slotH - 16;
    const sy = Math.min(sx * 1.3, avail / (rows - 1 + 0.75));
    // Centre the pyramid vertically in whatever room is left over.
    const top = headroom + Math.max(0, (avail - (rows - 1 + 0.6) * sy) / 2);
    const pinR = Math.max(2, Math.min(4.5, sx * 0.12));
    const ballR = Math.max(4, Math.min(9, sx * 0.27));
    const slotTop = top + (rows - 1) * sy + sy * 0.6;
    return { rows, cx: boardSize.w / 2, sx, sy, top, pinR, ballR, slotTop, slotH, height: boardSize.h };
  }, [boardSize, rows]);

  const slotAnims = useMemo(() => Array.from({ length: rows + 1 }, () => new Animated.Value(0)), [rows]);

  const onLand = useCallback(
    (ball: Ball) => {
      if (!mountedRef.current) return;
      const g = geometryRef.current;
      const slot = ball.frames.slot;
      const bump = slotAnimsRef.current[slot];
      if (bump) {
        bump.setValue(1);
        Animated.timing(bump, { toValue: 0, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      }
      setBalls((prev) => prev.filter((b) => b.id !== ball.id));
      setLocalBalance((b) => round2(b + ball.payout));
      setRecent((prev) => [{ id: ball.id, m: ball.multiplier, slot, rows: g?.rows ?? rows }, ...prev].slice(0, HISTORY_LEN));
      if (g && ball.payout > 0) {
        const fid = idRef.current++;
        const anim = new Animated.Value(0);
        setFloaters((prev) => [
          ...prev,
          { id: fid, x: slotX(g, slot), text: `+₹${ball.payout.toFixed(2)}`, color: ball.multiplier >= 1 ? '#7CFFB2' : '#FFD27A', anim },
        ]);
        Animated.timing(anim, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() =>
          setFloaters((prev) => prev.filter((f) => f.id !== fid))
        );
      }
      if (ball.multiplier >= BIG_WIN_MULTIPLIER) setBigWin({ m: ball.multiplier, amount: ball.payout });
      inFlightRef.current -= 1;
      setInFlight(inFlightRef.current);
      if (inFlightRef.current === 0) refreshWallet();
    },
    [refreshWallet, rows]
  );

  const geometryRef = useRef(geometry);
  geometryRef.current = geometry;
  const slotAnimsRef = useRef(slotAnims);
  slotAnimsRef.current = slotAnims;

  const drop = useCallback(async (): Promise<boolean> => {
    const g = geometryRef.current;
    if (!g) return false;
    if (stake > localBalanceRef.current) {
      showToast('Insufficient balance');
      return false;
    }
    inFlightRef.current += 1;
    setInFlight(inFlightRef.current);
    setLocalBalance((b) => round2(b - stake));
    try {
      const res = await dropPlinkoBall(stake, g.rows, riskRef.current);
      if (!mountedRef.current) return false;
      const frames = ballKeyframes(g, res.path);
      const ball: Ball = {
        id: idRef.current++,
        stake,
        payout: Number(res.payout),
        multiplier: Number(res.multiplier),
        anim: new Animated.Value(0),
        frames,
      };
      setBalls((prev) => [...prev, ball]);
      Animated.timing(ball.anim, {
        toValue: frames.segments,
        duration: frames.segments * SEGMENT_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(() => onLand(ball));
      return true;
    } catch (err) {
      inFlightRef.current -= 1;
      setInFlight(inFlightRef.current);
      setLocalBalance((b) => round2(b + stake));
      if (mountedRef.current) showToast(errorMessage(err));
      return false;
    }
  }, [stake, onLand, showToast]);

  const localBalanceRef = useRef(localBalance);
  localBalanceRef.current = localBalance;
  const riskRef = useRef(risk);
  riskRef.current = risk;
  const dropRef = useRef(drop);
  dropRef.current = drop;

  const stopAuto = () => {
    autoLeftRef.current = 0;
    setAutoLeft(0);
    if (autoTimer.current) clearTimeout(autoTimer.current);
  };

  const startAuto = (count: number) => {
    setAutoPickerOpen(false);
    autoLeftRef.current = count;
    setAutoLeft(count);
    const tick = async () => {
      if (!mountedRef.current || autoLeftRef.current <= 0) return;
      const ok = await dropRef.current();
      if (!ok) return stopAuto();
      autoLeftRef.current -= 1;
      setAutoLeft(autoLeftRef.current);
      if (autoLeftRef.current > 0) autoTimer.current = setTimeout(tick, AUTO_GAP_MS);
    };
    tick();
  };

  const setStakeValue = (v: number) => {
    const c = round2(Math.min(Math.max(v, minStake), maxStake));
    setStake(c);
    setStakeText(c.toFixed(2));
  };

  const commitStake = () => {
    const n = Number(stakeText);
    setStakeValue(Number.isFinite(n) && n > 0 ? n : stake);
  };

  const compactSlots = (geometry?.sx ?? 40) < 36;

  return (
    <LinearGradient colors={['#1B0B45', '#0D0628', '#070316']} style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="#E9D8FF" />
          <Text style={styles.title}>PLINKO</Text>
        </Pressable>
        <View style={styles.headerRight}>
          <View style={styles.balancePill}>
            <MaterialCommunityIcons name="wallet" size={16} color="#FFD66B" />
            <Text style={styles.balanceText}>₹{localBalance.toFixed(2)}</Text>
          </View>
          <Pressable onPress={() => setRulesOpen(true)} style={styles.helpBtn} hitSlop={6}>
            <Text style={styles.helpText}>?</Text>
          </Pressable>
        </View>
      </View>

      {/* Recent results */}
      <View style={styles.recentRow}>
        {recent.length === 0 ? (
          <Text style={styles.recentEmpty}>Drop a ball to start</Text>
        ) : (
          recent.map((r) => (
            <View key={r.id} style={[styles.recentChip, { backgroundColor: slotColor(r.slot, r.rows) }]}>
              <Text style={styles.recentText}>{formatMult(r.m, false)}</Text>
            </View>
          ))
        )}
      </View>

      {/* Board */}
      <View style={styles.board} onLayout={(e) => setBoardSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
        {boardSize && (
          <Svg width={boardSize.w} height={boardSize.h} style={StyleSheet.absoluteFill}>
            <Defs>
              <RadialGradient id="boardGlow" cx="50%" cy="55%" r="60%">
                <Stop offset="0" stopColor="#6A2BD9" stopOpacity={0.35} />
                <Stop offset="1" stopColor="#6A2BD9" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Rect x={0} y={0} width={boardSize.w} height={boardSize.h} fill="url(#boardGlow)" />
          </Svg>
        )}
        {geometry && boardSize && <Pins g={geometry} width={boardSize.w} />}

        {geometry &&
          table &&
          table.map((m, k) => {
            const bump = slotAnims[k];
            return (
              <Animated.View
                key={`${rows}-${k}`}
                style={[
                  styles.slot,
                  {
                    left: slotX(geometry, k) - geometry.sx / 2 + 1.5,
                    top: geometry.slotTop,
                    width: geometry.sx - 3,
                    height: geometry.slotH,
                    backgroundColor: slotColor(k, rows),
                    transform: [{ translateY: bump ? bump.interpolate({ inputRange: [0, 1], outputRange: [0, 7] }) : 0 }],
                  },
                ]}
              >
                <LinearGradient colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']} style={styles.slotShine} />
                <Text
                  style={[styles.slotText, { fontSize: Math.max(7, Math.min(12, geometry.sx * 0.36)) }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {formatMult(m, compactSlots)}
                </Text>
              </Animated.View>
            );
          })}

        {geometry &&
          balls.map((b) => {
            const tx = b.anim.interpolate({ inputRange: b.frames.input, outputRange: b.frames.xs });
            const ty = b.anim.interpolate({ inputRange: b.frames.input, outputRange: b.frames.ys });
            const r = geometry.ballR;
            return (
              <Animated.View
                key={b.id}
                pointerEvents="none"
                style={[styles.ball, { width: r * 2, height: r * 2, borderRadius: r, left: -r, top: -r, transform: [{ translateX: tx }, { translateY: ty }] }]}
              >
                <LinearGradient colors={['#FFB3E6', '#FF3D9A', '#C3006B']} style={{ flex: 1, borderRadius: r }} />
                <View style={[styles.ballShine, { width: r * 0.7, height: r * 0.7, borderRadius: r, top: r * 0.3, left: r * 0.35 }]} />
              </Animated.View>
            );
          })}

        {geometry &&
          floaters.map((f) => (
            <Animated.Text
              key={f.id}
              pointerEvents="none"
              style={[
                styles.floater,
                {
                  color: f.color,
                  left: Math.min(Math.max(f.x - 50, 4), (boardSize?.w ?? 400) - 104),
                  top: geometry.slotTop - 22,
                  opacity: f.anim.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                  transform: [{ translateY: f.anim.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }],
                },
              ]}
            >
              {f.text}
            </Animated.Text>
          ))}

        {bigWin && (
          <View style={styles.bigWinWrap}>
            <LinearGradient colors={['#3A1470', '#1A0838']} style={styles.bigWinCard}>
              <Text style={styles.bigWinTitle}>BIG WIN</Text>
              <Text style={styles.bigWinMult}>{formatMult(bigWin.m, false)}</Text>
              <Text style={styles.bigWinAmount}>₹{bigWin.amount.toFixed(2)}</Text>
            </LinearGradient>
            <Pressable onPress={() => setBigWin(null)} style={styles.bigWinClose} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={20} color="#FFE08A" />
            </Pressable>
          </View>
        )}

        {toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <LinearGradient colors={['#1E0E4A', '#120730']} style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.riskRow}>
          {RISKS.map((r) => {
            const active = r.key === risk;
            return (
              <Pressable
                key={r.key}
                disabled={busy}
                onPress={() => setRisk(r.key)}
                style={[styles.riskBtn, active && { backgroundColor: r.color, borderColor: r.color }, busy && !active && styles.dim]}
              >
                <Text style={[styles.riskText, active && styles.riskTextActive]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.controlRow}>
          <View style={styles.stepper}>
            <Text style={styles.stepLabel}>Rows</Text>
            <View style={styles.stepInner}>
              <Pressable disabled={busy || rows <= 8} onPress={() => setRows((r) => r - 1)} style={[styles.stepBtn, (busy || rows <= 8) && styles.dim]}>
                <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.stepValue}>{rows}</Text>
              <Pressable disabled={busy || rows >= 16} onPress={() => setRows((r) => r + 1)} style={[styles.stepBtn, (busy || rows >= 16) && styles.dim]}>
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <View style={[styles.stepper, styles.stakeBox]}>
            <Text style={styles.stepLabel}>Bet INR</Text>
            <View style={styles.stepInner}>
              <Pressable onPress={() => setStakeValue(stake / 2)} style={styles.stepBtn}>
                <Text style={styles.halfText}>½</Text>
              </Pressable>
              <TextInput
                style={styles.stakeInput}
                value={stakeText}
                onChangeText={setStakeText}
                onBlur={commitStake}
                onSubmitEditing={commitStake}
                keyboardType="decimal-pad"
                returnKeyType="done"
                selectTextOnFocus
                textAlign="center"
              />
              <Pressable onPress={() => setStakeValue(stake * 2)} style={styles.stepBtn}>
                <Text style={styles.halfText}>2×</Text>
              </Pressable>
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() => (autoLeft > 0 ? stopAuto() : setAutoPickerOpen((o) => !o))}
            style={[styles.autoBtn, autoLeft > 0 && styles.autoBtnActive]}
          >
            <MaterialCommunityIcons name={autoLeft > 0 ? 'stop' : 'autorenew'} size={22} color="#FFFFFF" />
            <Text style={styles.autoText}>{autoLeft > 0 ? `STOP ${autoLeft}` : 'AUTO'}</Text>
          </Pressable>
          <Pressable onPress={() => drop()} disabled={autoLeft > 0 || !geometry} style={({ pressed }) => [styles.betWrap, pressed && styles.pressed, autoLeft > 0 && styles.dim]}>
            <LinearGradient colors={['#7CF06B', '#23B14D', '#137A32']} style={styles.betBtn}>
              <Text style={styles.betText}>BET</Text>
              <Text style={styles.betSub}>₹{stake.toFixed(2)}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {autoPickerOpen && (
          <View style={styles.autoPicker}>
            <Text style={styles.autoPickerTitle}>Auto drop</Text>
            <View style={styles.autoPickerRow}>
              {AUTO_OPTIONS.map((n) => (
                <Pressable key={n} onPress={() => startAuto(n)} style={styles.autoOption}>
                  <Text style={styles.autoOptionText}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </LinearGradient>

      <Modal visible={rulesOpen} transparent animationType="fade" onRequestClose={() => setRulesOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setRulesOpen(false)}>
          <View style={styles.rulesCard}>
            <View style={styles.rulesHeader}>
              <Text style={styles.rulesTitle}>How to Play</Text>
              <Pressable onPress={() => setRulesOpen(false)} style={styles.rulesClose} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.rulesBody}>
              <Text style={styles.rulesText}>
                Pick your bet, the number of rows (8–16) and a risk level, then press BET. The ball bounces off the pins
                and lands in one of the boxes at the bottom — you win your bet times that box's multiplier.
              </Text>
              <Text style={styles.rulesText}>
                Higher risk makes the edge boxes pay much more and the middle ones less. More rows means more bounces and
                bigger edge multipliers.
              </Text>
              <Text style={styles.rulesText}>
                Every bounce is decided by provably-fair seeds before the ball falls. Return to player:{' '}
                {config?.rtpPercent ?? 90}%.
              </Text>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Minimum bet</Text>
                <Text style={styles.limitValue}>₹{minStake}</Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Maximum bet</Text>
                <Text style={styles.limitValue}>₹{maxStake}</Text>
              </View>
              <View style={styles.limitRow}>
                <Text style={styles.limitLabel}>Maximum win per ball</Text>
                <Text style={styles.limitValue}>₹{maxPayout.toLocaleString('en-IN')}</Text>
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingBottom: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#F2E6FF', fontSize: 22, fontWeight: '900', letterSpacing: 3, marginLeft: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(201,167,255,0.35)',
  },
  balanceText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  helpBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#6A2BD9' },
  helpText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  recentRow: { flexDirection: 'row', gap: 5, paddingHorizontal: 12, height: 28, alignItems: 'center' },
  recentEmpty: { color: 'rgba(233,216,255,0.5)', fontSize: 12 },
  recentChip: { paddingHorizontal: 7, height: 22, borderRadius: 6, justifyContent: 'center' },
  recentText: { color: '#2A0A14', fontSize: 11, fontWeight: '900' },
  board: { flex: 1, marginHorizontal: 0, overflow: 'hidden' },
  slot: {
    position: 'absolute',
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderBottomWidth: 3,
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  slotShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  slotText: { color: '#2A0A14', fontWeight: '900' },
  ball: {
    position: 'absolute',
    elevation: 6,
    shadowColor: '#FF3D9A',
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  ballShine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.75)' },
  floater: { position: 'absolute', width: 100, textAlign: 'center', fontSize: 13, fontWeight: '900' },
  bigWinWrap: { position: 'absolute', top: '22%', alignSelf: 'center', alignItems: 'center' },
  bigWinCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 14, borderRadius: 18, borderWidth: 2, borderColor: '#FFD66B' },
  bigWinTitle: { color: '#FFD66B', fontSize: 15, fontWeight: '900', letterSpacing: 4 },
  bigWinMult: { color: '#FF5FA8', fontSize: 30, fontWeight: '900' },
  bigWinAmount: { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  bigWinClose: {
    marginTop: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A0838',
    borderWidth: 2,
    borderColor: '#FFD66B',
  },
  toast: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: '#6A2BD9',
  },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
  panel: {
    paddingHorizontal: 14,
    paddingTop: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: 'rgba(201,167,255,0.25)',
    gap: 10,
  },
  riskRow: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.3)' },
  riskBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  riskText: { color: '#C9B6EE', fontSize: 15, fontWeight: '700' },
  riskTextActive: { color: '#170826', fontWeight: '900' },
  controlRow: { flexDirection: 'row', gap: 10 },
  stepper: { flex: 1, padding: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(201,167,255,0.2)' },
  stakeBox: { flex: 1.5 },
  stepLabel: { color: '#B9A3E3', fontSize: 12, fontWeight: '600', marginBottom: 5, textAlign: 'center' },
  stepInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3B1A7A' },
  stepValue: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  halfText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  stakeInput: { flex: 1, minWidth: 0, width: 10, color: '#FFFFFF', fontSize: 18, fontWeight: '800', paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(0,0,0,0.3)' },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  autoBtn: {
    width: 86,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B1A7A',
    borderWidth: 1,
    borderColor: 'rgba(201,167,255,0.4)',
  },
  autoBtnActive: { backgroundColor: '#C2185B', borderColor: '#FF5FA8' },
  autoText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', marginTop: 2 },
  betWrap: { flex: 1, borderRadius: 16 },
  betBtn: { height: 60, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#0B4F20' },
  betText: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: 3, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  betSub: { color: '#E9FFE8', fontSize: 11, fontWeight: '700' },
  pressed: { transform: [{ scale: 0.97 }] },
  dim: { opacity: 0.45 },
  autoPicker: { padding: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(201,167,255,0.3)' },
  autoPickerTitle: { color: '#E9D8FF', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  autoPickerRow: { flexDirection: 'row', gap: 8 },
  autoOption: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: '#3B1A7A' },
  autoOptionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 18 },
  rulesCard: { maxHeight: '75%', borderRadius: 20, backgroundColor: '#1A0B3D', borderWidth: 1, borderColor: 'rgba(201,167,255,0.35)', overflow: 'hidden' },
  rulesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,167,255,0.2)',
  },
  rulesTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  rulesClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  rulesBody: { padding: 18, gap: 12 },
  rulesText: { color: '#E1D3FA', fontSize: 14, lineHeight: 21 },
  limitRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.3)' },
  limitLabel: { color: '#C9B6EE', fontSize: 14 },
  limitValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});
