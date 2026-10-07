import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { FruitMachineConfig, FruitOutcome, FruitSpinRow, FruitSymbol, fetchFruitMachineConfig, fetchFruitMachineHistory, spinFruitMachine } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD166';
const GOLD_DEEP = '#B8860B';
const CHROME = '#E6E9F0';
const CABINET = '#5A0A14';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** UK rule: a spin may not resolve faster than this, start to result. */
const MIN_SPIN_MS = 2500;
const LINE_COLORS = ['#FF3B4E', '#FFD23F', '#2FE07A', '#22B8FF', '#FF7AE0'];

const FALLBACK_STRIPS: FruitSymbol[][] = [
  ['SEVEN', 'CHERRY', 'GRAPES', 'STAR', 'ORANGE', 'LEMON', 'MELON', 'LEMON', 'CHERRY', 'PLUM', 'LEMON', 'PLUM', 'MELON', 'BELL', 'MELON', 'ORANGE', 'BELL', 'BAR', 'LEMON', 'PLUM', 'BAR', 'GRAPES', 'ORANGE', 'CHERRY', 'PLUM', 'CHERRY', 'STAR', 'GRAPES', 'ORANGE', 'LEMON', 'ORANGE'],
  ['MELON', 'LEMON', 'ORANGE', 'BELL', 'GRAPES', 'STAR', 'ORANGE', 'BELL', 'GRAPES', 'LEMON', 'ORANGE', 'PLUM', 'LEMON', 'PLUM', 'MELON', 'CHERRY', 'ORANGE', 'SEVEN', 'BAR', 'PLUM', 'STAR', 'BAR', 'CHERRY', 'PLUM', 'MELON', 'LEMON', 'GRAPES', 'ORANGE', 'CHERRY', 'LEMON'],
  ['LEMON', 'BAR', 'MELON', 'BELL', 'MELON', 'GRAPES', 'MELON', 'LEMON', 'ORANGE', 'STAR', 'LEMON', 'PLUM', 'LEMON', 'SEVEN', 'GRAPES', 'ORANGE', 'CHERRY', 'BELL', 'CHERRY', 'STAR', 'PLUM', 'ORANGE', 'CHERRY', 'BAR', 'LEMON', 'PLUM', 'ORANGE', 'GRAPES', 'ORANGE', 'PLUM'],
];
const FALLBACK_LINES = [
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
];
const FALLBACK_PAYS: Partial<Record<FruitSymbol, number>> = { SEVEN: 500, BAR: 200, BELL: 100, MELON: 50, GRAPES: 40, PLUM: 30, ORANGE: 20, LEMON: 15, CHERRY: 10 };
const FALLBACK_LADDER = [2, 5, 10, 20, 50, 100, 250];
const PAY_ORDER: FruitSymbol[] = ['SEVEN', 'BAR', 'BELL', 'MELON', 'GRAPES', 'PLUM', 'ORANGE', 'LEMON', 'CHERRY'];
const FILLER: FruitSymbol[] = ['CHERRY', 'LEMON', 'ORANGE', 'PLUM', 'GRAPES', 'MELON', 'BELL', 'BAR', 'SEVEN', 'STAR'];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wrap = (len: number, i: number) => ((i % len) + len) % len;

/** The three visible symbols (top, middle, bottom) on each reel; the stop is the middle row. */
function windowFor(strips: FruitSymbol[][], stops: number[]): FruitSymbol[][] {
  return stops.map((stop, r) => [-1, 0, 1].map((d) => strips[r][wrap(strips[r].length, stop + d)]));
}

// ---------- symbol art ----------
// Every symbol is drawn on a 100 x 100 canvas.

export const FruitArt = memo(function FruitArt({ s, size, dim }: { s: FruitSymbol; size: number; dim?: boolean }) {
  // Ids must be unique per drawing: a gradient defined in a hidden screen doesn't paint on web.
  const u = `fa${s}${useId().replace(/:/g, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={dim ? 0.35 : 1}>
      <Defs>
        <RadialGradient id={`${u}r`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FF9AA0" />
          <Stop offset="0.35" stopColor="#E8132B" />
          <Stop offset="1" stopColor="#7A0010" />
        </RadialGradient>
        <RadialGradient id={`${u}y`} cx="35%" cy="30%" r="80%">
          <Stop offset="0" stopColor="#FFFBC2" />
          <Stop offset="0.45" stopColor="#FFE11A" />
          <Stop offset="1" stopColor="#C99A00" />
        </RadialGradient>
        <RadialGradient id={`${u}o`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#FFD7A0" />
          <Stop offset="0.45" stopColor="#FF8A00" />
          <Stop offset="1" stopColor="#B04A00" />
        </RadialGradient>
        <RadialGradient id={`${u}p`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#E7A3FF" />
          <Stop offset="0.45" stopColor="#8E1F9E" />
          <Stop offset="1" stopColor="#3D0A4A" />
        </RadialGradient>
        <RadialGradient id={`${u}g`} cx="35%" cy="30%" r="75%">
          <Stop offset="0" stopColor="#C9F7A0" />
          <Stop offset="0.5" stopColor="#58B82A" />
          <Stop offset="1" stopColor="#225A0C" />
        </RadialGradient>
        <SvgLinearGradient id={`${u}gold`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF4B8" />
          <Stop offset="0.45" stopColor="#FFC93C" />
          <Stop offset="1" stopColor="#B07A00" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}leaf`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#8FE36B" />
          <Stop offset="1" stopColor="#1E7A1E" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}bar`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#3A3A44" />
          <Stop offset="1" stopColor="#0B0B10" />
        </SvgLinearGradient>
      </Defs>
      {s === 'CHERRY' && (
        <G>
          <Path d="M36 62 C 40 40, 52 22, 66 12" stroke="#5B3A12" strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <Path d="M66 64 C 66 44, 66 26, 66 12" stroke="#5B3A12" strokeWidth={3.5} fill="none" strokeLinecap="round" />
          <Path d="M66 12 C 78 4, 92 10, 92 20 C 80 24, 70 20, 66 12 Z" fill={`url(#${u}leaf)`} />
          <Circle cx={34} cy={70} r={19} fill={`url(#${u}r)`} />
          <Circle cx={66} cy={72} r={19} fill={`url(#${u}r)`} />
          <Ellipse cx={28} cy={63} rx={5} ry={7} fill="#FFFFFF" opacity={0.7} />
          <Ellipse cx={60} cy={65} rx={5} ry={7} fill="#FFFFFF" opacity={0.7} />
        </G>
      )}
      {s === 'LEMON' && (
        <G>
          <G transform="rotate(-22 50 54)">
            <Ellipse cx={14} cy={54} rx={7} ry={5} fill="#E6C200" />
            <Ellipse cx={86} cy={54} rx={7} ry={5} fill="#E6C200" />
            <Ellipse cx={50} cy={54} rx={38} ry={27} fill={`url(#${u}y)`} />
            <Ellipse cx={38} cy={44} rx={12} ry={6} fill="#FFFFFF" opacity={0.6} />
          </G>
          <Path d="M58 28 C 66 16, 82 16, 86 22 C 76 30, 64 30, 58 28 Z" fill={`url(#${u}leaf)`} />
        </G>
      )}
      {s === 'ORANGE' && (
        <G>
          <Circle cx={50} cy={56} r={34} fill={`url(#${u}o)`} />
          {[
            [36, 48], [46, 64], [60, 52], [64, 70], [40, 76], [54, 40], [30, 62],
          ].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={1.6} fill="#B04A00" opacity={0.45} />
          ))}
          <Ellipse cx={38} cy={42} rx={9} ry={6} fill="#FFFFFF" opacity={0.55} />
          <Rect x={48} y={18} width={4} height={8} rx={2} fill="#5B3A12" />
          <Path d="M52 22 C 60 10, 78 10, 82 16 C 72 26, 60 26, 52 22 Z" fill={`url(#${u}leaf)`} />
        </G>
      )}
      {s === 'PLUM' && (
        <G>
          <Ellipse cx={50} cy={58} rx={30} ry={34} fill={`url(#${u}p)`} />
          <Path d="M50 26 C 44 44, 44 72, 50 92" stroke="#2A0633" strokeWidth={2} fill="none" opacity={0.6} />
          <Ellipse cx={38} cy={44} rx={7} ry={11} fill="#FFFFFF" opacity={0.45} />
          <Path d="M50 26 L 52 14" stroke="#5B3A12" strokeWidth={3} strokeLinecap="round" />
          <Path d="M52 18 C 62 8, 76 10, 78 16 C 68 22, 58 22, 52 18 Z" fill={`url(#${u}leaf)`} />
        </G>
      )}
      {s === 'GRAPES' && (
        <G>
          <Path d="M50 22 L 50 12" stroke="#5B3A12" strokeWidth={3} strokeLinecap="round" />
          <Path d="M50 16 C 36 4, 18 8, 16 16 C 28 24, 42 22, 50 16 Z" fill={`url(#${u}leaf)`} />
          {[
            [34, 32], [50, 30], [66, 32], [26, 46], [42, 46], [58, 46], [74, 46], [34, 60], [50, 60], [66, 60], [42, 74], [58, 74], [50, 87],
          ].map(([x, y], i) => (
            <G key={i}>
              <Circle cx={x} cy={y} r={9.5} fill={`url(#${u}g)`} />
              <Circle cx={x - 3} cy={y - 3} r={2.4} fill="#FFFFFF" opacity={0.65} />
            </G>
          ))}
        </G>
      )}
      {s === 'MELON' && (
        <G>
          <Path d="M8 40 A 42 42 0 0 0 92 40 Z" fill="#1E8A2E" />
          <Path d="M13 40 A 37 37 0 0 0 87 40 Z" fill="#E8F7C8" />
          <Path d="M17 40 A 33 33 0 0 0 83 40 Z" fill="#FF3B4E" />
          <Rect x={8} y={36} width={84} height={5} rx={2} fill="#FF6B78" />
          {[
            [32, 52], [44, 62], [56, 62], [68, 52], [50, 50], [38, 50], [62, 50],
          ].map(([x, y], i) => (
            <Ellipse key={i} cx={x} cy={y} rx={2} ry={3.2} fill="#1A1A1A" />
          ))}
          <Path d="M22 50 A 30 30 0 0 0 40 68" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={3} fill="none" />
        </G>
      )}
      {s === 'BELL' && (
        <G>
          <Path d="M50 14 C 30 14, 24 34, 24 52 C 24 62, 18 68, 12 74 L 88 74 C 82 68, 76 62, 76 52 C 76 34, 70 14, 50 14 Z" fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={2} />
          <Rect x={10} y={72} width={80} height={8} rx={4} fill={GOLD_DEEP} />
          <Circle cx={50} cy={86} r={7} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
          <Circle cx={50} cy={12} r={5} fill={GOLD_DEEP} />
          <Path d="M36 28 C 32 38, 31 50, 32 62" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={4} strokeLinecap="round" fill="none" />
        </G>
      )}
      {s === 'BAR' && (
        <G>
          <Rect x={6} y={30} width={88} height={40} rx={8} fill={`url(#${u}bar)`} stroke={GOLD} strokeWidth={3} />
          <Rect x={11} y={35} width={78} height={30} rx={5} fill="none" stroke={GOLD} strokeOpacity={0.4} strokeWidth={1} />
          <SvgText x={50} y={61} fontSize={28} fontWeight="900" fill="#FFFFFF" stroke={GOLD} strokeWidth={1} textAnchor="middle" letterSpacing={2}>
            BAR
          </SvgText>
        </G>
      )}
      {s === 'SEVEN' && (
        <G>
          <Path d="M20 16 L 82 16 L 82 28 C 64 46, 54 66, 50 90 L 30 90 C 34 66, 46 46, 62 30 L 20 30 Z" fill={GOLD_DEEP} transform="translate(2 2)" />
          <Path d="M20 16 L 82 16 L 82 28 C 64 46, 54 66, 50 90 L 30 90 C 34 66, 46 46, 62 30 L 20 30 Z" fill={`url(#${u}r)`} stroke={GOLD} strokeWidth={3} strokeLinejoin="round" />
          <Path d="M26 20 L 76 20" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round" />
        </G>
      )}
      {s === 'STAR' && (
        <G>
          <Circle cx={50} cy={52} r={44} fill={GOLD} opacity={0.18} />
          <Polygon points="50,8 61,38 93,38 67,57 77,88 50,69 23,88 33,57 7,38 39,38" fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={2.5} strokeLinejoin="round" />
          <Polygon points="50,24 56,40 73,40 59,50 64,66 50,56 36,66 41,50 27,40 44,40" fill="#FFF8D6" opacity={0.55} />
        </G>
      )}
    </Svg>
  );
});

// ---------- reels ----------

type ReelHandle = {
  /** Starts spinning from whatever is showing. */
  start: () => void;
  /** Lands on `rows` (top to bottom) after `delay` ms. */
  land: (rows: FruitSymbol[], delay: number) => Promise<void>;
  /** Drops the reel one position, bringing `top` in above the current rows. */
  nudge: (top: FruitSymbol) => Promise<void>;
  /** Snaps straight to `rows` with no animation. */
  set: (rows: FruitSymbol[]) => void;
};

const LOOP_CELLS = 18;
const LAND_CELLS = 10;

const Reel = forwardRef(function Reel({ initial, cell, width, dimmed }: { initial: FruitSymbol[]; cell: number; width: number; dimmed: boolean[] }, ref: React.Ref<ReelHandle>) {
  const [content, setContent] = useState<FruitSymbol[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land' | 'nudge'; resolve: () => void; rows: FruitSymbol[] }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      loopRef.current?.stop();
    },
    []
  );

  // Content and offset change together, before paint, so nothing jumps.
  useLayoutEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    if (p.kind === 'loop') {
      // [showing, random…, showing]: both ends look the same, so the loop wraps without a visible jump.
      y.setValue(-(content.length - 3) * cell);
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: 520, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    const from = -(content.length - 3) * cell;
    y.setValue(from);
    const anim =
      p.kind === 'land'
        ? Animated.timing(y, { toValue: 0, duration: 480, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true })
        : Animated.timing(y, { toValue: 0, duration: 380, easing: Easing.out(Easing.back(2)), useNativeDriver: true });
    anim.start(() => {
      y.setValue(0);
      pending.current = null;
      setContent(p.rows);
      p.resolve();
    });
  }, [content, cell, y]);

  useImperativeHandle(ref, () => ({
    start: () => {
      loopRef.current?.stop();
      const showing = contentRef.current.slice(0, 3);
      pending.current = { kind: 'loop' };
      setContent([...showing, ...Array.from({ length: LOOP_CELLS }, filler), ...showing]);
    },
    land: (rows, delay) =>
      new Promise<void>((resolve) => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          loopRef.current?.stop();
          loopRef.current = null;
          pending.current = { kind: 'land', resolve, rows };
          setContent([...rows, ...Array.from({ length: LAND_CELLS }, filler)]);
        }, delay);
      }),
    nudge: (top) =>
      new Promise<void>((resolve) => {
        const showing = contentRef.current.slice(0, 3);
        const rows = [top, showing[0], showing[1]];
        pending.current = { kind: 'nudge', resolve, rows };
        setContent([top, ...showing]);
      }),
    set: (rows) => {
      loopRef.current?.stop();
      y.setValue(0);
      setContent(rows);
    },
  }));

  const settled = content.length === 3;
  return (
    <View style={{ width, height: cell * 3, overflow: 'hidden' }}>
      <Animated.View style={{ transform: [{ translateY: y }] }}>
        {content.map((item, i) => (
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <FruitArt s={item} size={cell * 0.78} dim={settled && dimmed[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

// ---------- decoration ----------

/** A row of marquee bulbs; every other bulb is lit, swapping on `phase`. */
function Bulbs({ count, size, phase, vertical }: { count: number; size: number; phase: number; vertical?: boolean }) {
  return (
    <View style={{ flexDirection: vertical ? 'column' : 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
      {Array.from({ length: count }, (_, i) => {
        const on = (i + phase) % 2 === 0;
        return (
          <View
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: on ? '#FFF3B0' : '#7A5A1A',
              shadowColor: '#FFD23F',
              shadowOpacity: on ? 0.9 : 0,
              shadowRadius: on ? 6 : 0,
              elevation: on ? 4 : 0,
            }}
          />
        );
      })}
    </View>
  );
}

function Logo({ width }: { width: number }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={width} height={width * 0.3} viewBox="0 0 340 102">
      <Defs>
        <SvgLinearGradient id={`fmLogo${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF8D0" />
          <Stop offset="0.5" stopColor="#FFC93C" />
          <Stop offset="1" stopColor="#C07800" />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={170} y={58} fontSize={40} fontWeight="900" fontStyle="italic" fill="#3A0008" textAnchor="middle" letterSpacing={1} transform="translate(3 4)">
        FRUIT MACHINE
      </SvgText>
      <SvgText x={170} y={58} fontSize={40} fontWeight="900" fontStyle="italic" fill={`url(#fmLogo${u})`} stroke="#7A3A00" strokeWidth={1.5} textAnchor="middle" letterSpacing={1}>
        FRUIT MACHINE
      </SvgText>
      <SvgText x={170} y={86} fontSize={13} fontWeight="900" fill="#FFE9B0" textAnchor="middle" letterSpacing={4}>
        AUTO NUDGE · CASH LADDER
      </SvgText>
    </Svg>
  );
}

/** Home tile art: a cherry, a bell and a 7 on a lit pub-machine window. */
export function FruitMachineTileArt({ size }: { size: number }) {
  const s = size * 0.28;
  const u = useId().replace(/:/g, '');
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`fmtBg${u}`} cx="50%" cy="40%" r="75%">
            <Stop offset="0" stopColor="#B0132B" />
            <Stop offset="1" stopColor="#2A0006" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#fmtBg${u})`} />
        <Rect x={6} y={18} width={88} height={40} rx={8} fill="#FFF8EA" stroke={GOLD} strokeWidth={2.5} />
        {Array.from({ length: 9 }, (_, i) => (
          <Circle key={i} cx={10 + i * 10} cy={10} r={2.6} fill={i % 2 ? '#FFF3B0' : '#C8962A'} />
        ))}
      </Svg>
      {(['CHERRY', 'SEVEN', 'BELL'] as FruitSymbol[]).map((sym, i) => (
        <View key={sym} style={{ position: 'absolute', left: size * (0.09 + i * 0.28), top: size * 0.22 }}>
          <FruitArt s={sym} size={s} />
        </View>
      ))}
    </View>
  );
}

// ---------- screen ----------

const START_ROWS: FruitSymbol[][] = [
  ['LEMON', 'CHERRY', 'ORANGE'],
  ['PLUM', 'SEVEN', 'BELL'],
  ['MELON', 'BAR', 'GRAPES'],
];

type LadderState = { active: boolean; lit: number; final: boolean };

export default function FruitMachineScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<FruitMachineConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [shownBalance, setShownBalance] = useState(coins);
  const [meter, setMeter] = useState<{ label: string; amount: number | null; tone: 'idle' | 'win' | 'return' | 'lose' }>({ label: 'GOOD LUCK', amount: null, tone: 'idle' });
  const [winLines, setWinLines] = useState<FruitOutcome['lines']>([]);
  const [nudgeLamps, setNudgeLamps] = useState(0);
  const [ladder, setLadder] = useState<LadderState>({ active: false, lit: -1, final: false });
  const [banner, setBanner] = useState<string | null>(null);
  const [bigWin, setBigWin] = useState<number | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<FruitSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [phase, setPhase] = useState(0);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const bigAnim = useRef(new Animated.Value(0)).current;
  const reels = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];
  const rowsRef = useRef<FruitSymbol[][]>(START_ROWS);

  const strips = config?.strips ?? FALLBACK_STRIPS;
  const lines = config?.lines ?? FALLBACK_LINES;
  const threePays = config?.threePays ?? FALLBACK_PAYS;
  const ladderPrizes = config?.ladder ?? FALLBACK_LADDER;
  const lineCount = config?.lineCount ?? 5;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFruitMachineConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => {});
    const bulbs = setInterval(() => setPhase((p) => p + 1), 380);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mountedRef.current = false;
      clearInterval(bulbs);
      clearInterval(clock);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const flashBanner = useCallback(
    async (text: string, hold = 900) => {
      setBanner(text);
      bannerAnim.setValue(0);
      await new Promise<void>((r) => Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start(() => r()));
      await wait(hold);
      await new Promise<void>((r) => Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => r()));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim]
  );

  const countUp = useCallback(async (label: string, target: number, tone: 'win' | 'return') => {
    const steps = target > 0 ? Math.min(30, Math.max(8, Math.round(target))) : 1;
    for (let i = 1; i <= steps; i++) {
      if (!mountedRef.current) return;
      setMeter({ label, amount: round2((target * i) / steps), tone });
      await wait(28);
    }
  }, []);

  const spin = useCallback(async () => {
    if (busyRef.current) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setWinLines([]);
    setNudgeLamps(0);
    setLadder({ active: false, lit: -1, final: false });
    setBigWin(null);
    setMeter({ label: 'SPINNING', amount: null, tone: 'idle' });
    setShownBalance((b) => round2(b - bet));
    const t0 = Date.now();
    reels.forEach((r) => r.current?.start());

    let result: { spin: FruitSpinRow; outcome: FruitOutcome };
    try {
      result = await spinFruitMachine(bet);
    } catch (err) {
      reels.forEach((r, i) => r.current?.set(rowsRef.current[i]));
      setShownBalance((b) => round2(b + bet));
      setMeter({ label: 'GOOD LUCK', amount: null, tone: 'idle' });
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome } = result;
    const payout = Number(result.spin.payout);

    // Reels stop left to right; the last lands no sooner than MIN_SPIN_MS after the press.
    const first = windowFor(strips, outcome.stops);
    const elapsed = Date.now() - t0;
    const lastAt = Math.max(MIN_SPIN_MS - 480, 1500);
    await Promise.all(first.map((rows, i) => reels[i].current?.land(rows, Math.max(0, lastAt - (2 - i) * 450 - elapsed))));
    rowsRef.current = first;
    if (!mountedRef.current) return;

    // Auto Nudge: the reels drop one position at a time to the best result.
    if (outcome.nudges > 0) {
      setNudgeLamps(outcome.nudges);
      setMeter({ label: 'NUDGING', amount: null, tone: 'idle' });
      await flashBanner(`AUTO NUDGE ×${outcome.nudges}`, 700);
      let left = outcome.nudges;
      const stops = [...outcome.stops];
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < outcome.nudgePlan[r]; k++) {
          stops[r] -= 1;
          const top = strips[r][wrap(strips[r].length, stops[r] - 1)];
          await reels[r].current?.nudge(top);
          left -= 1;
          if (mountedRef.current) setNudgeLamps(left);
          await wait(160);
        }
      }
      rowsRef.current = windowFor(strips, outcome.finalStops);
      if (outcome.nudgePlan.every((x) => x === 0)) await wait(300);
      if (mountedRef.current) setNudgeLamps(0);
    }

    setWinLines(outcome.lines);
    const lineWin = round2(outcome.lines.reduce((s, l) => s + l.pays, 0) * (bet / lineCount));

    if (outcome.ladderRung >= 0) {
      setMeter({ label: 'CASH LADDER', amount: null, tone: 'idle' });
      await flashBanner('CASH LADDER!', 800);
      setLadder({ active: true, lit: -1, final: false });
      for (let i = 0; i <= outcome.ladderRung; i++) {
        if (!mountedRef.current) return;
        setLadder({ active: true, lit: i, final: false });
        await wait(i === 0 ? 500 : 750);
      }
      setLadder({ active: true, lit: outcome.ladderRung, final: true });
      await wait(700);
    }

    // Only a return above the stake is celebrated; a smaller one is shown plainly.
    if (payout > bet) {
      if (payout >= bet * 10) {
        setBigWin(payout);
        bigAnim.setValue(0);
        Animated.spring(bigAnim, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }).start();
      }
      await countUp('WIN', payout, 'win');
    } else if (payout > 0) {
      setMeter({ label: 'RETURNED', amount: payout, tone: 'return' });
    } else {
      setMeter({ label: lineWin > 0 ? 'WIN' : 'NO WIN', amount: null, tone: 'lose' });
    }

    setShownBalance((b) => round2(b + payout));
    setSessionNet((n) => round2(n + payout - bet));
    refreshWallet();
    if (panel === 'history') fetchFruitMachineHistory(30).then((h) => mountedRef.current && setHistory(h)).catch(() => {});
    if (payout >= bet * 10) await wait(1600);
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
    // reels and strips are stable for the life of a spin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bet, shownBalance, strips, lineCount, panel, flashBanner, countUp, refreshWallet, showToast, bigAnim]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchFruitMachineHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  // ---------- layout ----------
  const cabW = Math.min(W - 16, 440);
  const frame = 10;
  const ladderW = Math.floor(cabW * 0.2);
  const tabW = 16;
  const reelGap = 4;
  const reelsInner = cabW - frame * 2 - ladderW - 8 - tabW * 2;
  const reelW = Math.floor((reelsInner - reelGap * 2) / 3);
  const cell = Math.floor(Math.min(reelW, 112));
  const reelsW = reelW * 3 + reelGap * 2;
  const reelsH = cell * 3;

  // Which cells take part in a winning line, so the rest can be dimmed.
  const litCells = useMemo(() => {
    const lit = [0, 1, 2].map(() => [false, false, false]);
    winLines.forEach((w) => lines[w.line].forEach((row, reel) => (lit[reel][row] = w.count === 3 || reel < 2 ? true : lit[reel][row])));
    return lit;
  }, [winLines, lines]);
  const dimFor = (reel: number) => (winLines.length > 0 ? litCells[reel].map((x) => !x) : [false, false, false]);

  const tabRows = [1.5, 0.5, 2.5, 0.95, 2.05];
  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={['#2A0006', '#12000A', '#050005']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <Text style={styles.title}>FRUIT MACHINE</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
        {/* Cabinet */}
        <View style={[styles.cabinet, { width: cabW }]}>
          <LinearGradient colors={['#8E1426', CABINET, '#2A0006']} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
          <View style={styles.bulbRow}>
            <Bulbs count={Math.floor(cabW / 22)} size={9} phase={phase} />
          </View>
          <View style={{ alignItems: 'center', marginTop: 2 }}>
            <Logo width={cabW * 0.86} />
          </View>

          <View style={{ flexDirection: 'row', paddingHorizontal: frame, gap: 8, alignItems: 'stretch' }}>
            {/* Cash Ladder */}
            <View style={[styles.ladder, { width: ladderW, height: reelsH + 52 }]}>
              <Text style={styles.ladderTitle}>CASH{'\n'}LADDER</Text>
              <View style={{ flex: 1, justifyContent: 'space-between', paddingVertical: 4 }}>
                {[...ladderPrizes].reverse().map((prize, ri) => {
                  const i = ladderPrizes.length - 1 - ri;
                  const lit = ladder.active && ladder.lit >= i;
                  const top = ladder.active && ladder.lit === i;
                  const flash = top && ladder.final && phase % 2 === 0;
                  return (
                    <View key={prize} style={[styles.rung, lit && styles.rungLit, top && styles.rungTop, flash && styles.rungFlash]}>
                      <Text style={[styles.rungX, lit && { color: '#2A1600' }]}>{prize}x</Text>
                      <Text style={[styles.rungAmt, lit && { color: '#4A2A00' }]} numberOfLines={1} adjustsFontSizeToFit>
                        {money(prize * bet)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {/* Reels with line tabs */}
            <View style={{ flex: 1 }}>
              <View style={styles.reelFrame}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <LineTabs side="left" rows={tabRows} cell={cell} width={tabW} winLines={winLines} />
                  <View style={{ width: reelsW, height: reelsH }}>
                    <View style={{ flexDirection: 'row', gap: reelGap }}>
                      {[0, 1, 2].map((i) => (
                        <View key={i} style={styles.reelWindow}>
                          <LinearGradient colors={['#D9D4C7', '#FFFFFF', '#FFFFFF', '#D9D4C7']} locations={[0, 0.18, 0.82, 1]} style={StyleSheet.absoluteFill} />
                          <Reel ref={reels[i]} initial={START_ROWS[i]} cell={cell} width={reelW} dimmed={dimFor(i)} />
                        </View>
                      ))}
                    </View>
                    {/* Winning lines drawn over the reels */}
                    <Svg width={reelsW} height={reelsH} style={StyleSheet.absoluteFill} pointerEvents="none">
                      {winLines.map((w) => {
                        const pts = lines[w.line].map((row, reel) => `${reel * (reelW + reelGap) + reelW / 2},${row * cell + cell / 2}`);
                        const all = [`0,${lines[w.line][0] * cell + cell / 2}`, ...pts, `${reelsW},${lines[w.line][2] * cell + cell / 2}`].join(' ');
                        return (
                          <G key={w.line}>
                            <Polyline points={all} fill="none" stroke={LINE_COLORS[w.line]} strokeOpacity={0.35} strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" />
                            <Polyline points={all} fill="none" stroke={LINE_COLORS[w.line]} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
                          </G>
                        );
                      })}
                    </Svg>
                  </View>
                  <LineTabs side="right" rows={tabRows} cell={cell} width={tabW} winLines={winLines} />
                </View>
              </View>

              {/* Nudge lamps and win meter */}
              <View style={styles.underReels}>
                <View style={styles.nudgeBox}>
                  <Text style={styles.nudgeLabel}>NUDGE</Text>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {[1, 2, 3].map((n) => (
                      <View key={n} style={[styles.nudgeLamp, nudgeLamps >= n && styles.nudgeLampOn]}>
                        <Text style={[styles.nudgeLampText, nudgeLamps >= n && { color: '#2A1600' }]}>{n}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={styles.meter}>
                  <Text style={[styles.meterLabel, meter.tone === 'win' && { color: '#7CFF9A' }]}>{meter.label}</Text>
                  <Text style={[styles.meterValue, meter.tone === 'win' && { color: '#7CFF9A' }, meter.tone === 'return' && { color: '#FFD9A0' }]} numberOfLines={1} adjustsFontSizeToFit>
                    {meter.amount === null ? '— — —' : money(meter.amount)}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Line wins */}
          <View style={styles.lineWinsRow}>
            {winLines.length === 0 ? (
              <Text style={styles.lineWinHint}>5 lines · 3 rows and both diagonals</Text>
            ) : (
              winLines.map((w) => (
                <View key={w.line} style={[styles.lineChip, { borderColor: LINE_COLORS[w.line] }]}>
                  <Text style={[styles.lineChipText, { color: LINE_COLORS[w.line] }]}>
                    L{w.line + 1} {w.count === 3 ? '3×' : '2×'}
                  </Text>
                  <FruitArt s={w.symbol} size={16} />
                  <Text style={styles.lineChipText}>{money(round2((w.pays * bet) / lineCount))}</Text>
                </View>
              ))
            )}
          </View>

          <View style={[styles.bulbRow, { marginTop: 6 }]}>
            <Bulbs count={Math.floor(cabW / 22)} size={9} phase={phase + 1} />
          </View>
        </View>

        {/* Session (UK: time played and net position, always on show) */}
        <View style={[styles.session, { width: cabW }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#C9B6BC" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? '#7CFF9A' : sessionNet < 0 ? '#FF9AA6' : '#C9B6BC' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        {/* Controls */}
        <View style={[styles.controls, { width: cabW }]}>
          <Pressable onPress={() => setPanel('pay')} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="information-outline" size={20} color={GOLD} />
            <Text style={styles.sideBtnText}>PAYS</Text>
          </Pressable>
          <View style={styles.betBox}>
            <Text style={styles.betLabel}>BET</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="minus" size={18} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.betValue}>{money(bet)}</Text>
              <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.betBtn, busy && styles.dim]} hitSlop={6}>
                <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <Pressable onPress={spin} disabled={busy} style={({ pressed }) => [styles.spinWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
            <LinearGradient colors={busy ? ['#6A3A40', '#3A1A20'] : ['#FF5A6A', '#D4102A', '#8A0012']} style={styles.spinBtn}>
              <Text style={styles.spinText}>{busy ? '…' : 'SPIN'}</Text>
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideBtnText}>HISTORY</Text>
          </Pressable>
        </View>

        <Text style={styles.footNote}>
          RTP {config ? `${config.rtpPercent}%` : '—'} · bet {money(minStake)}–{money(maxStake)} · max win {money(config?.maxPayout ?? 10000)} per spin{'\n'}
          No autoplay or turbo · each spin takes at least 2.5 seconds · provably fair
        </Text>
      </ScrollView>

      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
        >
          <LinearGradient colors={['#FFF4B8', '#FFC93C', '#C07800']} style={styles.bannerInner}>
            <Text style={styles.bannerText}>{banner}</Text>
          </LinearGradient>
        </Animated.View>
      )}

      {bigWin !== null && (
        <Animated.View pointerEvents="none" style={[styles.bigWin, { opacity: bigAnim, transform: [{ scale: bigAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}>
          <Text style={styles.bigWinLabel}>{bigWin >= bet * 50 ? 'MEGA WIN' : 'BIG WIN'}</Text>
          <Text style={styles.bigWinAmount}>{money(bigWin)}</Text>
        </Animated.View>
      )}

      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
        <Pressable style={styles.modalBack} onPress={() => setPanel(null)}>
          <Pressable style={[styles.modalCard, { width: Math.min(W - 24, 420) }]} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{panel === 'pay' ? 'PAYTABLE' : 'MY SPINS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 460 }}>
              {panel === 'pay' ? (
                <Paytable bet={bet} lineCount={lineCount} threePays={threePays} twoCherries={config?.twoCherries ?? 4} ladder={ladderPrizes} config={config} />
              ) : (
                <History spins={history} />
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function LineTabs({ side, rows, cell, width, winLines }: { side: 'left' | 'right'; rows: number[]; cell: number; width: number; winLines: FruitOutcome['lines'] }) {
  return (
    <View style={{ width, height: cell * 3 }}>
      {rows.map((row, line) => {
        // The diagonals start at opposite corners, so swap their tabs on the right.
        const r = side === 'right' && line >= 3 ? rows[line === 3 ? 4 : 3] : row;
        const on = winLines.some((w) => w.line === line);
        return (
          <View
            key={line}
            style={[
              styles.tab,
              { top: r * cell - 9, width, backgroundColor: on ? LINE_COLORS[line] : '#2A0A10', borderColor: LINE_COLORS[line] },
              side === 'left' ? { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 } : { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
            ]}
          >
            <Text style={[styles.tabText, { color: on ? '#1A0005' : LINE_COLORS[line] }]}>{line + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

function Paytable({
  bet,
  lineCount,
  threePays,
  twoCherries,
  ladder,
  config,
}: {
  bet: number;
  lineCount: number;
  threePays: Partial<Record<FruitSymbol, number>>;
  twoCherries: number;
  ladder: number[];
  config: FruitMachineConfig | null;
}) {
  const lineBet = bet / lineCount;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.payNote}>
        Your bet of {money(bet)} plays all {lineCount} lines ({money(lineBet)} each). Prizes below are per line at this bet.
      </Text>
      {PAY_ORDER.map((sym) => (
        <View key={sym} style={styles.payRow}>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {[0, 1, 2].map((i) => (
              <FruitArt key={i} s={sym} size={28} />
            ))}
          </View>
          <Text style={styles.payValue}>{money(round2((threePays[sym] ?? 0) * lineBet))}</Text>
        </View>
      ))}
      <View style={styles.payRow}>
        <View style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
          <FruitArt s="CHERRY" size={28} />
          <FruitArt s="CHERRY" size={28} />
          <Text style={styles.payAny}>from left</Text>
        </View>
        <Text style={styles.payValue}>{money(round2(twoCherries * lineBet))}</Text>
      </View>
      <Text style={styles.paySection}>AUTO NUDGE</Text>
      <Text style={styles.payNote}>
        A spin that wins nothing may be given 1–3 nudges ({config ? config.nudgeChances.filter((n) => n.nudges > 0).map((n) => `${n.nudges}: ${n.chancePercent}%`).join(' · ') : '—'}). The machine drops the reels to the best
        result the nudges can reach, so you never have to pick.
      </Text>
      <Text style={styles.paySection}>CASH LADDER</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <FruitArt s="STAR" size={28} />
        <Text style={styles.payNote}>A star on all three reels starts the ladder at 2x your bet. It climbs rung by rung — {ladder.join('x, ')}x — and pays the rung it stops on.</Text>
      </View>
      <Text style={styles.payNote}>
        RTP {config ? `${config.rtpPercent}%` : '—'} · a win on {config ? `${config.hitRatePercent}%` : '—'} of spins. Results come from your provably-fair seeds on the server.
      </Text>
    </View>
  );
}

function History({ spins }: { spins: FruitSpinRow[] | null }) {
  if (spins === null) return <Text style={styles.payNote}>Loading…</Text>;
  if (spins.length === 0) return <Text style={styles.payNote}>No spins yet.</Text>;
  return (
    <View style={{ gap: 4 }}>
      {spins.map((s) => {
        const pay = Number(s.payout);
        const stake = Number(s.stake);
        return (
          <View key={s.id} style={styles.histRow}>
            <Text style={styles.histTime}>{new Date(s.createdAt).toLocaleTimeString()}</Text>
            <Text style={styles.histStake}>{money(stake)}</Text>
            <Text style={styles.histTags}>
              {s.nudges > 0 ? `N${s.nudges} ` : ''}
              {s.ladderRung >= 0 ? 'LADDER' : ''}
            </Text>
            <Text style={[styles.histWin, { color: pay > stake ? '#7CFF9A' : pay > 0 ? '#FFD9A0' : '#8A7A80' }]}>{pay > 0 ? money(pay) : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050005' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,209,102,0.12)', borderWidth: 1, borderColor: 'rgba(255,209,102,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cabinet: { borderRadius: 22, borderWidth: 3, borderColor: GOLD, paddingVertical: 8, overflow: 'hidden', marginTop: 4 },
  bulbRow: { height: 14, flexDirection: 'row', paddingHorizontal: 14 },
  ladder: { borderRadius: 12, borderWidth: 2, borderColor: GOLD_DEEP, backgroundColor: '#1A0006', padding: 4 },
  ladderTitle: { color: GOLD, fontSize: 10, fontWeight: '900', textAlign: 'center', letterSpacing: 1, lineHeight: 11 },
  rung: { borderRadius: 6, borderWidth: 1, borderColor: '#5A3A10', backgroundColor: '#2A0A0E', paddingVertical: 2, alignItems: 'center' },
  rungLit: { backgroundColor: '#FFC93C', borderColor: '#FFF3B0' },
  rungTop: { shadowColor: '#FFD23F', shadowOpacity: 1, shadowRadius: 10, elevation: 6 },
  rungFlash: { backgroundColor: '#FFFFFF' },
  rungX: { color: GOLD, fontSize: 12, fontWeight: '900' },
  rungAmt: { color: '#C9A86A', fontSize: 8, fontWeight: '700' },
  reelFrame: { borderRadius: 12, borderWidth: 3, borderColor: CHROME, backgroundColor: '#1A0006', paddingVertical: 4 },
  reelWindow: { borderRadius: 6, overflow: 'hidden' },
  tab: { position: 'absolute', height: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 10, fontWeight: '900' },
  underReels: { flexDirection: 'row', gap: 6, marginTop: 6 },
  nudgeBox: { borderRadius: 10, borderWidth: 1.5, borderColor: GOLD_DEEP, backgroundColor: '#1A0006', paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center', gap: 3 },
  nudgeLabel: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 2 },
  nudgeLamp: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#3A1A0A', borderWidth: 1, borderColor: '#7A5A1A', alignItems: 'center', justifyContent: 'center' },
  nudgeLampOn: { backgroundColor: '#FFC93C', borderColor: '#FFF3B0', shadowColor: '#FFD23F', shadowOpacity: 1, shadowRadius: 8, elevation: 5 },
  nudgeLampText: { color: '#7A5A1A', fontSize: 10, fontWeight: '900' },
  meter: { flex: 1, borderRadius: 10, borderWidth: 2, borderColor: '#3A3A44', backgroundColor: '#0A0A0C', paddingHorizontal: 10, paddingVertical: 4, justifyContent: 'center' },
  meterLabel: { color: '#FF6A3A', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  meterValue: { color: '#FF6A3A', fontSize: 22, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: 1 },
  lineWinsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, paddingHorizontal: 10, marginTop: 8, minHeight: 26 },
  lineWinHint: { color: '#C9A86A', fontSize: 11, fontWeight: '700' },
  lineChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.35)' },
  lineChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  sessionText: { color: '#C9B6BC', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#6A5A60', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideBtnText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#C9A86A', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1A0006', borderRadius: 20, borderWidth: 1.5, borderColor: GOLD_DEEP, paddingHorizontal: 6, paddingVertical: 4 },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#4A0A14', alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  spinWrap: { borderRadius: 40, borderWidth: 4, borderColor: GOLD, shadowColor: '#FF3B4E', shadowOpacity: 0.8, shadowRadius: 12, elevation: 8 },
  spinBtn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  spinText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 2, textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 },
  footNote: { color: '#8A7A80', fontSize: 10, textAlign: 'center', marginTop: 14, lineHeight: 15, paddingHorizontal: 16 },
  banner: { position: 'absolute', top: '32%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 26, paddingVertical: 12, borderRadius: 18, borderWidth: 3, borderColor: '#FFF8D0' },
  bannerText: { color: '#4A0A14', fontSize: 26, fontWeight: '900', fontStyle: 'italic', letterSpacing: 2 },
  bigWin: { position: 'absolute', top: '24%', alignSelf: 'center', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 18, borderRadius: 24, backgroundColor: 'rgba(20,0,6,0.88)', borderWidth: 3, borderColor: GOLD },
  bigWinLabel: { color: GOLD, fontSize: 30, fontWeight: '900', fontStyle: 'italic', letterSpacing: 3 },
  bigWinAmount: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#1A0006', borderRadius: 18, borderWidth: 2, borderColor: GOLD_DEEP, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: GOLD, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  payRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,209,102,0.15)' },
  payValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  payAny: { color: '#C9A86A', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  paySection: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 8 },
  payNote: { color: '#D8C8CC', fontSize: 12, lineHeight: 17, flexShrink: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  histTime: { color: '#A898A0', fontSize: 11, width: 82 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 70 },
  histTags: { color: GOLD, fontSize: 10, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
