import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient as SvgLinearGradient, Path, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { FishFreeSpin, FishLineWin, FishSymbol, FishermanConfig, FishermanSpinRow, fetchFishermanConfig, fetchFishermanHistory, spinFisherman } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#FFD166';
const GOLD_DEEP = '#B8860B';
const WOOD = '#6B3E1E';
const WOOD_DARK = '#3A1F0C';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** UK rule: a paid spin may not resolve faster than this, press to result. */
const MIN_SPIN_MS = 2500;
const FREE_SPIN_MS = 2200;
const LINE_COLORS = ['#FF3B4E', '#FFD23F', '#2FE07A', '#22B8FF', '#FF7AE0', '#FF9A3C', '#9B7BFF', '#3CF0D0', '#FF5FA0', '#B8F04A'];
const FILLER: FishSymbol[] = ['JACK', 'QUEEN', 'KING', 'ACE', 'LURE', 'TACKLE', 'ROD', 'FISH'];
const FILLER_VALUES = [0.5, 1, 2, 3, 5, 10];

type Cell = { s: FishSymbol; v: number };

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function money(n: number): string {
  return `₹${n.toFixed(2)}`;
}

/** Fish values are shown short on the reels: ₹5, ₹12.5, ₹1.2K. */
function shortMoney(n: number): string {
  if (n >= 1000) return `₹${round2(n / 1000)}K`;
  return `₹${Number.isInteger(n) ? n : round2(n)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof ApiClientError ? err.message : 'Network error — please try again.';
}

const wrap = (len: number, i: number) => ((i % len) + len) % len;

function cellsFor(strips: FishSymbol[][], stops: number[], values: number[][]): Cell[][] {
  return stops.map((stop, r) => [-1, 0, 1].map((d, row) => ({ s: strips[r][wrap(strips[r].length, stop + d)], v: values[r][row] })));
}

// ---------- symbol art ----------
// Every symbol is drawn on a 100 x 100 canvas.

const LETTER_COLORS: Partial<Record<FishSymbol, [string, string, string]>> = {
  ACE: ['#FFB4B4', '#E8213B', '#7A0010'],
  KING: ['#B9E3FF', '#1E88E5', '#0B3A7A'],
  QUEEN: ['#D9B8FF', '#8E3BE0', '#3D0A6A'],
  JACK: ['#C8F5B0', '#2FA84F', '#0E4A1E'],
};
const LETTER: Partial<Record<FishSymbol, string>> = { ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J' };

export const FishArt = memo(function FishArt({ s, size, value, dim, glow }: { s: FishSymbol; size: number; value?: number; dim?: boolean; glow?: boolean }) {
  // Ids must be unique per drawing: a gradient defined in a hidden screen doesn't paint on web.
  const u = `fc${s}${useId().replace(/:/g, '')}`;
  const letter = LETTER[s];
  const lc = LETTER_COLORS[s];
  return (
    <View style={{ width: size, height: size, opacity: dim ? 0.35 : 1 }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Defs>
          <SvgLinearGradient id={`${u}gold`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFF4B8" />
            <Stop offset="0.5" stopColor="#FFC93C" />
            <Stop offset="1" stopColor="#B07A00" />
          </SvgLinearGradient>
          <SvgLinearGradient id={`${u}fish`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#4C7A2A" />
            <Stop offset="0.45" stopColor="#8DBA3A" />
            <Stop offset="0.75" stopColor="#E9E3A8" />
            <Stop offset="1" stopColor="#FFFDF0" />
          </SvgLinearGradient>
          <SvgLinearGradient id={`${u}wood`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#B8743A" />
            <Stop offset="1" stopColor="#5A2E10" />
          </SvgLinearGradient>
          <SvgLinearGradient id={`${u}box`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5FD08A" />
            <Stop offset="1" stopColor="#14703A" />
          </SvgLinearGradient>
          <RadialGradient id={`${u}glow`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFF3B0" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#FFD23F" stopOpacity={0} />
          </RadialGradient>
          {lc && (
            <SvgLinearGradient id={`${u}let`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={lc[0]} />
              <Stop offset="0.5" stopColor={lc[1]} />
              <Stop offset="1" stopColor={lc[2]} />
            </SvgLinearGradient>
          )}
        </Defs>
        {glow && <Circle cx={50} cy={50} r={50} fill={`url(#${u}glow)`} />}
        {letter && lc && (
          <G>
            <SvgText x={52} y={78} fontSize={72} fontWeight="900" fill="#1A0E04" opacity={0.35} textAnchor="middle">
              {letter}
            </SvgText>
            <SvgText x={50} y={75} fontSize={72} fontWeight="900" fill={`url(#${u}let)`} stroke="#FFF6DA" strokeWidth={3} textAnchor="middle">
              {letter}
            </SvgText>
          </G>
        )}
        {s === 'LURE' && (
          <G transform="rotate(-25 50 50)">
            <Path d="M50 10 C 70 22, 72 58, 50 76 C 28 58, 30 22, 50 10 Z" fill="#FF5A2A" stroke="#7A1A00" strokeWidth={2} />
            <Path d="M50 14 C 62 26, 64 52, 50 66 C 38 52, 40 26, 50 14 Z" fill="#FFD23F" />
            <Circle cx={50} cy={30} r={6} fill="#FFFFFF" />
            <Circle cx={50} cy={30} r={3} fill="#111111" />
            <Path d="M50 76 L 50 86 M 50 86 C 50 96, 40 96, 40 88 M 50 86 C 50 96, 60 96, 60 88" stroke="#C9CED8" strokeWidth={3} fill="none" strokeLinecap="round" />
            <Circle cx={50} cy={8} r={3} fill="none" stroke="#C9CED8" strokeWidth={2} />
          </G>
        )}
        {s === 'TACKLE' && (
          <G>
            <Path d="M34 30 C 34 18, 66 18, 66 30" stroke="#2A2A2A" strokeWidth={5} fill="none" />
            <Rect x={12} y={30} width={76} height={56} rx={8} fill={`url(#${u}box)`} stroke="#0B3A1E" strokeWidth={2} />
            <Rect x={12} y={30} width={76} height={18} rx={6} fill="#7BE3A3" opacity={0.8} />
            <Rect x={44} y={44} width={12} height={10} rx={2} fill="#FFD23F" stroke="#8A6A00" strokeWidth={1.5} />
            <Rect x={18} y={60} width={64} height={3} fill="#0B3A1E" opacity={0.4} />
            <Path d="M22 36 L 40 36" stroke="#FFFFFF" strokeOpacity={0.7} strokeWidth={3} strokeLinecap="round" />
          </G>
        )}
        {s === 'ROD' && (
          <G>
            <Line x1={14} y1={92} x2={86} y2={10} stroke="#3A2210" strokeWidth={6} strokeLinecap="round" />
            <Line x1={14} y1={92} x2={86} y2={10} stroke="#B8743A" strokeWidth={3} strokeLinecap="round" />
            <Rect x={10} y={70} width={14} height={22} rx={4} fill="#1A1A1A" transform="rotate(41 17 81)" />
            <Circle cx={34} cy={74} r={11} fill="#C9CED8" stroke="#5A6070" strokeWidth={2} />
            <Circle cx={34} cy={74} r={4} fill="#5A6070" />
            <Path d="M86 10 C 92 30, 90 50, 84 64" stroke="#E6E9F0" strokeWidth={1.5} fill="none" />
            <Path d="M84 64 C 84 72, 76 72, 77 66" stroke="#C9CED8" strokeWidth={2.5} fill="none" strokeLinecap="round" />
            {[0.35, 0.55, 0.75].map((t) => (
              <Circle key={t} cx={14 + 72 * t} cy={92 - 82 * t} r={2.5} fill="none" stroke="#E6E9F0" strokeWidth={1.5} />
            ))}
          </G>
        )}
        {s === 'FISH' && (
          <G transform="translate(0 -6)">
            <Path d="M84 50 L 98 34 L 96 66 Z" fill="#5E8E2A" stroke="#2E4A10" strokeWidth={1.5} />
            <Path d="M10 50 C 22 26, 62 22, 86 50 C 62 76, 22 74, 10 50 Z" fill={`url(#${u}fish)`} stroke="#2E4A10" strokeWidth={2} />
            <Path d="M40 30 C 50 18, 64 22, 68 34" fill="#5E8E2A" stroke="#2E4A10" strokeWidth={1.5} />
            <Path d="M28 40 C 40 46, 58 46, 74 40" stroke="#2E4A10" strokeOpacity={0.35} strokeWidth={2} fill="none" />
            <Circle cx={24} cy={46} r={6} fill="#FFFFFF" />
            <Circle cx={23} cy={46} r={3.2} fill="#111111" />
            <Path d="M11 52 C 16 56, 20 56, 24 54" stroke="#2E4A10" strokeWidth={2} fill="none" />
          </G>
        )}
        {s === 'BONUS' && (
          <G>
            <Path d="M50 14 L 50 56" stroke="#5A2E10" strokeWidth={3} />
            <Path d="M50 16 L 80 30 L 50 44 Z" fill="#FF3B4E" stroke="#7A0010" strokeWidth={1.5} />
            <Path d="M8 58 L 92 58 L 80 84 L 20 84 Z" fill={`url(#${u}wood)`} stroke={WOOD_DARK} strokeWidth={2} />
            <Path d="M14 66 L 86 66" stroke={WOOD_DARK} strokeOpacity={0.5} strokeWidth={1.5} />
            <Path d="M4 88 C 20 82, 30 94, 50 88 C 70 82, 80 94, 96 88" stroke="#7FD3FF" strokeWidth={4} fill="none" strokeLinecap="round" />
            <Rect x={20} y={2} width={60} height={14} rx={7} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
            <SvgText x={50} y={13} fontSize={11} fontWeight="900" fill="#4A2A00" textAnchor="middle" letterSpacing={1}>
              BONUS
            </SvgText>
          </G>
        )}
        {s === 'WILD' && (
          <G>
            <Circle cx={50} cy={52} r={44} fill="#FFD23F" opacity={0.25} />
            <Path d="M22 92 C 22 70, 78 70, 78 92 Z" fill="#E8522A" stroke="#7A2000" strokeWidth={2} />
            <Rect x={44} y={72} width={12} height={20} fill="#FFD23F" opacity={0.7} />
            <Circle cx={50} cy={52} r={20} fill="#F2C29A" stroke="#8A5A3A" strokeWidth={1.5} />
            <Path d="M32 58 C 36 74, 64 74, 68 58 C 62 64, 38 64, 32 58 Z" fill="#E6E2DA" />
            <Circle cx={43} cy={50} r={2.6} fill="#2A1A10" />
            <Circle cx={57} cy={50} r={2.6} fill="#2A1A10" />
            <Path d="M44 60 C 48 63, 52 63, 56 60" stroke="#8A3A20" strokeWidth={2} fill="none" strokeLinecap="round" />
            <Ellipse cx={50} cy={36} rx={30} ry={6} fill="#F2B705" stroke="#8A6A00" strokeWidth={1.5} />
            <Path d="M34 36 C 34 18, 66 18, 66 36 Z" fill="#FFCC1A" stroke="#8A6A00" strokeWidth={1.5} />
            <Rect x={34} y={30} width={32} height={4} fill="#C0392B" />
            <Line x1={84} y1={8} x2={70} y2={92} stroke="#5A2E10" strokeWidth={3} strokeLinecap="round" />
            <Rect x={6} y={78} width={88} height={18} rx={9} fill={`url(#${u}gold)`} stroke={GOLD_DEEP} strokeWidth={2} />
            <SvgText x={50} y={92} fontSize={14} fontWeight="900" fill="#4A2A00" textAnchor="middle" letterSpacing={3}>
              WILD
            </SvgText>
          </G>
        )}
      </Svg>
      {s === 'FISH' && value !== undefined && value > 0 && (
        <View style={[styles.fishTag, { bottom: size * 0.04, paddingHorizontal: size * 0.06 }]}>
          <Text style={[styles.fishTagText, { fontSize: Math.max(9, size * 0.15) }]} numberOfLines={1}>
            {shortMoney(value)}
          </Text>
        </View>
      )}
    </View>
  );
});

// ---------- reels ----------

type ReelHandle = {
  start: () => void;
  land: (rows: Cell[], delay: number) => Promise<void>;
  set: (rows: Cell[]) => void;
};

const LOOP_CELLS = 16;
const LAND_CELLS = 10;

function fillerCell(free: boolean, bet: number, reel: number): Cell {
  // The Fisherman only lives on reels 2–5 of the free-spin reels.
  const pool: FishSymbol[] = free ? (reel > 0 ? [...FILLER, 'WILD'] : FILLER) : [...FILLER, 'BONUS'];
  const s = pool[Math.floor(Math.random() * pool.length)];
  return { s, v: s === 'FISH' ? FILLER_VALUES[Math.floor(Math.random() * FILLER_VALUES.length)] * bet : 0 };
}

const Reel = forwardRef(function Reel(
  { initial, cell, width, dimmed, glowing, free, bet, reel }: { initial: Cell[]; cell: number; width: number; dimmed: boolean[]; glowing: boolean[]; free: boolean; bet: number; reel: number },
  ref: React.Ref<ReelHandle>
) {
  const [content, setContent] = useState<Cell[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land'; resolve: () => void; rows: Cell[] }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opts = useRef({ free, bet });
  opts.current = { free, bet };
  const filler = () => fillerCell(opts.current.free, opts.current.bet, reel);

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
      y.setValue(-(content.length - 3) * cell);
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: 480, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    y.setValue(-(content.length - 3) * cell);
    Animated.timing(y, { toValue: 0, duration: 460, easing: Easing.out(Easing.back(1.3)), useNativeDriver: true }).start(() => {
      y.setValue(0);
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
        {content.map((c, i) => (
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <FishArt s={c.s} value={c.v} size={Math.min(width, cell) * 0.9} dim={settled && dimmed[i]} glow={settled && glowing[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

// ---------- scenery ----------

/** Sunset (or, in free spins, a gold-lit night) over the lake, with hills, sun and water. */
const LakeScene = memo(function LakeScene({ w, h, night }: { w: number; h: number; night: boolean }) {
  const u = useId().replace(/:/g, '');
  const sky = night ? ['#060B2A', '#1A1450', '#4A2A6A'] : ['#2A1A5A', '#C2477A', '#FFB45A'];
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`fcSky${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={sky[0]} />
          <Stop offset="0.6" stopColor={sky[1]} />
          <Stop offset="1" stopColor={sky[2]} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`fcWater${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={night ? '#2A2A6A' : '#E07A5A'} />
          <Stop offset="0.25" stopColor={night ? '#10204A' : '#1C6A8A'} />
          <Stop offset="1" stopColor="#04162A" />
        </SvgLinearGradient>
        <RadialGradient id={`fcSun${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={night ? '#FFFFFF' : '#FFF6C8'} />
          <Stop offset="0.5" stopColor={night ? '#E8ECFF' : '#FFC24A'} />
          <Stop offset="1" stopColor={night ? '#E8ECFF' : '#FF7A3A'} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#fcSky${u})`} />
      {night &&
        Array.from({ length: 40 }, (_, i) => (
          <Circle key={i} cx={((i * 73) % 100) * (w / 100)} cy={((i * 37) % 40) * (h / 100)} r={(i % 3) * 0.5 + 0.6} fill="#FFFFFF" opacity={0.6} />
        ))}
      <Circle cx={w * 0.72} cy={h * 0.33} r={h * 0.12} fill={`url(#fcSun${u})`} />
      <Path d={`M0 ${h * 0.45} C ${w * 0.15} ${h * 0.32}, ${w * 0.3} ${h * 0.36}, ${w * 0.42} ${h * 0.44} C ${w * 0.55} ${h * 0.34}, ${w * 0.8} ${h * 0.36}, ${w} ${h * 0.44} L ${w} ${h * 0.5} L 0 ${h * 0.5} Z`} fill={night ? '#0A0E2A' : '#3A1A4A'} opacity={0.9} />
      <Rect x={0} y={h * 0.48} width={w} height={h * 0.52} fill={`url(#fcWater${u})`} />
      {Array.from({ length: 9 }, (_, i) => (
        <Rect key={i} x={w * (0.55 + ((i * 7) % 5) * 0.06)} y={h * (0.5 + i * 0.03)} width={w * (0.2 - i * 0.015)} height={1.5} fill="#FFE9B0" opacity={0.45 - i * 0.04} />
      ))}
    </Svg>
  );
});

function Title({ width, free }: { width: number; free: boolean }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={width} height={width * 0.22} viewBox="0 0 360 80">
      <Defs>
        <SvgLinearGradient id={`fcT${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF8D0" />
          <Stop offset="0.5" stopColor="#FFC93C" />
          <Stop offset="1" stopColor="#C07800" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`fcPlank${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#A0612E" />
          <Stop offset="1" stopColor="#5A2E10" />
        </SvgLinearGradient>
      </Defs>
      <Rect x={20} y={8} width={320} height={56} rx={12} fill={`url(#fcPlank${u})`} stroke={WOOD_DARK} strokeWidth={3} />
      <Path d="M28 28 L 332 28 M28 46 L 332 46" stroke={WOOD_DARK} strokeOpacity={0.35} strokeWidth={1.5} />
      {[30, 330].map((x) => (
        <Circle key={x} cx={x} cy={36} r={4} fill="#C9CED8" stroke="#5A6070" strokeWidth={1} />
      ))}
      <SvgText x={182} y={47} fontSize={30} fontWeight="900" fontStyle="italic" fill="#2A1204" textAnchor="middle" letterSpacing={1}>
        FISHERMAN'S CATCH
      </SvgText>
      <SvgText x={180} y={45} fontSize={30} fontWeight="900" fontStyle="italic" fill={`url(#fcT${u})`} stroke="#5A2E10" strokeWidth={1} textAnchor="middle" letterSpacing={1}>
        FISHERMAN'S CATCH
      </SvgText>
      <SvgText x={180} y={76} fontSize={11} fontWeight="900" fill={free ? '#FFE36B' : '#FFE9D0'} textAnchor="middle" letterSpacing={3}>
        {free ? 'FREE SPINS · FISHERMEN COLLECT' : '10 LINES · BOATS START FREE SPINS'}
      </SvgText>
    </Svg>
  );
}

/** Home tile art: a fish with a cash tag leaping from the lake at sunset. */
export function FishermansCatchTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <LakeScene w={size} h={size} night={false} />
      <View style={{ position: 'absolute', left: size * 0.16, top: size * 0.06, transform: [{ rotate: '-18deg' }] }}>
        <FishArt s="FISH" size={size * 0.62} value={50} />
      </View>
    </View>
  );
}

// ---------- screen ----------

const START: Cell[][] = [
  [{ s: 'ACE', v: 0 }, { s: 'ROD', v: 0 }, { s: 'KING', v: 0 }],
  [{ s: 'FISH', v: 50 }, { s: 'TACKLE', v: 0 }, { s: 'QUEEN', v: 0 }],
  [{ s: 'LURE', v: 0 }, { s: 'BONUS', v: 0 }, { s: 'JACK', v: 0 }],
  [{ s: 'KING', v: 0 }, { s: 'FISH', v: 20 }, { s: 'ACE', v: 0 }],
  [{ s: 'JACK', v: 0 }, { s: 'LURE', v: 0 }, { s: 'FISH', v: 100 }],
];

type FreeState = { active: boolean; played: number; total: number; collected: number; multiplier: number; won: number };
const NO_FREE: FreeState = { active: false, played: 0, total: 0, collected: 0, multiplier: 1, won: 0 };

export default function FishermansCatchScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<FishermanConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [shownBalance, setShownBalance] = useState(coins);
  const [meter, setMeter] = useState<{ label: string; amount: number | null; tone: 'idle' | 'win' | 'return' | 'lose' }>({ label: 'TIGHT LINES', amount: null, tone: 'idle' });
  const [winLines, setWinLines] = useState<FishLineWin[]>([]);
  const [collecting, setCollecting] = useState(false);
  const [free, setFree] = useState<FreeState>(NO_FREE);
  const [banner, setBanner] = useState<{ title: string; sub?: string } | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<FishermanSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [cells, setCells] = useState<Cell[][]>(START);
  const [sceneH, setSceneH] = useState(0);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const reels = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];

  const lineCount = config?.lineCount ?? 10;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const perLevel = config?.fishermenPerLevel ?? 4;
  const multipliers = config?.multipliers ?? [1, 2, 3, 10];
  const lines = config?.lines ?? [];
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchFishermanConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      loop.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [pulse]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  const flashBanner = useCallback(
    async (title: string, sub?: string, hold = 1000) => {
      setBanner({ title, sub });
      bannerAnim.setValue(0);
      await new Promise<void>((r) => Animated.spring(bannerAnim, { toValue: 1, friction: 6, tension: 80, useNativeDriver: true }).start(() => r()));
      await wait(hold);
      await new Promise<void>((r) => Animated.timing(bannerAnim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => r()));
      if (mountedRef.current) setBanner(null);
    },
    [bannerAnim]
  );

  const countUp = useCallback(async (label: string, from: number, to: number) => {
    const steps = Math.min(28, Math.max(6, Math.round(to - from)));
    for (let i = 1; i <= steps; i++) {
      if (!mountedRef.current) return;
      setMeter({ label, amount: round2(from + ((to - from) * i) / steps), tone: 'win' });
      await wait(26);
    }
  }, []);

  /** Spins the reels to `target`, stopping left to right with the last landing at `lastAt` ms after `t0`. */
  const spinReelsTo = useCallback(
    async (target: Cell[][], t0: number, lastAt: number) => {
      const elapsed = Date.now() - t0;
      await Promise.all(target.map((rows, i) => reels[i].current?.land(rows, Math.max(0, lastAt - (4 - i) * 260 - elapsed))));
      if (mountedRef.current) setCells(target);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const spin = useCallback(async () => {
    if (busyRef.current || !config) return;
    if (bet > shownBalance) {
      showToast('Insufficient balance');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setWinLines([]);
    setCollecting(false);
    setMeter({ label: 'CASTING…', amount: null, tone: 'idle' });
    setShownBalance((b) => round2(b - bet));
    const t0 = Date.now();
    reels.forEach((r) => r.current?.start());

    let result: Awaited<ReturnType<typeof spinFisherman>>;
    try {
      result = await spinFisherman(bet);
    } catch (err) {
      reels.forEach((r, i) => r.current?.set(cells[i]));
      setShownBalance((b) => round2(b + bet));
      setMeter({ label: 'TIGHT LINES', amount: null, tone: 'idle' });
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome } = result;
    const payout = Number(result.spin.payout);
    const scale = (stakes: number) => round2(stakes * bet);

    // Base spin: the last reel lands no sooner than MIN_SPIN_MS after the press.
    const baseCells = cellsFor(config.baseStrips, outcome.stops, outcome.fishValues.map((r) => r.map(scale)));
    await spinReelsTo(baseCells, t0, MIN_SPIN_MS - 460);
    if (!mountedRef.current) return;
    setWinLines(outcome.lines);
    let shown = 0;
    if (outcome.baseWin > 0) {
      shown = scale(outcome.baseWin);
      await countUp('WIN', 0, shown);
      await wait(500);
    }

    // Free spins
    if (outcome.freeSpinsAwarded > 0) {
      await wait(400);
      await flashBanner(`${outcome.freeSpinsAwarded} FREE SPINS!`, `${outcome.boats} boats landed`, 1300);
      setWinLines([]);
      let state: FreeState = { active: true, played: 0, total: outcome.freeSpinsAwarded, collected: 0, multiplier: 1, won: 0 };
      setFree(state);
      for (const fs of outcome.freeSpins as FishFreeSpin[]) {
        if (!mountedRef.current) return;
        setWinLines([]);
        setCollecting(false);
        const ft0 = Date.now();
        reels.forEach((r) => r.current?.start());
        const target = cellsFor(config.freeStrips, fs.stops, fs.fishValues.map((r) => r.map(scale)));
        await spinReelsTo(target, ft0, FREE_SPIN_MS - 460);
        state = { ...state, played: state.played + 1 };
        setFree(state);
        if (fs.lines.length) setWinLines(fs.lines);
        const lineWin = scale(fs.win - fs.collect);
        if (lineWin > 0) {
          await countUp('WIN', shown, round2(shown + lineWin));
          shown = round2(shown + lineWin);
          state = { ...state, won: round2(state.won + lineWin) };
          setFree(state);
        }
        if (fs.fishermen > 0) {
          setCollecting(true);
          const got = scale(fs.collect);
          if (got > 0) {
            await flashBanner(`+${money(got)}`, `${fs.fishermen} fisherman${fs.fishermen > 1 ? 'men' : ''} collected${fs.multiplier > 1 ? ` · x${fs.multiplier}` : ''}`, 700);
            await countUp('WIN', shown, round2(shown + got));
            shown = round2(shown + got);
            state = { ...state, won: round2(state.won + got) };
          } else {
            await wait(500);
          }
          state = { ...state, collected: fs.collected };
          setFree(state);
        }
        if (fs.retrigger > 0) {
          const nextMult = multipliers[Math.min(Math.floor(fs.collected / perLevel), multipliers.length - 1)];
          await flashBanner(`+${fs.retrigger} FREE SPINS`, `Multiplier now x${nextMult}`, 1100);
          state = { ...state, total: state.total + fs.retrigger, multiplier: nextMult };
          setFree(state);
        }
        await wait(fs.win > 0 ? 450 : 250);
      }
      setCollecting(false);
      await flashBanner('FEATURE WIN', money(state.won), 1500);
      setFree(NO_FREE);
    }

    // Only a return above the stake is celebrated; a smaller one is shown plainly.
    if (payout > bet) {
      if (shown !== payout) await countUp('WIN', shown, payout);
      if (payout >= bet * 20 && outcome.freeSpinsAwarded === 0) await flashBanner(payout >= bet * 100 ? 'MEGA WIN' : 'BIG WIN', money(payout), 1300);
      setMeter({ label: 'WIN', amount: payout, tone: 'win' });
    } else if (payout > 0) {
      setMeter({ label: 'RETURNED', amount: payout, tone: 'return' });
    } else {
      setMeter({ label: 'NO CATCH', amount: null, tone: 'lose' });
    }

    setShownBalance((b) => round2(b + payout));
    setSessionNet((n) => round2(n + payout - bet));
    refreshWallet();
    if (panel === 'history') fetchFishermanHistory(30).then((h) => mountedRef.current && setHistory(h)).catch(() => {});
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
    // reels are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, bet, shownBalance, cells, panel, multipliers, perLevel, flashBanner, countUp, spinReelsTo, refreshWallet, showToast]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchFishermanHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  // ---------- layout ----------
  const cabW = Math.min(W - 12, 470);
  const frame = 10;
  const reelGap = 3;
  // Frame: 2px border + 4px padding on each side, then 4px padding inside; each reel window has a 1px border.
  const reelsW = cabW - frame * 2 - 20;
  const reelW = Math.floor((reelsW - reelGap * 4 - 10) / 5);
  const cell = Math.floor(Math.min(reelW * 1.02, 96));
  const reelsH = cell * 3;

  const litCells = useMemo(() => {
    const lit = [0, 1, 2, 3, 4].map(() => [false, false, false]);
    winLines.forEach((w) => lines[w.line]?.forEach((row, reel) => reel < w.count && (lit[reel][row] = true)));
    return lit;
  }, [winLines, lines]);
  const dimFor = (reel: number) => {
    if (collecting) return cells[reel].map((c) => c.s !== 'FISH' && c.s !== 'WILD');
    return winLines.length > 0 ? litCells[reel].map((x) => !x) : [false, false, false];
  };
  const glowFor = (reel: number) => (collecting ? cells[reel].map((c) => c.s === 'WILD') : [false, false, false]);

  const levelIndex = Math.min(Math.floor(free.collected / perLevel), multipliers.length - 1);
  const inLevel = levelIndex >= multipliers.length - 1 ? perLevel : free.collected % perLevel;
  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const pulseScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={free.active ? ['#060B2A', '#02040F'] : ['#1A0F3A', '#05030F']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
          <MaterialCommunityIcons name="fish" size={20} color={GOLD} />
          <Text style={styles.title}>FISHERMAN'S CATCH</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="wallet" size={15} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        <View style={[styles.cabinet, { width: cabW }]} onLayout={(e) => setSceneH(Math.round(e.nativeEvent.layout.height))}>
          {sceneH > 0 && <LakeScene w={cabW} h={sceneH} night={free.active} />}
          <View style={{ alignItems: 'center', marginTop: 6 }}>
            <Title width={cabW * 0.94} free={free.active} />
          </View>

          {/* Free spins bar: spins, multiplier and the Fisherman meter */}
          <View style={[styles.freeBar, { opacity: free.active ? 1 : 0 }]}>
            <View style={styles.freeBox}>
              <Text style={styles.freeLabel}>FREE SPINS</Text>
              <Text style={styles.freeValue}>
                {free.played}/{free.total}
              </Text>
            </View>
            <View style={styles.meterHooks}>
              {Array.from({ length: perLevel }, (_, i) => (
                <View key={i} style={[styles.hook, i < inLevel && styles.hookOn]}>
                  <MaterialCommunityIcons name="hook" size={14} color={i < inLevel ? '#2A1600' : '#7A6A40'} />
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: 3, marginLeft: 4 }}>
                {multipliers.slice(1).map((m, i) => (
                  <Text key={m} style={[styles.levelText, levelIndex >= i + 1 && styles.levelOn]}>
                    x{m}
                  </Text>
                ))}
              </View>
            </View>
            <Animated.View style={[styles.multBox, { transform: [{ scale: free.multiplier > 1 ? pulseScale : 1 }] }]}>
              <Text style={styles.multText}>x{free.multiplier}</Text>
            </Animated.View>
          </View>

          {/* Reels in a wooden frame */}
          <View style={[styles.reelFrame, { marginHorizontal: frame }]}>
            <LinearGradient colors={['#A0612E', WOOD, WOOD_DARK]} style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
            <View style={{ flexDirection: 'row', gap: reelGap, padding: 4 }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.reelWindow}>
                  <LinearGradient colors={free.active ? ['#1A2A5A', '#0E1A3A'] : ['#CFEFFF', '#8FD0F0', '#4FA8D8']} style={StyleSheet.absoluteFill} />
                  <Reel ref={reels[i]} reel={i} initial={START[i]} cell={cell} width={reelW} dimmed={dimFor(i)} glowing={glowFor(i)} free={free.active} bet={bet} />
                </View>
              ))}
            </View>
            {lines.length > 0 && (
              <Svg width={reelsW} height={reelsH + 2} style={{ position: 'absolute', left: 8, top: 8 }} pointerEvents="none">
                {winLines.map((w) => {
                  const pts = lines[w.line].map((row, reel) => `${reel * (reelW + 2 + reelGap) + reelW / 2 + 1},${row * cell + cell / 2 + 1}`).join(' ');
                  return (
                    <G key={w.line}>
                      <Polyline points={pts} fill="none" stroke={LINE_COLORS[w.line]} strokeOpacity={0.35} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
                      <Polyline points={pts} fill="none" stroke={LINE_COLORS[w.line]} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
                    </G>
                  );
                })}
              </Svg>
            )}
          </View>

          {/* Win meter */}
          <View style={[styles.meterRow, { marginBottom: 10 }]}>
            <View style={styles.meter}>
              <Text style={[styles.meterLabel, meter.tone === 'win' && { color: '#7CFF9A' }]}>{meter.label}</Text>
              <Text style={[styles.meterValue, meter.tone === 'win' && { color: '#7CFF9A' }, meter.tone === 'return' && { color: '#FFD9A0' }]} numberOfLines={1} adjustsFontSizeToFit>
                {meter.amount === null ? '— — —' : money(meter.amount)}
              </Text>
            </View>
            {free.active && (
              <View style={[styles.meter, { flex: 0.8 }]}>
                <Text style={[styles.meterLabel, { color: GOLD }]}>FEATURE</Text>
                <Text style={[styles.meterValue, { color: GOLD }]} numberOfLines={1} adjustsFontSizeToFit>
                  {money(free.won)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Line wins */}
        <View style={[styles.lineWinsRow, { width: cabW }]}>
          {winLines.length === 0 ? (
            <Text style={styles.lineWinHint}>{lineCount} lines · 3+ boats start free spins</Text>
          ) : (
            winLines.map((w) => (
              <View key={w.line} style={[styles.lineChip, { borderColor: LINE_COLORS[w.line] }]}>
                <Text style={[styles.lineChipText, { color: LINE_COLORS[w.line] }]}>
                  L{w.line + 1} {w.count}×
                </Text>
                <FishArt s={w.symbol} size={18} />
                <Text style={styles.lineChipText}>{money(round2((w.pays * bet) / lineCount))}</Text>
              </View>
            ))
          )}
        </View>

        {/* Session (UK: time played and net position, always on show) */}
        <View style={[styles.session, { width: cabW }]}>
          <MaterialCommunityIcons name="timer-outline" size={15} color="#B9C3D6" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>·</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? '#7CFF9A' : sessionNet < 0 ? '#FF9AA6' : '#B9C3D6' }]}>
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
          <Pressable onPress={spin} disabled={busy || !config} style={({ pressed }) => [styles.spinWrap, pressed && { transform: [{ scale: 0.95 }] }]}>
            <LinearGradient colors={busy || !config ? ['#3A4A5A', '#1A2A3A'] : ['#5FD0FF', '#1E88E5', '#0B3A7A']} style={styles.spinBtn}>
              {busy ? (
                <Text style={styles.spinText}>…</Text>
              ) : (
                <>
                  <MaterialCommunityIcons name="fish" size={22} color="#FFFFFF" />
                  <Text style={styles.spinText}>CAST</Text>
                </>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={openHistory} style={styles.sideBtn} hitSlop={6}>
            <MaterialCommunityIcons name="history" size={20} color={GOLD} />
            <Text style={styles.sideBtnText}>HISTORY</Text>
          </Pressable>
        </View>

        <Text style={styles.footNote}>
          RTP {config ? `${config.rtpPercent}%` : '—'} · bet {money(minStake)}–{money(maxStake)} · max win {money(config?.maxPayout ?? 10000)} per spin{'\n'}
          No autoplay or turbo · each paid spin takes at least 2.5 seconds · provably fair
        </Text>
      </ScrollView>

      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
        >
          <LinearGradient colors={['#FFF4B8', '#FFC93C', '#C07800']} style={styles.bannerInner}>
            <Text style={styles.bannerText}>{banner.title}</Text>
            {banner.sub ? <Text style={styles.bannerSub}>{banner.sub}</Text> : null}
          </LinearGradient>
        </Animated.View>
      )}

      {toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={panel !== null} transparent animationType="fade" onRequestClose={() => setPanel(null)}>
        <Pressable style={styles.modalBack} onPress={() => setPanel(null)}>
          <Pressable style={[styles.modalCard, { width: Math.min(W - 24, 440) }]} onPress={() => {}}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>{panel === 'pay' ? 'PAYTABLE' : 'MY SPINS'}</Text>
              <Pressable onPress={() => setPanel(null)} hitSlop={8}>
                <MaterialCommunityIcons name="close" size={22} color="#FFFFFF" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'pay' ? <Paytable bet={bet} config={config} /> : <History spins={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PAY_ORDER: FishSymbol[] = ['ROD', 'TACKLE', 'LURE', 'FISH', 'ACE', 'KING', 'QUEEN', 'JACK'];

function Paytable({ bet, config }: { bet: number; config: FishermanConfig | null }) {
  if (!config) return <Text style={styles.payNote}>Loading…</Text>;
  const lineBet = bet / config.lineCount;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.payNote}>
        Your bet of {money(bet)} plays all {config.lineCount} lines ({money(lineBet)} each). Wins pay left to right from the first reel; prizes are per line at this bet.
      </Text>
      <View style={styles.payHead}>
        <Text style={[styles.payHeadText, { flex: 1 }]} />
        {['3×', '4×', '5×'].map((h) => (
          <Text key={h} style={styles.payHeadText}>
            {h}
          </Text>
        ))}
      </View>
      {PAY_ORDER.map((sym) => {
        const p = config.pays[sym];
        if (!p) return null;
        return (
          <View key={sym} style={styles.payRow}>
            <View style={{ flex: 1 }}>
              <FishArt s={sym} size={34} />
            </View>
            {p.map((x, i) => (
              <Text key={i} style={styles.payValue}>
                {money(round2(x * lineBet))}
              </Text>
            ))}
          </View>
        );
      })}
      <Text style={styles.paySection}>FREE SPINS</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FishArt s="BONUS" size={40} />
        <Text style={styles.payNote}>
          3, 4 or 5 boats anywhere start {config.freeSpinsFor['3']}, {config.freeSpinsFor['4']} or {config.freeSpinsFor['5']} free spins (about one spin in {Math.round(100 / config.featureChancePercent)}).
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FishArt s="WILD" size={40} />
        <Text style={styles.payNote}>
          In free spins the Fisherman is wild and collects the cash on every fish on screen. Every {config.fishermenPerLevel} Fishermen collected add {config.retriggerSpins} free spins and raise the multiplier to x
          {config.multipliers.slice(1).join(', then x')}.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FishArt s="FISH" size={40} value={bet} />
        <Text style={styles.payNote}>Fish carry {config.fishValues.map((f) => `${f.value}x`).join(', ')} your bet.</Text>
      </View>
      <Text style={styles.payNote}>RTP {config.rtpPercent}%. Results come from your provably-fair seeds on the server.</Text>
    </View>
  );
}

function History({ spins }: { spins: FishermanSpinRow[] | null }) {
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
            <Text style={styles.histTags}>{s.freeSpins > 0 ? `${s.freeSpins} FREE` : ''}</Text>
            <Text style={[styles.histWin, { color: pay > stake ? '#7CFF9A' : pay > 0 ? '#FFD9A0' : '#7A8090' }]}>{pay > 0 ? money(pay) : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05030F' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  title: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: 'rgba(255,209,102,0.12)', borderWidth: 1, borderColor: 'rgba(255,209,102,0.4)' },
  balanceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  cabinet: { borderRadius: 22, borderWidth: 3, borderColor: GOLD_DEEP, overflow: 'hidden', marginTop: 4 },
  freeBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 40, marginBottom: 4 },
  freeBox: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, borderWidth: 1, borderColor: GOLD },
  freeLabel: { color: GOLD, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  freeValue: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  meterHooks: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 14, paddingHorizontal: 8, paddingVertical: 4 },
  hook: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#2A2410', borderWidth: 1, borderColor: '#7A6A40', alignItems: 'center', justifyContent: 'center' },
  hookOn: { backgroundColor: '#FFC93C', borderColor: '#FFF3B0' },
  levelText: { color: '#6A6050', fontSize: 11, fontWeight: '900' },
  levelOn: { color: GOLD },
  multBox: { backgroundColor: '#C0392B', borderRadius: 12, borderWidth: 2, borderColor: GOLD, paddingHorizontal: 12, paddingVertical: 4 },
  multText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  reelFrame: { borderRadius: 14, borderWidth: 2, borderColor: WOOD_DARK, padding: 4 },
  reelWindow: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(0,0,0,0.35)' },
  fishTag: { position: 'absolute', alignSelf: 'center', backgroundColor: '#FFC93C', borderRadius: 8, borderWidth: 1.5, borderColor: '#8A5A00', paddingVertical: 1 },
  fishTagText: { color: '#3A1F00', fontWeight: '900' },
  meterRow: { flexDirection: 'row', gap: 6, marginHorizontal: 12, marginTop: 8 },
  meter: { flex: 1, borderRadius: 10, borderWidth: 2, borderColor: '#2A3A4A', backgroundColor: 'rgba(4,10,20,0.85)', paddingHorizontal: 10, paddingVertical: 3 },
  meterLabel: { color: '#5FD0FF', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  meterValue: { color: '#5FD0FF', fontSize: 20, fontWeight: '900', fontVariant: ['tabular-nums'] },
  lineWinsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8, minHeight: 26 },
  lineWinHint: { color: '#A9B6CC', fontSize: 11, fontWeight: '700' },
  lineChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.35)' },
  lineChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  sessionText: { color: '#B9C3D6', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sessionSep: { color: '#5A6070', fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 4 },
  sideBtn: { alignItems: 'center', gap: 2, width: 58 },
  sideBtnText: { color: GOLD, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  betBox: { alignItems: 'center', gap: 4 },
  betLabel: { color: '#A9B6CC', fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0E1A2A', borderRadius: 20, borderWidth: 1.5, borderColor: GOLD_DEEP, paddingHorizontal: 6, paddingVertical: 4 },
  betBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#1E3A5A', alignItems: 'center', justifyContent: 'center' },
  betValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', minWidth: 70, textAlign: 'center' },
  dim: { opacity: 0.4 },
  spinWrap: { borderRadius: 40, borderWidth: 4, borderColor: GOLD, shadowColor: '#5FD0FF', shadowOpacity: 0.8, shadowRadius: 12, elevation: 8 },
  spinBtn: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  spinText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  footNote: { color: '#7A8090', fontSize: 10, textAlign: 'center', marginTop: 14, lineHeight: 15, paddingHorizontal: 16 },
  banner: { position: 'absolute', top: '30%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 26, paddingVertical: 12, borderRadius: 18, borderWidth: 3, borderColor: '#FFF8D0', alignItems: 'center' },
  bannerText: { color: '#3A1A00', fontSize: 28, fontWeight: '900', fontStyle: 'italic', letterSpacing: 1 },
  bannerSub: { color: '#5A2E00', fontSize: 13, fontWeight: '800', marginTop: 2 },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#0B1424', borderRadius: 18, borderWidth: 2, borderColor: GOLD_DEEP, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: GOLD, fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  payHead: { flexDirection: 'row', alignItems: 'center' },
  payHeadText: { color: GOLD, fontSize: 11, fontWeight: '900', width: 74, textAlign: 'right' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,209,102,0.15)' },
  payValue: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', width: 74, textAlign: 'right' },
  paySection: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 8 },
  payNote: { color: '#C8D2E2', fontSize: 12, lineHeight: 17, flexShrink: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  histTime: { color: '#98A0B0', fontSize: 11, width: 82 },
  histStake: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', width: 70 },
  histTags: { color: GOLD, fontSize: 10, fontWeight: '900', flex: 1 },
  histWin: { fontSize: 12, fontWeight: '900' },
});
