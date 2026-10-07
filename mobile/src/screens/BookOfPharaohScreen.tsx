import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { forwardRef, memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient as SvgLinearGradient, Path, Polygon, Polyline, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiClientError } from '../api/client';
import { BookOfPharaohConfig, PharaohFreeSpin, PharaohLineWin, PharaohSpinRow, PharaohSymbol, fetchBookOfPharaohConfig, fetchBookOfPharaohHistory, spinBookOfPharaoh } from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const GOLD = '#F5C542';
const GOLD_LIGHT = '#FFF1B0';
const GOLD_DEEP = '#9A6A10';
const STONE = '#4A3A26';
const STONE_DARK = '#241A0E';
const LAPIS = '#1E4FA8';
const SERIF = 'serif';
const BET_LEVELS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const DEFAULT_BET = 10;
const TOAST_MS = 1800;
/** UK rule: a paid spin may not resolve faster than this, press to result. */
const MIN_SPIN_MS = 2500;
const FREE_SPIN_MS = 2100;
const LINE_COLORS = ['#FF3B4E', '#FFD23F', '#2FE07A', '#22B8FF', '#FF7AE0', '#FF9A3C', '#9B7BFF', '#3CF0D0', '#FF5FA0', '#B8F04A'];
const FILLER: PharaohSymbol[] = ['TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'ANKH', 'SCARAB', 'EYE', 'PHARAOH', 'BOOK'];
const SPECIAL_POOL: PharaohSymbol[] = ['TEN', 'JACK', 'QUEEN', 'KING', 'ACE', 'ANKH', 'SCARAB', 'EYE', 'PHARAOH'];
const NAMES: Record<PharaohSymbol, string> = {
  TEN: '10',
  JACK: 'Jack',
  QUEEN: 'Queen',
  KING: 'King',
  ACE: 'Ace',
  ANKH: 'Ankh',
  SCARAB: 'Scarab',
  EYE: 'Eye of Horus',
  PHARAOH: 'Pharaoh',
  BOOK: 'Book',
};

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

function windowFor(strips: PharaohSymbol[][], stops: number[]): PharaohSymbol[][] {
  return stops.map((stop, r) => [-1, 0, 1].map((d) => strips[r][wrap(strips[r].length, stop + d)]));
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- symbol art ----------
// Every symbol is drawn on a 100 x 100 canvas.

const RANK: Partial<Record<PharaohSymbol, { text: string; c: [string, string, string] }>> = {
  ACE: { text: 'A', c: ['#FFB0A0', '#D2341E', '#6A0A00'] },
  KING: { text: 'K', c: ['#A8D8FF', '#1E6FD2', '#0A2A6A'] },
  QUEEN: { text: 'Q', c: ['#B8F0C8', '#1E9A50', '#0A4020'] },
  JACK: { text: 'J', c: ['#E8C0FF', '#8A30C8', '#3A0A60'] },
  TEN: { text: '10', c: ['#FFE6A0', '#D88A10', '#6A3A00'] },
};

export const PharaohArt = memo(function PharaohArt({ s, size, dim, glow }: { s: PharaohSymbol; size: number; dim?: boolean; glow?: boolean }) {
  // Ids must be unique per drawing: a gradient defined in a hidden screen doesn't paint on web.
  const u = `bp${s}${useId().replace(/:/g, '')}`;
  const rank = RANK[s];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" opacity={dim ? 0.3 : 1}>
      <Defs>
        <SvgLinearGradient id={`${u}g`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="0.45" stopColor={GOLD} />
          <Stop offset="1" stopColor={GOLD_DEEP} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}lap`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#6FA8FF" />
          <Stop offset="1" stopColor="#0E2A6A" />
        </SvgLinearGradient>
        <RadialGradient id={`${u}glow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF6C0" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#F5C542" stopOpacity={0} />
        </RadialGradient>
        <SvgLinearGradient id={`${u}scar`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#5FE0C0" />
          <Stop offset="0.5" stopColor="#0E8A7A" />
          <Stop offset="1" stopColor="#063A40" />
        </SvgLinearGradient>
        <SvgLinearGradient id={`${u}book`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#B8432A" />
          <Stop offset="1" stopColor="#4A120A" />
        </SvgLinearGradient>
        {rank && (
          <SvgLinearGradient id={`${u}r`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={rank.c[0]} />
            <Stop offset="0.5" stopColor={rank.c[1]} />
            <Stop offset="1" stopColor={rank.c[2]} />
          </SvgLinearGradient>
        )}
      </Defs>
      {glow && <Circle cx={50} cy={50} r={50} fill={`url(#${u}glow)`} />}
      {rank && (
        <G>
          <SvgText x={51} y={74} fontSize={rank.text.length > 1 ? 56 : 70} fontWeight="900" fontFamily={SERIF} fill="#2A1A06" opacity={0.4} textAnchor="middle">
            {rank.text}
          </SvgText>
          <SvgText x={50} y={72} fontSize={rank.text.length > 1 ? 56 : 70} fontWeight="900" fontFamily={SERIF} fill={`url(#${u}r)`} stroke={GOLD} strokeWidth={2.5} textAnchor="middle">
            {rank.text}
          </SvgText>
        </G>
      )}
      {s === 'ANKH' && (
        <G>
          <Ellipse cx={50} cy={28} rx={15} ry={19} fill="none" stroke={`url(#${u}g)`} strokeWidth={9} />
          <Rect x={18} y={44} width={64} height={11} rx={3} fill={`url(#${u}g)`} />
          <Path d="M44 52 L 56 52 L 60 94 L 40 94 Z" fill={`url(#${u}g)`} />
          <Ellipse cx={50} cy={28} rx={15} ry={19} fill="none" stroke={GOLD_DEEP} strokeWidth={1.2} />
          <Rect x={46} y={60} width={8} height={4} fill={LAPIS} />
          <Rect x={47} y={70} width={6} height={4} fill="#C0392B" />
        </G>
      )}
      {s === 'SCARAB' && (
        <G>
          <Path d="M14 46 C 4 40, 4 22, 14 18 M86 46 C 96 40, 96 22, 86 18 M18 70 C 6 76, 8 90, 16 92 M82 70 C 94 76, 92 90, 84 92" stroke={GOLD_DEEP} strokeWidth={3} fill="none" strokeLinecap="round" />
          <Ellipse cx={50} cy={22} rx={14} ry={9} fill={`url(#${u}g)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
          <Ellipse cx={50} cy={60} rx={30} ry={33} fill={`url(#${u}scar)`} stroke={GOLD} strokeWidth={3} />
          <Path d="M50 28 L 50 93" stroke={GOLD} strokeWidth={2.5} />
          <Path d="M24 50 C 34 44, 44 44, 50 48 C 56 44, 66 44, 76 50" stroke={GOLD} strokeWidth={2} fill="none" />
          <Ellipse cx={38} cy={58} rx={5} ry={10} fill="#FFFFFF" opacity={0.25} />
        </G>
      )}
      {s === 'EYE' && (
        <G>
          <Path d="M8 46 C 28 22, 72 22, 92 46 C 72 66, 28 66, 8 46 Z" fill="#FFF8E8" stroke={LAPIS} strokeWidth={5} />
          <Circle cx={50} cy={45} r={14} fill={`url(#${u}lap)`} stroke={GOLD} strokeWidth={2} />
          <Circle cx={50} cy={45} r={6} fill="#0A0A1A" />
          <Circle cx={46} cy={41} r={3} fill="#FFFFFF" opacity={0.8} />
          <Path d="M10 30 C 30 14, 70 14, 92 30" stroke={LAPIS} strokeWidth={6} fill="none" strokeLinecap="round" />
          <Path d="M42 62 L 38 90" stroke={LAPIS} strokeWidth={6} strokeLinecap="round" />
          <Path d="M58 62 C 64 72, 76 74, 82 70 C 84 80, 74 86, 66 82" stroke={LAPIS} strokeWidth={5} fill="none" strokeLinecap="round" />
          <Path d="M8 46 C 28 22, 72 22, 92 46" stroke={GOLD} strokeWidth={1.5} fill="none" />
        </G>
      )}
      {s === 'PHARAOH' && (
        <G>
          <Path d="M50 6 C 24 6, 14 28, 14 48 L 8 92 L 92 92 L 86 48 C 86 28, 76 6, 50 6 Z" fill={`url(#${u}g)`} stroke={GOLD_DEEP} strokeWidth={2} />
          {[16, 26, 36, 46, 56, 66, 76].map((y) => (
            <G key={y}>
              <Path d={`M${14 - (y - 16) * 0.12} ${y + 14} L 30 ${y + 14}`} stroke={LAPIS} strokeWidth={4} />
              <Path d={`M70 ${y + 14} L ${86 + (y - 16) * 0.12} ${y + 14}`} stroke={LAPIS} strokeWidth={4} />
            </G>
          ))}
          <Path d="M30 30 C 30 20, 70 20, 70 30 L 70 64 C 70 78, 30 78, 30 64 Z" fill="#E8B048" stroke={GOLD_DEEP} strokeWidth={1.5} />
          <Path d="M36 42 L 46 42 M54 42 L 64 42" stroke="#1A1A2A" strokeWidth={4} strokeLinecap="round" />
          <Path d="M34 38 L 48 38 M52 38 L 66 38" stroke={LAPIS} strokeWidth={2} />
          <Path d="M50 46 L 47 56 L 53 56" stroke={GOLD_DEEP} strokeWidth={2} fill="none" />
          <Path d="M43 63 C 47 66, 53 66, 57 63" stroke="#8A3A1A" strokeWidth={2.5} fill="none" strokeLinecap="round" />
          <Rect x={45} y={74} width={10} height={16} rx={2} fill={LAPIS} stroke={GOLD} strokeWidth={1.5} />
          <Path d="M44 14 C 46 8, 54 8, 56 14 L 50 22 Z" fill="#C0392B" stroke={GOLD_DEEP} strokeWidth={1} />
        </G>
      )}
      {s === 'BOOK' && (
        <G>
          <Rect x={14} y={12} width={72} height={80} rx={6} fill="#2A0A06" transform="translate(4 3)" opacity={0.5} />
          <Rect x={14} y={12} width={72} height={80} rx={6} fill={`url(#${u}book)`} stroke={GOLD} strokeWidth={3} />
          <Rect x={80} y={16} width={6} height={72} fill="#F4E4C0" />
          <Rect x={20} y={18} width={60} height={68} rx={3} fill="none" stroke={GOLD} strokeWidth={1.5} />
          <Ellipse cx={50} cy={52} rx={16} ry={18} fill={`url(#${u}g)`} stroke={GOLD_DEEP} strokeWidth={1.5} />
          <Path d="M50 36 L 50 70 M38 48 C 44 44, 56 44, 62 48" stroke={GOLD_DEEP} strokeWidth={2} fill="none" />
          <Path d="M30 40 C 22 34, 22 24, 30 22 M70 40 C 78 34, 78 24, 70 22" stroke={GOLD} strokeWidth={2.5} fill="none" />
          {[24, 76].map((x) => (
            <Circle key={x} cx={x} cy={80} r={3} fill={GOLD} />
          ))}
        </G>
      )}
    </Svg>
  );
});

// ---------- reels ----------

type ReelHandle = {
  start: () => void;
  land: (rows: PharaohSymbol[], delay: number) => Promise<void>;
  set: (rows: PharaohSymbol[]) => void;
};

const LOOP_CELLS = 16;
const LAND_CELLS = 10;
const filler = () => FILLER[Math.floor(Math.random() * FILLER.length)];

const Reel = forwardRef(function Reel({ initial, cell, width, dimmed, glowing }: { initial: PharaohSymbol[]; cell: number; width: number; dimmed: boolean[]; glowing: boolean[] }, ref: React.Ref<ReelHandle>) {
  const [content, setContent] = useState<PharaohSymbol[]>(initial);
  const y = useRef(new Animated.Value(0)).current;
  const pending = useRef<null | { kind: 'loop' } | { kind: 'land'; resolve: () => void; rows: PharaohSymbol[] }>(null);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const contentRef = useRef(content);
  contentRef.current = content;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const loop = Animated.loop(Animated.timing(y, { toValue: 0, duration: 460, easing: Easing.linear, useNativeDriver: true }));
      loopRef.current = loop;
      loop.start();
      return;
    }
    y.setValue(-(content.length - 3) * cell);
    Animated.timing(y, { toValue: 0, duration: 460, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start(() => {
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
        {content.map((s, i) => (
          <View key={i} style={{ width, height: cell, alignItems: 'center', justifyContent: 'center' }}>
            <PharaohArt s={s} size={Math.min(width, cell) * 0.88} dim={settled && dimmed[i]} glow={settled && glowing[i]} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
});

/** The special symbol filling a whole reel: a gold-lit column that unrolls from the middle. */
function ExpandColumn({ s, width, height, progress }: { s: PharaohSymbol; width: number; height: number; progress: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ scaleY: progress }], opacity: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }) }}
    >
      <LinearGradient colors={['#FFE89A', '#F5C542', '#C88A10', '#F5C542', '#FFE89A']} style={[StyleSheet.absoluteFill, { borderRadius: 6 }]} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'space-around', paddingVertical: 4 }}>
        {[0, 1, 2].map((i) => (
          <PharaohArt key={i} s={s} size={Math.min(width, height / 3) * 0.88} />
        ))}
      </View>
    </Animated.View>
  );
}

// ---------- scenery ----------

/** Temple hall: sandstone walls, two carved pillars, a winged sun above, and night sky in free spins. */
const Temple = memo(function Temple({ w, h, night }: { w: number; h: number; night: boolean }) {
  const u = useId().replace(/:/g, '');
  const pillar = w * 0.1;
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <SvgLinearGradient id={`bpWall${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={night ? '#140A30' : '#6A4A22'} />
          <Stop offset="0.55" stopColor={night ? '#2A1650' : '#4A3218'} />
          <Stop offset="1" stopColor={STONE_DARK} />
        </SvgLinearGradient>
        <SvgLinearGradient id={`bpPil${u}`} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#5A4020" />
          <Stop offset="0.5" stopColor="#B88A48" />
          <Stop offset="1" stopColor="#4A3218" />
        </SvgLinearGradient>
        <RadialGradient id={`bpSun${u}`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFF6C0" />
          <Stop offset="0.6" stopColor={GOLD} />
          <Stop offset="1" stopColor={GOLD_DEEP} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#bpWall${u})`} />
      {night &&
        Array.from({ length: 36 }, (_, i) => <Circle key={i} cx={((i * 61) % 100) * (w / 100)} cy={((i * 29) % 30) * (h / 100)} r={(i % 3) * 0.5 + 0.6} fill="#FFFFFF" opacity={0.7} />)}
      {/* Wall courses */}
      {Array.from({ length: 12 }, (_, i) => (
        <Rect key={i} x={0} y={(i * h) / 12} width={w} height={1} fill="#000000" opacity={night ? 0.15 : 0.18} />
      ))}
      {/* Pillars */}
      {[0, w - pillar].map((x) => (
        <G key={x}>
          <Rect x={x} y={0} width={pillar} height={h} fill={`url(#bpPil${u})`} />
          {Array.from({ length: Math.floor(h / 26) }, (_, i) => (
            <G key={i}>
              <Rect x={x + pillar * 0.3} y={14 + i * 26} width={pillar * 0.4} height={3} fill="#2A1A08" opacity={0.45} />
              <Circle cx={x + pillar * 0.5} cy={22 + i * 26} r={2.2} fill="#2A1A08" opacity={0.45} />
            </G>
          ))}
          <Rect x={x - 2} y={0} width={pillar + 4} height={10} fill="#C89A50" />
        </G>
      ))}
      {/* Winged sun */}
      <G>
        <Path d={`M${w / 2 - 14} 30 C ${w / 2 - 60} 18, ${w / 2 - 110} 26, ${w / 2 - 130} 36 C ${w / 2 - 100} 40, ${w / 2 - 50} 40, ${w / 2 - 14} 38 Z`} fill={GOLD} opacity={0.85} />
        <Path d={`M${w / 2 + 14} 30 C ${w / 2 + 60} 18, ${w / 2 + 110} 26, ${w / 2 + 130} 36 C ${w / 2 + 100} 40, ${w / 2 + 50} 40, ${w / 2 + 14} 38 Z`} fill={GOLD} opacity={0.85} />
        <Circle cx={w / 2} cy={34} r={14} fill={`url(#bpSun${u})`} stroke={GOLD_DEEP} strokeWidth={1.5} />
      </G>
    </Svg>
  );
});

/** A wall torch with a flickering flame. */
function Torch({ flicker }: { flicker: Animated.Value }) {
  return (
    <View style={{ width: 22, height: 48, alignItems: 'center' }}>
      <Animated.View style={{ transform: [{ scaleY: flicker.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.15] }) }, { scaleX: flicker.interpolate({ inputRange: [0, 1], outputRange: [1.05, 0.92] }) }] }}>
        <Svg width={22} height={26} viewBox="0 0 22 26">
          <Path d="M11 0 C 18 8, 20 14, 18 19 C 16 24, 6 24, 4 19 C 2 14, 6 8, 11 0 Z" fill="#FF7A1A" />
          <Path d="M11 8 C 15 12, 15 16, 14 19 C 12 22, 9 22, 8 19 C 7 16, 8 12, 11 8 Z" fill="#FFE36B" />
        </Svg>
      </Animated.View>
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Path d="M3 0 L 19 0 L 14 8 L 8 8 Z" fill={GOLD_DEEP} />
        <Rect x={9} y={8} width={4} height={14} fill="#5A3A18" />
      </Svg>
    </View>
  );
}

function Title({ width, free }: { width: number; free: boolean }) {
  const u = useId().replace(/:/g, '');
  return (
    <Svg width={width} height={width * 0.2} viewBox="0 0 360 72">
      <Defs>
        <SvgLinearGradient id={`bpT${u}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={GOLD_LIGHT} />
          <Stop offset="0.5" stopColor={GOLD} />
          <Stop offset="1" stopColor={GOLD_DEEP} />
        </SvgLinearGradient>
      </Defs>
      <SvgText x={182} y={40} fontSize={34} fontWeight="900" fontFamily={SERIF} fill="#1A0E04" textAnchor="middle" letterSpacing={2}>
        BOOK OF PHARAOH
      </SvgText>
      <SvgText x={180} y={38} fontSize={34} fontWeight="900" fontFamily={SERIF} fill={`url(#bpT${u})`} stroke="#5A3A08" strokeWidth={1} textAnchor="middle" letterSpacing={2}>
        BOOK OF PHARAOH
      </SvgText>
      <SvgText x={180} y={62} fontSize={11} fontWeight="900" fontFamily={SERIF} fill={free ? '#E8D8FF' : '#F4E4C0'} textAnchor="middle" letterSpacing={3}>
        {free ? 'FREE SPINS · SYMBOL EXPANDS' : '10 LINES · 3 BOOKS OPEN THE TOMB'}
      </SvgText>
    </Svg>
  );
}

/** Home tile art: the book under the winged sun, flanked by the pharaoh's gold. */
export function BookOfPharaohTileArt({ size }: { size: number }) {
  return (
    <View style={{ position: 'absolute', top: 0, left: 0, width: size, height: size }} pointerEvents="none">
      <Temple w={size} h={size} night={false} />
      <View style={{ position: 'absolute', left: size * 0.2, top: size * 0.12 }}>
        <PharaohArt s="BOOK" size={size * 0.6} glow />
      </View>
    </View>
  );
}

/** Opening the book: its pages flick through the symbols and stop on the special one. */
function BookOpening({ special, onDone }: { special: PharaohSymbol; onDone: () => void }) {
  const [shown, setShown] = useState<PharaohSymbol>('ANKH');
  const [done, setDone] = useState(false);
  const open = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let alive = true;
    Animated.timing(open, { toValue: 1, duration: 500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    (async () => {
      await wait(500);
      // Flick fast, then slow down onto the special symbol.
      const delays = [70, 70, 70, 80, 80, 90, 100, 110, 130, 150, 180, 220, 270, 330];
      for (let i = 0; i < delays.length; i++) {
        if (!alive) return;
        setShown(i === delays.length - 1 ? special : SPECIAL_POOL[(i * 4 + 3) % SPECIAL_POOL.length]);
        await wait(delays[i]);
      }
      if (!alive) return;
      setDone(true);
      await wait(1400);
      if (alive) onDone();
    })();
    return () => {
      alive = false;
    };
    // Runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={styles.bookOverlay} pointerEvents="none">
      <Animated.View style={{ transform: [{ scale: open.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }], opacity: open }}>
        <View style={styles.bookOpen}>
          <LinearGradient colors={['#F8EBCB', '#E6CF98']} style={styles.page}>
            <Text style={styles.pageHiero}>☥ ✦ ☥{'\n'}✦ ☥ ✦</Text>
          </LinearGradient>
          <View style={styles.spine} />
          <LinearGradient colors={['#E6CF98', '#F8EBCB']} style={[styles.page, { alignItems: 'center', justifyContent: 'center' }]}>
            <PharaohArt s={shown} size={96} glow={done} />
          </LinearGradient>
        </View>
        <Text style={styles.bookCaption}>{done ? `${NAMES[special].toUpperCase()} WILL EXPAND` : 'CHOOSING THE SPECIAL SYMBOL…'}</Text>
      </Animated.View>
    </View>
  );
}

// ---------- screen ----------

const START: PharaohSymbol[][] = [
  ['ACE', 'PHARAOH', 'KING'],
  ['QUEEN', 'BOOK', 'ANKH'],
  ['EYE', 'PHARAOH', 'TEN'],
  ['JACK', 'BOOK', 'SCARAB'],
  ['KING', 'PHARAOH', 'ACE'],
];

type FreeState = { active: boolean; played: number; total: number; won: number; special: PharaohSymbol | null };
const NO_FREE: FreeState = { active: false, played: 0, total: 0, won: 0, special: null };

export default function BookOfPharaohScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: W } = useWindowDimensions();
  const { coins, refreshWallet } = useGameState();

  const [config, setConfig] = useState<BookOfPharaohConfig | null>(null);
  const [bet, setBet] = useState(DEFAULT_BET);
  const [busy, setBusy] = useState(false);
  const [shownBalance, setShownBalance] = useState(coins);
  const [meter, setMeter] = useState<{ label: string; amount: number | null; tone: 'idle' | 'win' | 'return' | 'lose' }>({ label: 'MAY RA GUIDE YOU', amount: null, tone: 'idle' });
  const [winLines, setWinLines] = useState<PharaohLineWin[]>([]);
  const [bookGlow, setBookGlow] = useState(false);
  const [expand, setExpand] = useState<{ reels: number[]; s: PharaohSymbol } | null>(null);
  const [free, setFree] = useState<FreeState>(NO_FREE);
  const [opening, setOpening] = useState<{ special: PharaohSymbol; done: () => void } | null>(null);
  const [banner, setBanner] = useState<{ title: string; sub?: string } | null>(null);
  const [panel, setPanel] = useState<'pay' | 'history' | null>(null);
  const [history, setHistory] = useState<PharaohSpinRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sessionNet, setSessionNet] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [rows, setRows] = useState<PharaohSymbol[][]>(START);
  const [sceneH, setSceneH] = useState(0);

  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const sessionStart = useRef(Date.now());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerAnim = useRef(new Animated.Value(0)).current;
  const flicker = useRef(new Animated.Value(0)).current;
  const scarabSpin = useRef(new Animated.Value(0)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;
  const reels = [useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null), useRef<ReelHandle>(null)];

  const lineCount = config?.lineCount ?? 10;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;
  const lines = config?.lines ?? [];
  const betLevels = useMemo(() => BET_LEVELS.filter((b) => b >= minStake && b <= maxStake), [minStake, maxStake]);

  useEffect(() => {
    if (!busyRef.current) setShownBalance(coins);
  }, [coins]);

  useEffect(() => {
    mountedRef.current = true;
    fetchBookOfPharaohConfig()
      .then((c) => mountedRef.current && setConfig(c))
      .catch(() => mountedRef.current && setToast('Could not load the game — check your connection.'));
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const torch = Animated.loop(
      Animated.sequence([
        Animated.timing(flicker, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.3, duration: 140, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0.8, duration: 200, useNativeDriver: true }),
        Animated.timing(flicker, { toValue: 0, duration: 160, useNativeDriver: true }),
      ])
    );
    torch.start();
    return () => {
      mountedRef.current = false;
      clearInterval(clock);
      torch.stop();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [flicker]);

  const showToast = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

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

  /** Spins all reels to `target`, stopping left to right with the last landing `lastAt` ms after `t0`. */
  const spinTo = useCallback(
    async (target: PharaohSymbol[][], t0: number, lastAt: number) => {
      const elapsed = Date.now() - t0;
      await Promise.all(target.map((r, i) => reels[i].current?.land(r, Math.max(0, lastAt - (4 - i) * 260 - elapsed))));
      if (mountedRef.current) setRows(target);
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
    setExpand(null);
    setBookGlow(false);
    setMeter({ label: 'THE REELS TURN…', amount: null, tone: 'idle' });
    setShownBalance((b) => round2(b - bet));
    const t0 = Date.now();
    scarabSpin.setValue(0);
    Animated.timing(scarabSpin, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    reels.forEach((r) => r.current?.start());

    let result: Awaited<ReturnType<typeof spinBookOfPharaoh>>;
    try {
      result = await spinBookOfPharaoh(bet);
    } catch (err) {
      reels.forEach((r, i) => r.current?.set(rows[i]));
      setShownBalance((b) => round2(b + bet));
      setMeter({ label: 'MAY RA GUIDE YOU', amount: null, tone: 'idle' });
      showToast(errorMessage(err));
      busyRef.current = false;
      setBusy(false);
      return;
    }
    if (!mountedRef.current) return;
    const { outcome } = result;
    const payout = Number(result.spin.payout);
    const scale = (stakes: number) => round2(stakes * bet);

    await spinTo(windowFor(config.strips, outcome.stops), t0, MIN_SPIN_MS - 460);
    if (!mountedRef.current) return;
    setWinLines(outcome.lines);
    if (outcome.books >= 3) setBookGlow(true);
    let shown = 0;
    if (outcome.baseWin > 0) {
      shown = scale(outcome.baseWin);
      await countUp('WIN', 0, shown);
      await wait(500);
    }

    if (outcome.special) {
      const special = outcome.special;
      await flashBanner(`${config.freeSpins} FREE SPINS!`, `${outcome.books} books found`, 1100);
      setWinLines([]);
      setBookGlow(false);
      await new Promise<void>((done) => setOpening({ special, done }));
      setOpening(null);
      let state: FreeState = { active: true, played: 0, total: config.freeSpins, won: 0, special };
      setFree(state);
      for (const fs of outcome.freeSpins as PharaohFreeSpin[]) {
        if (!mountedRef.current) return;
        setWinLines([]);
        setExpand(null);
        setBookGlow(false);
        const ft0 = Date.now();
        reels.forEach((r) => r.current?.start());
        await spinTo(windowFor(config.strips, fs.stops), ft0, FREE_SPIN_MS - 460);
        state = { ...state, played: state.played + 1 };
        setFree(state);
        if (fs.lines.length) setWinLines(fs.lines);
        const plain = scale(fs.win - fs.expand);
        if (plain > 0) {
          await countUp('WIN', shown, round2(shown + plain));
          shown = round2(shown + plain);
          state = { ...state, won: round2(state.won + plain) };
          setFree(state);
          await wait(350);
        }
        if (fs.expandReels.length > 0) {
          setWinLines([]);
          expandAnim.setValue(0);
          setExpand({ reels: fs.expandReels, s: special });
          await new Promise<void>((r) => Animated.timing(expandAnim, { toValue: 1, duration: 650, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start(() => r()));
          const got = scale(fs.expand);
          await flashBanner(`+${money(got)}`, `${NAMES[special]} expands on ${fs.expandReels.length} reels`, 800);
          await countUp('WIN', shown, round2(shown + got));
          shown = round2(shown + got);
          state = { ...state, won: round2(state.won + got) };
          setFree(state);
        }
        if (fs.retrigger > 0) {
          setBookGlow(true);
          await flashBanner(`+${fs.retrigger} FREE SPINS`, 'The book opens again', 1000);
          state = { ...state, total: state.total + fs.retrigger };
          setFree(state);
        }
        await wait(fs.win > 0 ? 500 : 250);
      }
      setExpand(null);
      await flashBanner('TREASURE WON', money(state.won), 1500);
      setFree(NO_FREE);
    }

    // Only a return above the stake is celebrated; a smaller one is shown plainly.
    if (payout > bet) {
      if (shown !== payout) await countUp('WIN', shown, payout);
      if (payout >= bet * 20 && !outcome.special) await flashBanner(payout >= bet * 100 ? 'MEGA WIN' : 'BIG WIN', money(payout), 1300);
      setMeter({ label: 'WIN', amount: payout, tone: 'win' });
    } else if (payout > 0) {
      setMeter({ label: 'RETURNED', amount: payout, tone: 'return' });
    } else {
      setMeter({ label: 'THE SANDS WERE SILENT', amount: null, tone: 'lose' });
    }

    setShownBalance((b) => round2(b + payout));
    setSessionNet((n) => round2(n + payout - bet));
    refreshWallet();
    if (panel === 'history') fetchBookOfPharaohHistory(30).then((h) => mountedRef.current && setHistory(h)).catch(() => {});
    busyRef.current = false;
    if (mountedRef.current) setBusy(false);
    // reels are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, bet, shownBalance, rows, panel, flashBanner, countUp, spinTo, refreshWallet, showToast, expandAnim, scarabSpin]);

  const stepBet = (dir: 1 | -1) => {
    if (busy) return;
    const idx = Math.max(0, betLevels.indexOf(bet));
    setBet(betLevels[Math.max(0, Math.min(betLevels.length - 1, idx + dir))] ?? bet);
  };

  const openHistory = () => {
    setPanel('history');
    setHistory(null);
    fetchBookOfPharaohHistory(30)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => mountedRef.current && setHistory([]));
  };

  // ---------- layout ----------
  const cabW = Math.min(W - 12, 470);
  const pillar = cabW * 0.1;
  const reelGap = 3;
  // Gold frame: 3px border + 5px padding on each side; each reel window has a 1px border.
  const reelsW = cabW - pillar * 2 + 24 - 16;
  const reelW = Math.floor((reelsW - reelGap * 4 - 10) / 5);
  const cell = Math.floor(Math.min(reelW * 1.05, 96));
  const reelsH = cell * 3;

  const litCells = useMemo(() => {
    const lit = [0, 1, 2, 3, 4].map(() => [false, false, false]);
    winLines.forEach((w) => lines[w.line]?.forEach((row, reel) => reel < w.count && (lit[reel][row] = true)));
    return lit;
  }, [winLines, lines]);
  const dimFor = (reel: number) => {
    if (bookGlow) return rows[reel].map((s) => s !== 'BOOK');
    return winLines.length > 0 ? litCells[reel].map((x) => !x) : [false, false, false];
  };
  const glowFor = (reel: number) => (bookGlow ? rows[reel].map((s) => s === 'BOOK') : [false, false, false]);

  const minutes = Math.floor((now - sessionStart.current) / 60000);
  const seconds = Math.floor(((now - sessionStart.current) % 60000) / 1000);
  const scarabRotate = scarabSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <LinearGradient colors={free.active ? ['#12082A', '#05020F'] : ['#2A1A0A', '#0A0603']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={GOLD} />
          <Text style={styles.title}>BOOK OF PHARAOH</Text>
        </Pressable>
        <View style={styles.balancePill}>
          <MaterialCommunityIcons name="treasure-chest" size={16} color={GOLD} />
          <Text style={styles.balanceText}>{money(shownBalance)}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 24, alignItems: 'center' }} scrollEnabled={!busy}>
        <View style={[styles.temple, { width: cabW }]} onLayout={(e) => setSceneH(Math.round(e.nativeEvent.layout.height))}>
          {sceneH > 0 && <Temple w={cabW} h={sceneH} night={free.active} />}
          <View style={{ position: 'absolute', left: pillar * 0.5 - 11, top: 52 }}>
            <Torch flicker={flicker} />
          </View>
          <View style={{ position: 'absolute', right: pillar * 0.5 - 11, top: 52 }}>
            <Torch flicker={flicker} />
          </View>
          <View style={{ alignItems: 'center', marginTop: 46 }}>
            <Title width={cabW * 0.82} free={free.active} />
          </View>

          {/* Free spins: special symbol and spins left, on a gold cartouche */}
          <View style={[styles.freeBar, { opacity: free.active ? 1 : 0, marginHorizontal: pillar - 8 }]}>
            <View style={styles.cartouche}>
              <Text style={styles.cartoucheLabel}>FREE SPINS</Text>
              <Text style={styles.cartoucheValue}>
                {free.played} / {free.total}
              </Text>
            </View>
            <View style={[styles.cartouche, { flexDirection: 'row', gap: 6 }]}>
              <Text style={styles.cartoucheLabel}>SPECIAL</Text>
              {free.special && <PharaohArt s={free.special} size={30} glow />}
            </View>
            <View style={styles.cartouche}>
              <Text style={styles.cartoucheLabel}>TREASURE</Text>
              <Text style={styles.cartoucheValue}>{money(free.won)}</Text>
            </View>
          </View>

          {/* Reels in a gold frame */}
          <View style={[styles.reelFrame, { marginHorizontal: pillar - 12 }]}>
            <View style={{ flexDirection: 'row', gap: reelGap }}>
              {[0, 1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.reelWindow}>
                  <LinearGradient colors={free.active ? ['#E6D8FF', '#C8B4F0'] : ['#F8EBCB', '#E2C88E']} style={StyleSheet.absoluteFill} />
                  <Reel ref={reels[i]} initial={START[i]} cell={cell} width={reelW} dimmed={dimFor(i)} glowing={glowFor(i)} />
                  {expand && expand.reels.includes(i) && <ExpandColumn s={expand.s} width={reelW} height={reelsH} progress={expandAnim} />}
                </View>
              ))}
            </View>
            {lines.length > 0 && (
              <Svg width={reelsW} height={reelsH + 2} style={{ position: 'absolute', left: 5, top: 5 }} pointerEvents="none">
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

          {/* Papyrus win scroll */}
          <View style={[styles.scroll, { marginHorizontal: pillar - 4 }]}>
            <View style={styles.scrollRoll} />
            <LinearGradient colors={['#F4E2B4', '#E8CF90', '#F4E2B4']} style={styles.scrollBody}>
              <Text style={[styles.scrollLabel, meter.tone === 'win' && { color: '#1E6A2A' }]}>{meter.label}</Text>
              <Text style={[styles.scrollValue, meter.tone === 'win' && { color: '#1E6A2A' }, meter.tone === 'return' && { color: '#8A5A10' }]} numberOfLines={1} adjustsFontSizeToFit>
                {meter.amount === null ? '☥  ✦  ☥' : money(meter.amount)}
              </Text>
            </LinearGradient>
            <View style={styles.scrollRoll} />
          </View>
        </View>

        {/* Line wins */}
        <View style={[styles.lineWinsRow, { width: cabW }]}>
          {winLines.length === 0 ? (
            <Text style={styles.lineWinHint}>{lineCount} lines · the book is wild and scatter</Text>
          ) : (
            winLines.map((w) => (
              <View key={w.line} style={[styles.lineChip, { borderColor: LINE_COLORS[w.line] }]}>
                <Text style={[styles.lineChipText, { color: LINE_COLORS[w.line] }]}>
                  L{w.line + 1} {w.count}×
                </Text>
                <PharaohArt s={w.symbol} size={18} />
                <Text style={styles.lineChipText}>{money(round2((w.pays * bet) / lineCount))}</Text>
              </View>
            ))
          )}
        </View>

        {/* Stone control tablet */}
        <View style={[styles.tablet, { width: cabW }]}>
          <LinearGradient colors={['#7A6040', STONE, STONE_DARK]} style={[StyleSheet.absoluteFill, { borderRadius: 18 }]} />
          <View style={styles.tabletBorder} pointerEvents="none" />
          <View style={styles.betCol}>
            <Text style={styles.betLabel}>OFFERING</Text>
            <View style={styles.betRow}>
              <Pressable onPress={() => stepBet(-1)} disabled={busy} style={[styles.triBtn, busy && styles.dim]} hitSlop={8}>
                <Svg width={18} height={18} viewBox="0 0 18 18">
                  <Polygon points="14,2 14,16 3,9" fill={GOLD} />
                </Svg>
              </Pressable>
              <View style={styles.betCartouche}>
                <Text style={styles.betValue}>{money(bet)}</Text>
              </View>
              <Pressable onPress={() => stepBet(1)} disabled={busy} style={[styles.triBtn, busy && styles.dim]} hitSlop={8}>
                <Svg width={18} height={18} viewBox="0 0 18 18">
                  <Polygon points="4,2 4,16 15,9" fill={GOLD} />
                </Svg>
              </Pressable>
            </View>
          </View>
          <Pressable onPress={spin} disabled={busy || !config} style={({ pressed }) => [styles.scarabWrap, pressed && { transform: [{ scale: 0.94 }] }, (busy || !config) && { opacity: 0.6 }]}>
            <Animated.View style={{ transform: [{ rotate: scarabRotate }] }}>
              <Svg width={84} height={84} viewBox="0 0 100 100">
                <Defs>
                  <RadialGradient id="bpBtn" cx="40%" cy="35%" r="70%">
                    <Stop offset="0" stopColor={GOLD_LIGHT} />
                    <Stop offset="0.55" stopColor={GOLD} />
                    <Stop offset="1" stopColor={GOLD_DEEP} />
                  </RadialGradient>
                </Defs>
                <Circle cx={50} cy={50} r={48} fill="url(#bpBtn)" stroke="#5A3A08" strokeWidth={3} />
                <Circle cx={50} cy={50} r={40} fill="none" stroke="#5A3A08" strokeWidth={1.5} strokeDasharray="4 3" />
                <Ellipse cx={50} cy={30} rx={10} ry={6} fill="#5A3A08" />
                <Ellipse cx={50} cy={56} rx={20} ry={22} fill="#0E6A60" stroke="#5A3A08" strokeWidth={2.5} />
                <Path d="M50 36 L 50 78 M32 50 C 40 45, 60 45, 68 50" stroke={GOLD} strokeWidth={2} fill="none" />
                <Path d="M30 46 C 20 40, 20 30, 26 26 M70 46 C 80 40, 80 30, 74 26" stroke="#5A3A08" strokeWidth={3} fill="none" strokeLinecap="round" />
              </Svg>
            </Animated.View>
            <Text style={styles.spinText}>{busy ? '…' : 'SPIN'}</Text>
          </Pressable>
          <View style={styles.iconCol}>
            <Pressable onPress={() => setPanel('pay')} style={styles.glyphBtn} hitSlop={6}>
              <MaterialCommunityIcons name="script-text-outline" size={20} color={GOLD} />
              <Text style={styles.glyphText}>PAYS</Text>
            </Pressable>
            <Pressable onPress={openHistory} style={styles.glyphBtn} hitSlop={6}>
              <MaterialCommunityIcons name="timer-sand" size={20} color={GOLD} />
              <Text style={styles.glyphText}>HISTORY</Text>
            </Pressable>
          </View>
        </View>

        {/* Session (UK: time played and net position, always on show) */}
        <View style={[styles.session, { width: cabW }]}>
          <MaterialCommunityIcons name="timer-sand" size={14} color="#C8B48A" />
          <Text style={styles.sessionText}>
            Session {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </Text>
          <Text style={styles.sessionSep}>☥</Text>
          <Text style={[styles.sessionText, { color: sessionNet > 0 ? '#7CFF9A' : sessionNet < 0 ? '#FF9AA6' : '#C8B48A' }]}>
            Net {sessionNet >= 0 ? '+' : '−'}
            {money(Math.abs(sessionNet))}
          </Text>
        </View>

        <Text style={styles.footNote}>
          RTP {config ? `${config.rtpPercent}%` : '—'} · bet {money(minStake)}–{money(maxStake)} · max win {money(config?.maxPayout ?? 10000)} per spin{'\n'}
          No autoplay or turbo · each paid spin takes at least 2.5 seconds · provably fair
        </Text>
      </ScrollView>

      {opening && <BookOpening special={opening.special} onDone={opening.done} />}

      {banner && (
        <Animated.View
          pointerEvents="none"
          style={[styles.banner, { opacity: bannerAnim, transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}
        >
          <LinearGradient colors={[GOLD_LIGHT, GOLD, GOLD_DEEP]} style={styles.bannerInner}>
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
                <MaterialCommunityIcons name="close" size={22} color="#3A2A10" />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>{panel === 'pay' ? <Paytable bet={bet} config={config} /> : <History spins={history} />}</ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const PAY_ORDER: Exclude<PharaohSymbol, 'BOOK'>[] = ['PHARAOH', 'EYE', 'SCARAB', 'ANKH', 'ACE', 'KING', 'QUEEN', 'JACK', 'TEN'];

function Paytable({ bet, config }: { bet: number; config: BookOfPharaohConfig | null }) {
  if (!config) return <Text style={styles.payNote}>Loading…</Text>;
  const lineBet = bet / config.lineCount;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.payNote}>
        Your bet of {money(bet)} plays all {config.lineCount} lines ({money(lineBet)} each). Wins pay left to right; prizes are per line at this bet.
      </Text>
      <View style={styles.payHead}>
        <Text style={[styles.payHeadText, { flex: 1 }]} />
        {['2×', '3×', '4×', '5×'].map((h) => (
          <Text key={h} style={styles.payHeadText}>
            {h}
          </Text>
        ))}
      </View>
      {PAY_ORDER.map((sym) => (
        <View key={sym} style={styles.payRow}>
          <View style={{ flex: 1 }}>
            <PharaohArt s={sym} size={34} />
          </View>
          {config.pays[sym].map((x, i) => (
            <Text key={i} style={styles.payValue}>
              {x > 0 ? money(round2(x * lineBet)) : '—'}
            </Text>
          ))}
        </View>
      ))}
      <Text style={styles.paySection}>THE BOOK</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PharaohArt s="BOOK" size={44} />
        <Text style={styles.payNote}>
          Wild for every symbol on a line, and scatter: 3, 4 or 5 anywhere pay {money(config.scatterPays['3'] * bet)}, {money(config.scatterPays['4'] * bet)} or {money(config.scatterPays['5'] * bet)} and open {config.freeSpins} free spins (about one spin in {Math.round(100 / config.featureChancePercent)}).
        </Text>
      </View>
      <Text style={styles.paySection}>EXPANDING SYMBOL</Text>
      <Text style={styles.payNote}>
        Before the free spins the book picks a special symbol. On each free spin where it shows on enough reels (2 for Pharaoh, Eye, Scarab and Ankh; 3 for the rest), it fills those reels and pays on all {config.lineCount} lines — the reels don't need to be next to each other. 3 books in free spins add {config.freeSpins} more.
      </Text>
      <Text style={styles.payNote}>RTP {config.rtpPercent}%. Results come from your provably-fair seeds on the server.</Text>
    </View>
  );
}

function History({ spins }: { spins: PharaohSpinRow[] | null }) {
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
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {s.special ? (
                <>
                  <Text style={styles.histTags}>{s.freeSpins} FREE</Text>
                  <PharaohArt s={s.special} size={16} />
                </>
              ) : null}
            </View>
            <Text style={[styles.histWin, { color: pay > stake ? '#1E6A2A' : pay > 0 ? '#8A5A10' : '#8A7A60' }]}>{pay > 0 ? money(pay) : '—'}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0603' },
  topBar: { height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  title: { color: GOLD, fontSize: 17, fontWeight: '900', fontFamily: SERIF, letterSpacing: 2 },
  balancePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, backgroundColor: 'rgba(245,197,66,0.12)', borderWidth: 1.5, borderColor: GOLD_DEEP },
  balanceText: { color: GOLD_LIGHT, fontSize: 14, fontWeight: '800', fontFamily: SERIF },
  temple: { borderRadius: 6, borderWidth: 3, borderColor: GOLD_DEEP, overflow: 'hidden', marginTop: 4 },
  freeBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, height: 46, marginBottom: 4 },
  cartouche: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 42, borderRadius: 21, borderWidth: 2, borderColor: GOLD, backgroundColor: 'rgba(20,10,40,0.75)' },
  cartoucheLabel: { color: GOLD, fontSize: 8, fontWeight: '900', letterSpacing: 2, fontFamily: SERIF },
  cartoucheValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', fontFamily: SERIF },
  reelFrame: { borderWidth: 3, borderColor: GOLD, borderRadius: 8, padding: 5, backgroundColor: '#3A2A10' },
  reelWindow: { borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: GOLD_DEEP },
  scroll: { flexDirection: 'row', alignItems: 'stretch', marginTop: 10, marginBottom: 12, height: 52 },
  scrollRoll: { width: 12, borderRadius: 6, backgroundColor: '#C8A060', borderWidth: 1.5, borderColor: '#6A4A18' },
  scrollBody: { flex: 1, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#A07A38' },
  scrollLabel: { color: '#6A3A10', fontSize: 10, fontWeight: '900', letterSpacing: 2, fontFamily: SERIF },
  scrollValue: { color: '#4A2A08', fontSize: 22, fontWeight: '900', fontFamily: SERIF },
  lineWinsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 8, minHeight: 26 },
  lineWinHint: { color: '#C8B48A', fontSize: 11, fontWeight: '700', fontFamily: SERIF },
  lineChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, borderWidth: 1.5, backgroundColor: 'rgba(0,0,0,0.4)' },
  lineChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  tablet: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18 },
  tabletBorder: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 18, borderWidth: 2, borderColor: GOLD_DEEP, margin: 4 },
  betCol: { alignItems: 'center', gap: 6 },
  betLabel: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  betRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  triBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  betCartouche: { minWidth: 84, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 18, borderWidth: 2, borderColor: GOLD, backgroundColor: STONE_DARK, alignItems: 'center' },
  betValue: { color: GOLD_LIGHT, fontSize: 15, fontWeight: '900', fontFamily: SERIF },
  dim: { opacity: 0.4 },
  scarabWrap: { alignItems: 'center' },
  spinText: { color: GOLD, fontSize: 12, fontWeight: '900', letterSpacing: 4, fontFamily: SERIF, marginTop: 2 },
  iconCol: { gap: 8 },
  glyphBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 4, borderWidth: 1.5, borderColor: GOLD_DEEP, backgroundColor: 'rgba(0,0,0,0.3)' },
  glyphText: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 1, fontFamily: SERIF },
  session: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, paddingVertical: 7, borderRadius: 4, backgroundColor: 'rgba(74,58,38,0.45)', borderWidth: 1, borderColor: 'rgba(154,106,16,0.5)' },
  sessionText: { color: '#C8B48A', fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'], fontFamily: SERIF },
  sessionSep: { color: GOLD_DEEP, fontSize: 14 },
  footNote: { color: '#8A7A60', fontSize: 10, textAlign: 'center', marginTop: 14, lineHeight: 15, paddingHorizontal: 16 },
  bookOverlay: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(5,2,15,0.82)', alignItems: 'center', justifyContent: 'center' },
  bookOpen: { flexDirection: 'row', borderWidth: 4, borderColor: '#7A1E10', borderRadius: 10, backgroundColor: '#7A1E10', padding: 6 },
  page: { width: 130, height: 170, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  pageHiero: { color: '#8A5A20', fontSize: 26, textAlign: 'center', lineHeight: 44 },
  spine: { width: 6, backgroundColor: '#4A0E06' },
  bookCaption: { color: GOLD, fontSize: 14, fontWeight: '900', letterSpacing: 2, textAlign: 'center', marginTop: 14, fontFamily: SERIF },
  banner: { position: 'absolute', top: '30%', alignSelf: 'center' },
  bannerInner: { paddingHorizontal: 26, paddingVertical: 12, borderRadius: 6, borderWidth: 3, borderColor: '#5A3A08', alignItems: 'center' },
  bannerText: { color: '#3A1A00', fontSize: 28, fontWeight: '900', fontFamily: SERIF, letterSpacing: 2 },
  bannerSub: { color: '#4A2A00', fontSize: 13, fontWeight: '800', marginTop: 2, fontFamily: SERIF },
  toast: { position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14 },
  toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { backgroundColor: '#F4E2B4', borderRadius: 8, borderWidth: 3, borderColor: GOLD_DEEP, padding: 14 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { color: '#5A2A08', fontSize: 18, fontWeight: '900', letterSpacing: 3, fontFamily: SERIF },
  payHead: { flexDirection: 'row', alignItems: 'center' },
  payHeadText: { color: '#7A4A10', fontSize: 11, fontWeight: '900', width: 62, textAlign: 'right' },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 1, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(122,74,16,0.3)' },
  payValue: { color: '#2A1A06', fontSize: 12, fontWeight: '900', width: 62, textAlign: 'right' },
  paySection: { color: '#7A2A08', fontSize: 12, fontWeight: '900', letterSpacing: 2, marginTop: 8, fontFamily: SERIF },
  payNote: { color: '#3A2A10', fontSize: 12, lineHeight: 17, flexShrink: 1 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(122,74,16,0.3)' },
  histTime: { color: '#6A5A40', fontSize: 11, width: 82 },
  histStake: { color: '#2A1A06', fontSize: 12, fontWeight: '700', width: 70 },
  histTags: { color: '#7A2A08', fontSize: 10, fontWeight: '900' },
  histWin: { fontSize: 12, fontWeight: '900' },
});
