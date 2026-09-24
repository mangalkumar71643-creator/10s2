import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  DragonTigerArea,
  DragonTigerConfig,
  DragonTigerHistoryEntry,
  DragonTigerRoundView,
  PlayingCard,
  cancelDragonTigerBets,
  fetchDragonTigerConfig,
  fetchDragonTigerCurrent,
  fetchDragonTigerHistory,
  fetchDragonTigerMyRound,
  placeDragonTigerBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const W = Dimensions.get('window').width;

const CHIP_VALUES = [10, 20, 50, 100, 200, 500, 1000];
const CHIP_COLORS: Record<number, string> = {
  10: '#1E9E4A',
  20: '#0FA3A3',
  50: '#2563EB',
  100: '#D4A017',
  200: '#E07A1F',
  500: '#C81E3A',
  1000: '#0F766E',
};
const DEFAULT_CHIP = 10;
const FALLBACK_MULTIPLIERS: Record<DragonTigerArea, number> = { DRAGON: 1.95, TIE: 11.7, TIGER: 1.95, SUITED_TIE: 46.8 };

const WIN_CARD_MS = 3000;
const TOAST_MS = 1600;
const BANNER_MS = 1300;
const VS_MS = 2900;
const ROAD_LEN = 24;

const CARD_W = Math.min(64, W * 0.15);
const CARD_H = CARD_W * 1.4;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

function shortAmount(n: number): string {
  if (n >= 1000) return `${round2(n / 1000)}k`;
  return String(round2(n));
}

function chipColorFor(amount: number): string {
  const v = [...CHIP_VALUES].reverse().find((c) => c <= amount) ?? CHIP_VALUES[0];
  return CHIP_COLORS[v];
}

function areaWins(area: DragonTigerArea, winner: string | null, suitedTie: boolean | null): boolean {
  if (!winner) return false;
  if (area === 'SUITED_TIE') return !!suitedTie;
  return area === winner;
}

const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };

// ---------- visual pieces ----------

const Chip = memo(function Chip({ value, size, label }: { value: number; size: number; label?: string }) {
  const color = CHIP_COLORS[value] ?? chipColorFor(value);
  const r = size / 2;
  const ringR = r - size * 0.1;
  const circ = 2 * Math.PI * ringR;
  const text = label ?? (value >= 1000 ? `${value / 1000}K` : String(value));
  const fontSize = size * (text.length > 3 ? 0.22 : 0.27);
  return (
    <Svg width={size} height={size}>
      <Circle cx={r} cy={r} r={r - 0.5} fill={color} stroke="#00000066" strokeWidth={1} />
      <Circle cx={r} cy={r} r={ringR} fill="none" stroke="#FFFFFF" strokeWidth={size * 0.12} strokeDasharray={`${circ / 16} ${circ / 16}`} />
      <Circle cx={r} cy={r} r={size * 0.3} fill="#141414" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.2} />
      <SvgText x={r} y={r + fontSize * 0.36} fontSize={fontSize} fontWeight="bold" fill="#FFFFFF" textAnchor="middle">
        {text}
      </SvgText>
    </Svg>
  );
});

function CardFace({ card, w }: { card: PlayingCard; w: number }) {
  const red = card.suit === 'H' || card.suit === 'D';
  const color = red ? '#D0142C' : '#16161C';
  return (
    <LinearGradient colors={['#FFFFFF', '#ECECF1']} style={[styles.card, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={styles.cardCorner}>
        <Text style={[styles.cardRank, { color, fontSize: w * 0.28 }]}>{RANK_LABEL[card.rank]}</Text>
        <Text style={[styles.cardSuitSmall, { color, fontSize: w * 0.22 }]}>{SUIT_SYMBOL[card.suit]}</Text>
      </View>
      <Text style={[styles.cardSuitBig, { color, fontSize: w * 0.62 }]}>{SUIT_SYMBOL[card.suit]}</Text>
    </LinearGradient>
  );
}

function CardBack({ w }: { w: number }) {
  return (
    <LinearGradient colors={['#6B1F2E', '#3A0B16']} style={[styles.card, styles.cardBack, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={[styles.cardBackInner, { borderRadius: w * 0.07 }]}>
        <View style={[styles.cardBackDiamond, { width: w * 0.38, height: w * 0.38 }]} />
        <Text style={[styles.cardBackMark, { fontSize: w * 0.2 }]}>NP</Text>
      </View>
    </LinearGradient>
  );
}

/** A card that flips from its back to `card` whenever `card` is set. */
function FlipCard({ card, w, delay = 0 }: { card: PlayingCard | null; w: number; delay?: number }) {
  const flip = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState<PlayingCard | null>(card);
  // Keyed on the card's value, not the object: every poll brings a fresh
  // object for the same card, which must not restart the flip.
  const cardKey = card ? `${card.rank}${card.suit}` : null;
  const cardRef = useRef(card);
  cardRef.current = card;
  useEffect(() => {
    if (cardKey) {
      setShown(cardRef.current);
      flip.setValue(0);
      Animated.timing(flip, { toValue: 1, duration: 520, delay, easing: Easing.inOut(Easing.quad), useNativeDriver: true }).start();
    } else {
      flip.setValue(0);
    }
  }, [cardKey, delay, flip]);
  const scaleX = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] });
  const backOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [1, 1, 0, 0] });
  const faceOpacity = flip.interpolate({ inputRange: [0, 0.5, 0.501, 1], outputRange: [0, 0, 1, 1] });
  return (
    <Animated.View style={{ width: w, height: w * 1.4, transform: [{ scaleX }] }}>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: backOpacity }]}>
        <CardBack w={w} />
      </Animated.View>
      {shown && (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: faceOpacity }]}>
          <CardFace card={shown} w={w} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

function Emblem({ side, size }: { side: 'DRAGON' | 'TIGER'; size: number }) {
  const dragon = side === 'DRAGON';
  return (
    <View style={{ alignItems: 'center' }}>
      <LinearGradient
        colors={dragon ? ['#7FB2FF', '#2F5FD0', '#12275E'] : ['#FFB36B', '#E0342F', '#5E0E12']}
        style={[styles.emblem, { width: size, height: size, borderRadius: size / 2, shadowColor: dragon ? '#4C8DFF' : '#FF5A3C' }]}
      >
        <View style={[styles.emblemRing, { width: size - 8, height: size - 8, borderRadius: (size - 8) / 2 }]} />
        <Text style={{ fontSize: size * 0.52 }}>{dragon ? '🐉' : '🐯'}</Text>
      </LinearGradient>
      <Text style={[styles.emblemLabel, { color: dragon ? '#9CC3FF' : '#FFB199' }]}>{side}</Text>
    </View>
  );
}

type AreaState = 'normal' | 'win' | 'lose';

const BetBox = memo(function BetBox({
  area,
  title,
  multiplier,
  colors,
  total,
  state,
  big,
  onPress,
  glow,
}: {
  area: DragonTigerArea;
  title: string;
  multiplier: number;
  colors: [string, string];
  total: number;
  state: AreaState;
  big: boolean;
  onPress: (area: DragonTigerArea) => void;
  glow: Animated.Value;
}) {
  return (
    <Pressable onPress={() => onPress(area)} style={({ pressed }) => [styles.boxOuter, pressed && styles.pressed]}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={[styles.boxFill, state === 'win' && styles.boxWin]}>
        <LinearGradient colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0)']} style={styles.boxShine} pointerEvents="none" />
        <Text style={[styles.boxTitle, big && styles.boxTitleBig]} numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
        <Text style={[styles.boxMult, big && styles.boxMultBig]}>{multiplier}x</Text>
        <Text style={styles.boxMine}>₹{round2(total)}</Text>
        {total > 0 && (
          <View style={big ? styles.boxChipBig : styles.boxChip} pointerEvents="none">
            <Chip value={total} size={big ? 40 : 32} label={shortAmount(total)} />
          </View>
        )}
        {state === 'win' && (
          <Animated.View pointerEvents="none" style={[styles.winOverlay, { opacity: glow }]}>
            <Text style={styles.winText}>WIN</Text>
          </Animated.View>
        )}
        {state === 'lose' && <View pointerEvents="none" style={styles.loseShade} />}
      </LinearGradient>
    </Pressable>
  );
});

// ---------- screen ----------

type PlacedChip = { key: number; area: DragonTigerArea; amount: number; id?: string };

export default function DragonTigerScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<DragonTigerConfig | null>(null);
  const [view, setView] = useState<DragonTigerRoundView | null>(null);
  const [history, setHistory] = useState<DragonTigerHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [selectedChip, setSelectedChip] = useState(DEFAULT_CHIP);
  const [win, setWin] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [vsOpen, setVsOpen] = useState(false);
  const [, setPhaseTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: DragonTigerArea; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const vsAnim = useRef(new Animated.Value(0)).current;
  const vsResult = useRef(new Animated.Value(0)).current;

  const multipliers = config?.multipliers ?? FALLBACK_MULTIPLIERS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const showBanner = useCallback(
    (text: string) => {
      setBanner(text);
      bannerAnim.setValue(0);
      Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => {
        Animated.timing(bannerAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setBanner(null));
      }, BANNER_MS);
    },
    [bannerAnim]
  );

  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
  }, []);

  const syncMyRound = useCallback(() => {
    fetchDragonTigerMyRound()
      .then((res) => {
        if (!mountedRef.current || res.periodNumber !== periodRef.current) return;
        setChips(
          res.bets.map((b) => {
            const key = keyRef.current++;
            idMapRef.current.set(key, b.id);
            return { key, area: b.area, amount: Number(b.amount), id: b.id };
          })
        );
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchDragonTigerConfig()
      .then(setConfig)
      .catch(() => {});
    fetchDragonTigerHistory(100)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
    };
  }, []);

  // Round polling: chained so slow responses never overlap, and quicker
  // right around betting close / reveal / next round.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;
    let first = true;
    const loop = async () => {
      let delay = 800;
      try {
        const sentAt = Date.now();
        const v = await fetchDragonTigerCurrent();
        const receivedAt = Date.now();
        if (!alive) return;
        const measured = new Date(v.serverTime).getTime() - (sentAt + receivedAt) / 2;
        offsetRef.current = first ? measured : offsetRef.current * 0.7 + measured * 0.3;
        setView(v);
        const srvNow = Date.now() + offsetRef.current;
        const nextEdge = Math.min(
          ...[v.betEndTime, v.resultTime, v.endTime].map((t) => new Date(t).getTime()).filter((t) => t > srvNow)
        );
        if (Number.isFinite(nextEdge) && nextEdge - srvNow < 1200) delay = 250;
        if (first) {
          first = false;
          periodRef.current = v.periodNumber;
          syncMyRound();
        }
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
  }, [syncMyRound]);

  // New round: last round's chips become the REPEAT set.
  useEffect(() => {
    if (!view) return;
    if (periodRef.current !== null && periodRef.current !== view.periodNumber) {
      const placed = chipsRef.current.filter((c) => c.id);
      if (placed.length > 0) lastRoundRef.current = placed.map((c) => ({ area: c.area, amount: c.amount }));
      setChips([]);
      idMapRef.current.clear();
      setVsOpen(false);
      showBanner('Start Betting');
    }
    periodRef.current = view.periodNumber;
  }, [view, showBanner]);

  // Re-render exactly when betting closes / the cards are due.
  useEffect(() => {
    if (!view) return;
    const srvNow = Date.now() + offsetRef.current;
    const betWait = new Date(view.betEndTime).getTime() - srvNow;
    const resWait = new Date(view.resultTime).getTime() - srvNow;
    const ids: ReturnType<typeof setTimeout>[] = [];
    if (betWait > 0)
      ids.push(
        setTimeout(() => {
          setPhaseTick((x) => x + 1);
          showBanner('Stop Betting');
        }, betWait + 20)
      );
    if (resWait > 0) ids.push(setTimeout(() => setPhaseTick((x) => x + 1), resWait + 20));
    return () => ids.forEach(clearTimeout);
  }, [view, showBanner]);

  const srvNow = Date.now() + offsetRef.current;
  const betEndMs = view ? new Date(view.betEndTime).getTime() : 0;
  const bettingOpen = !!view && srvNow < betEndMs;
  const phase: 'BETTING' | 'DEALING' | 'RESULT' = !view
    ? 'BETTING'
    : bettingOpen
      ? 'BETTING'
      : view.phase === 'RESULT' && view.dragon
        ? 'RESULT'
        : 'DEALING';
  const revealed = phase === 'RESULT' && view?.dragon && view?.tiger ? view : null;
  // The board only lights up once the VS reveal has finished.
  const boardResult = revealed && !vsOpen ? revealed : null;

  // Reveal: VS scene, road update, then this player's winnings.
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || !view.dragon || !view.tiger || resultHandledRef.current === view.periodNumber) return;
    const period = view.periodNumber;
    resultHandledRef.current = period;
    setVsOpen(true);
    vsAnim.setValue(0);
    vsResult.setValue(0);
    Animated.timing(vsAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    Animated.timing(vsResult, { toValue: 1, duration: 400, delay: 1500, useNativeDriver: true }).start();
    const closeTimer = setTimeout(() => {
      Animated.timing(vsAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => mountedRef.current && setVsOpen(false));
    }, VS_MS);
    const entry: DragonTigerHistoryEntry = {
      periodNumber: period,
      dragon: view.dragon,
      tiger: view.tiger,
      winner: view.winner!,
      suitedTie: !!view.suitedTie,
    };
    setHistory((h) => (h[0]?.periodNumber === period ? h : [entry, ...h].slice(0, 100)));
    if (chipsRef.current.length > 0) {
      enqueue(async () => {
        try {
          const res = await fetchDragonTigerMyRound(period);
          const won = round2(res.bets.reduce((sum, b) => sum + Number(b.payout), 0));
          if (won > 0) setTimeout(() => mountedRef.current && setWin(won), VS_MS + 700);
        } catch {
          // Winnings still land in the wallet; only the card is skipped.
        }
        refreshWallet();
      });
    }
    return () => clearTimeout(closeTimer);
  }, [view, enqueue, refreshWallet, vsAnim, vsResult]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  useEffect(() => {
    if (!boardResult) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 450, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.45, duration: 450, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [boardResult, glow]);

  const areaTotals = useMemo(() => {
    const m: Partial<Record<DragonTigerArea, number>> = {};
    for (const c of chips) m[c.area] = round2((m[c.area] ?? 0) + c.amount);
    return m;
  }, [chips]);
  const myTotal = useMemo(() => round2(chips.reduce((s, c) => s + c.amount, 0)), [chips]);
  const unconfirmed = useMemo(() => round2(chips.filter((c) => !c.id).reduce((s, c) => s + c.amount, 0)), [chips]);
  const displayBalance = Math.max(0, round2(coins - unconfirmed));

  const bettingOpenRef = useRef(bettingOpen);
  bettingOpenRef.current = bettingOpen;
  const displayBalanceRef = useRef(displayBalance);
  displayBalanceRef.current = displayBalance;
  const areaTotalsRef = useRef(areaTotals);
  areaTotalsRef.current = areaTotals;
  const maxStakeRef = useRef(maxStake);
  maxStakeRef.current = maxStake;
  const selectedChipRef = useRef(selectedChip);
  selectedChipRef.current = selectedChip;

  const placeChips = useCallback(
    (entries: { area: DragonTigerArea; amount: number }[]) => {
      if (entries.length === 0) return;
      if (!bettingOpenRef.current) return showToast('Betting closed — wait for the next round');
      const cost = round2(entries.reduce((s, e) => s + e.amount, 0));
      if (cost > displayBalanceRef.current) return showToast('Insufficient balance');
      const totals = { ...areaTotalsRef.current };
      for (const e of entries) {
        totals[e.area] = round2((totals[e.area] ?? 0) + e.amount);
        if ((totals[e.area] ?? 0) > maxStakeRef.current) return showToast(`Max bet per box is ₹${maxStakeRef.current}`);
      }
      const added: PlacedChip[] = entries.map((e) => ({ key: keyRef.current++, area: e.area, amount: e.amount }));
      const keys = new Set(added.map((c) => c.key));
      setChips((prev) => [...prev, ...added]);
      enqueue(async () => {
        try {
          const res = await placeDragonTigerBets(entries);
          res.bets.forEach((b, i) => idMapRef.current.set(added[i].key, b.id));
          if (mountedRef.current) {
            setChips((prev) => prev.map((c) => (keys.has(c.key) ? { ...c, id: idMapRef.current.get(c.key) } : c)));
          }
          refreshWallet();
        } catch (err) {
          if (mountedRef.current) {
            setChips((prev) => prev.filter((c) => !keys.has(c.key)));
            showToast(errorMessage(err));
          }
        }
      });
    },
    [enqueue, refreshWallet, showToast]
  );

  const onAreaPress = useCallback((area: DragonTigerArea) => placeChips([{ area, amount: selectedChipRef.current }]), [placeChips]);

  const cancel = (betIds?: string[]) =>
    enqueue(async () => {
      try {
        await cancelDragonTigerBets(betIds);
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });

  const undo = () => {
    const last = chips[chips.length - 1];
    if (!last) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips((prev) => prev.slice(0, -1));
    enqueue(async () => {
      const id = idMapRef.current.get(last.key);
      if (id) await cancelDragonTigerBets([id]).then(() => refreshWallet(), (err) => {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      });
    });
  };

  const clearAll = () => {
    if (chips.length === 0) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips([]);
    cancel();
  };

  const repeat = () => {
    if (lastRoundRef.current.length === 0) return showToast('No bets from the last round');
    const m = new Map<DragonTigerArea, number>();
    for (const c of lastRoundRef.current) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    placeChips([...m.entries()].map(([area, amount]) => ({ area, amount })));
  };

  const road = history.slice(0, ROAD_LEN).reverse();
  const stats = useMemo(() => {
    const n = history.length;
    if (!n) return null;
    const d = history.filter((h) => h.winner === 'DRAGON').length;
    const t = history.filter((h) => h.winner === 'TIGER').length;
    return { d: Math.round((d / n) * 100), t: Math.round((t / n) * 100), tie: Math.round(((n - d - t) / n) * 100) };
  }, [history]);

  const areaState = (area: DragonTigerArea): AreaState =>
    !boardResult ? 'normal' : areaWins(area, boardResult.winner, boardResult.suitedTie) ? 'win' : 'lose';

  const secsLeft = Math.max(0, Math.ceil((betEndMs - srvNow) / 1000));
  const statusText = phase === 'BETTING' ? 'PLACE YOUR BETS' : phase === 'DEALING' ? 'DEALING' : boardResult ? `${boardResult.winner} WINS` : 'REVEAL';

  // Tick the countdown once a second during betting.
  useEffect(() => {
    if (phase !== 'BETTING') return;
    const id = setInterval(() => setPhaseTick((x) => x + 1), 500);
    return () => clearInterval(id);
  }, [phase]);

  const bannerScale = bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
  const vsScale = vsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });
  const winnerSide = revealed?.winner;
  const sideStyle = (side: 'DRAGON' | 'TIGER') => ({
    opacity:
      winnerSide === 'TIE' || winnerSide === side
        ? 1
        : vsResult.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] }),
    transform: [
      {
        scale:
          winnerSide === side || winnerSide === 'TIE'
            ? vsResult.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] })
            : vsResult.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }),
      },
    ],
  });

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#4A1119', '#2A070C']} style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={30} color="#F5B942" />
          <Text style={styles.title}>DRAGON TIGER</Text>
        </Pressable>
        <Pressable onPress={() => navigation.navigate('Deposit')} style={styles.depositPill}>
          <MaterialCommunityIcons name="wallet-plus" size={20} color="#F5B942" />
          <Text style={styles.depositText}>Deposit</Text>
        </Pressable>
      </LinearGradient>

      <LinearGradient colors={['#2B0A2E', '#1A0620']} style={styles.stage}>
        <View style={styles.stageSide}>
          <Emblem side="DRAGON" size={58} />
          <FlipCard card={revealed?.dragon ?? null} w={CARD_W} />
        </View>
        <View style={styles.stageCenter}>
          {phase === 'BETTING' ? (
            <LinearGradient colors={['#FFE08A', '#D99A1E']} style={styles.clock}>
              <View style={styles.clockInner}>
                <Text style={[styles.clockText, secsLeft <= 3 && styles.clockUrgent]}>{secsLeft}</Text>
              </View>
            </LinearGradient>
          ) : (
            <Text style={styles.vsSmall}>VS</Text>
          )}
          <Text style={styles.stageStatus} numberOfLines={2}>
            {statusText}
          </Text>
        </View>
        <View style={styles.stageSide}>
          <FlipCard card={revealed?.tiger ?? null} w={CARD_W} />
          <Emblem side="TIGER" size={58} />
        </View>
      </LinearGradient>

      <View style={styles.roadWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.road}>
          {road.map((h, i) => {
            const latest = i === road.length - 1;
            const bg = h.winner === 'DRAGON' ? '#2F6BE0' : h.winner === 'TIGER' ? '#D93A4A' : '#23A05A';
            return (
              <View key={h.periodNumber} style={[styles.roadDot, { backgroundColor: bg }, latest && styles.roadLatest]}>
                <Text style={styles.roadText}>{h.winner === 'DRAGON' ? 'D' : h.winner === 'TIGER' ? 'T' : '='}</Text>
              </View>
            );
          })}
        </ScrollView>
        {stats && (
          <Text style={styles.roadStats}>
            <Text style={{ color: '#8FB6FF' }}>D {stats.d}%</Text> <Text style={{ color: '#FF9AA4' }}>T {stats.t}%</Text>{' '}
            <Text style={{ color: '#7EE2A3' }}>= {stats.tie}%</Text>
          </Text>
        )}
      </View>

      <LinearGradient colors={['#5B1F6E', '#3A0F4A']} style={styles.table}>
        <View style={styles.bigRow}>
          <BetBox area="DRAGON" title="DRAGON" multiplier={multipliers.DRAGON} colors={['#3569DA', '#172C74']} total={areaTotals.DRAGON ?? 0} state={areaState('DRAGON')} big onPress={onAreaPress} glow={glow} />
          <BetBox area="TIGER" title="TIGER" multiplier={multipliers.TIGER} colors={['#D93A48', '#6E0F1E']} total={areaTotals.TIGER ?? 0} state={areaState('TIGER')} big onPress={onAreaPress} glow={glow} />
        </View>
        <View style={styles.smallRow}>
          <BetBox area="TIE" title="TIE" multiplier={multipliers.TIE} colors={['#159C8C', '#0A4E48']} total={areaTotals.TIE ?? 0} state={areaState('TIE')} big={false} onPress={onAreaPress} glow={glow} />
          <BetBox area="SUITED_TIE" title="SUITED TIE" multiplier={multipliers.SUITED_TIE} colors={['#43A83E', '#1B5519']} total={areaTotals.SUITED_TIE ?? 0} state={areaState('SUITED_TIE')} big={false} onPress={onAreaPress} glow={glow} />
        </View>
        <Text style={styles.tableNote}>Higher card wins · A is low · Dragon & Tiger bets lose on a tie</Text>
      </LinearGradient>

      <View style={styles.chipRail}>
        {CHIP_VALUES.map((v) => {
          const allowed = v >= minStake && v <= maxStake;
          const active = v === selectedChip;
          return (
            <Pressable key={v} disabled={!allowed} onPress={() => setSelectedChip(v)} style={[styles.chipBtn, active && styles.chipActive, !allowed && styles.dim]}>
              <Chip value={v} size={42} />
            </Pressable>
          );
        })}
      </View>

      <LinearGradient colors={['#2A0A2E', '#14041A']} style={[styles.controls, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.balanceCol}>
          <Text style={styles.balanceLabel}>Balance</Text>
          <Text style={styles.balanceValue}>₹{displayBalance.toFixed(2)}</Text>
          <Text style={styles.balanceLabel}>
            Your bet <Text style={styles.betValue}>₹{myTotal.toFixed(2)}</Text>
          </Text>
        </View>
        <Pressable onPress={undo} style={styles.ctrlBtn}>
          <MaterialCommunityIcons name="undo-variant" size={22} color="#F2E6FF" />
          <Text style={styles.ctrlLabel}>UNDO</Text>
        </Pressable>
        <Pressable onPress={repeat} style={styles.ctrlBtn}>
          <MaterialCommunityIcons name="repeat" size={22} color="#F2E6FF" />
          <Text style={styles.ctrlLabel}>REPEAT</Text>
        </Pressable>
        <Pressable onPress={clearAll} style={styles.ctrlBtn}>
          <MaterialCommunityIcons name="close-thick" size={22} color="#FF6B6B" />
          <Text style={styles.ctrlLabel}>CLEAR</Text>
        </Pressable>
      </LinearGradient>

      {banner && (
        <Animated.View pointerEvents="none" style={[styles.bannerWrap, { opacity: bannerAnim, transform: [{ scale: bannerScale }] }]}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(20,4,26,0.85)', 'rgba(0,0,0,0)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.banner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {vsOpen && revealed && (
        <Animated.View style={[styles.vsOverlay, { opacity: vsAnim }]}>
          <Animated.View style={[styles.vsRow, { transform: [{ scale: vsScale }] }]}>
            <Animated.View style={[styles.vsSide, sideStyle('DRAGON')]}>
              <Emblem side="DRAGON" size={110} />
              <FlipCard card={revealed.dragon} w={CARD_W * 1.35} delay={300} />
            </Animated.View>
            <LinearGradient colors={['#FFE9A8', '#C98A1C']} style={styles.vsBadge}>
              <Text style={styles.vsText}>VS</Text>
            </LinearGradient>
            <Animated.View style={[styles.vsSide, sideStyle('TIGER')]}>
              <Emblem side="TIGER" size={110} />
              <FlipCard card={revealed.tiger} w={CARD_W * 1.35} delay={850} />
            </Animated.View>
          </Animated.View>
          <Animated.Text style={[styles.vsResult, { opacity: vsResult }]}>
            {revealed.winner === 'TIE' ? (revealed.suitedTie ? 'SUITED TIE!' : 'TIE!') : `${revealed.winner} WINS`}
          </Animated.Text>
        </Animated.View>
      )}

      {win !== null && (
        <View style={styles.winWrap}>
          <LinearGradient colors={['#3B1A06', '#1C0B02']} style={styles.winCard}>
            <Text style={styles.winTitle}>YOU WIN</Text>
            <Text style={styles.winAmount}>₹{win.toFixed(2)}</Text>
          </LinearGradient>
          <Pressable onPress={() => setWin(null)} style={styles.winClose} hitSlop={10}>
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
  );
}

const GOLD = '#FFD66B';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14041A' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: '#7A2A33',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#E7D9D2', fontSize: 19, fontWeight: '900', letterSpacing: 1.5, marginLeft: 2 },
  depositPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#3A0A10',
    borderWidth: 1.5,
    borderColor: '#8A2E38',
  },
  depositText: { color: '#F5B942', fontSize: 15, fontWeight: '700' },

  stage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 14 },
  stageSide: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stageCenter: { alignItems: 'center', gap: 6, flex: 1 },
  clock: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  clockInner: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: '#3A1206' },
  clockText: { color: GOLD, fontSize: 24, fontWeight: '900' },
  clockUrgent: { color: '#FF5A4E' },
  vsSmall: { color: GOLD, fontSize: 30, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#C98A1C', textShadowRadius: 8 },
  stageStatus: { color: '#E9D8FF', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textAlign: 'center' },
  emblem: { alignItems: 'center', justifyContent: 'center', elevation: 10, shadowOpacity: 0.9, shadowRadius: 14, shadowOffset: { width: 0, height: 0 } },
  emblemRing: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)' },
  emblemLabel: { marginTop: 4, fontSize: 12, fontWeight: '900', letterSpacing: 2 },

  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9C9D2', overflow: 'hidden' },
  cardCorner: { position: 'absolute', top: 3, left: 5, alignItems: 'center' },
  cardRank: { fontWeight: '900', lineHeight: undefined },
  cardSuitSmall: { marginTop: -3 },
  cardSuitBig: { marginTop: 8 },
  cardBack: { borderColor: '#D9A441', borderWidth: 2 },
  cardBackInner: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
    bottom: 4,
    borderWidth: 1,
    borderColor: 'rgba(217,164,65,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBackDiamond: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(217,164,65,0.7)', transform: [{ rotate: '45deg' }] },
  cardBackMark: { color: '#D9A441', fontWeight: '900' },

  roadWrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#1F0826', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#5A2468', gap: 8 },
  road: { gap: 4, alignItems: 'center' },
  roadDot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  roadLatest: { borderWidth: 2, borderColor: GOLD },
  roadText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  roadStats: { fontSize: 11, fontWeight: '800' },

  table: { flex: 1, marginHorizontal: 8, marginTop: 8, padding: 8, borderRadius: 18, borderWidth: 1.5, borderColor: '#B0468F', gap: 6 },
  bigRow: { flexDirection: 'row', gap: 6, flex: 1.6 },
  smallRow: { flexDirection: 'row', gap: 6, flex: 1 },
  tableNote: { color: 'rgba(255,220,255,0.6)', fontSize: 10, textAlign: 'center' },
  boxOuter: { flex: 1 },
  pressed: { transform: [{ scale: 0.97 }] },
  boxFill: { flex: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' },
  boxWin: { borderColor: GOLD, borderWidth: 3 },
  boxShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
  boxTitle: { color: 'rgba(255,255,255,0.92)', fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
  boxTitleBig: { fontSize: 22, letterSpacing: 3 },
  boxMult: { color: GOLD, fontSize: 18, fontWeight: '900', marginTop: 2 },
  boxMultBig: { fontSize: 26 },
  boxMine: { position: 'absolute', bottom: 6, left: 10, color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '700' },
  boxChip: { position: 'absolute', right: 6, top: 6 },
  boxChipBig: { position: 'absolute', right: 8, bottom: 8 },
  winOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,214,107,0.18)' },
  winText: { color: GOLD, fontSize: 30, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#7A4A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  loseShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },

  chipRail: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 6, paddingTop: 12, paddingBottom: 6 },
  chipBtn: { borderRadius: 24, padding: 2 },
  chipActive: { backgroundColor: GOLD, transform: [{ translateY: -6 }], elevation: 8, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  dim: { opacity: 0.35 },

  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#5A2468' },
  balanceCol: { flex: 1 },
  balanceLabel: { color: '#C9B6EE', fontSize: 12 },
  balanceValue: { color: GOLD, fontSize: 18, fontWeight: '900' },
  betValue: { color: '#FFFFFF', fontWeight: '800' },
  ctrlBtn: {
    width: 62,
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3A1648',
    borderWidth: 1.5,
    borderColor: '#7A3A8E',
  },
  ctrlLabel: { color: '#F2E6FF', fontSize: 10, fontWeight: '800', marginTop: 2 },

  bannerWrap: { position: 'absolute', top: '32%', left: 0, right: 0, alignItems: 'center' },
  banner: { width: '100%', paddingVertical: 14, alignItems: 'center' },
  bannerText: {
    color: GOLD,
    fontSize: 40,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 1,
    textShadowColor: '#7A3A00',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 3 },
  },

  vsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,2,12,0.88)', alignItems: 'center', justifyContent: 'center' },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%' },
  vsSide: { alignItems: 'center', gap: 14 },
  vsBadge: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', elevation: 12, shadowColor: GOLD, shadowOpacity: 1, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  vsText: { color: '#3A1E00', fontSize: 30, fontWeight: '900', fontStyle: 'italic' },
  vsResult: { marginTop: 28, color: GOLD, fontSize: 30, fontWeight: '900', letterSpacing: 2, textShadowColor: '#7A3A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },

  winWrap: { position: 'absolute', top: '30%', alignSelf: 'center', alignItems: 'center' },
  winCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 14, borderRadius: 16, borderWidth: 2, borderColor: '#F5B942' },
  winTitle: { color: '#FFE08A', fontSize: 16, fontWeight: '900', letterSpacing: 3 },
  winAmount: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 2 },
  winClose: {
    marginTop: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1C0B02',
    borderWidth: 2,
    borderColor: '#F5B942',
  },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    top: '46%',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderWidth: 1,
    borderColor: '#B7791F',
  },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
