import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AndarBaharArea,
  AndarBaharConfig,
  AndarBaharHistoryEntry,
  AndarBaharRoundView,
  PlayingCard,
  cancelAndarBaharBets,
  fetchAndarBaharConfig,
  fetchAndarBaharCurrent,
  fetchAndarBaharHistory,
  fetchAndarBaharMyRound,
  placeAndarBaharBets,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';
import { useAuth } from '../state/AuthContext';

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
const FALLBACK_MULTIPLIERS: Record<AndarBaharArea, number> = {
  ANDAR: 1.74,
  BAHAR: 1.85,
  C1_5: 3.32,
  C6_10: 4.14,
  C11_15: 5.32,
  C16_25: 4.12,
  C26_35: 9.18,
  C36_49: 33.46,
};

const WIN_CARD_MS = 3000;
const TOAST_MS = 1600;
const BANNER_MS = 1400;
const BEAD_COLS = 7;
const BEAD_ROWS = 6;
const BEAD_COLOR: Record<string, string> = { ANDAR: '#2F63D8', BAHAR: '#C9283A' };
const GOLD = '#FFD66B';

/** The Joker flips first; then one card lands every dealMs. */
const DEAL_START_MS = 1000;
function dealMsFor(n: number): number {
  return Math.max(140, Math.min(320, 7200 / Math.max(1, n)));
}
function dealEndMs(n: number): number {
  return DEAL_START_MS + Math.max(0, n - 1) * dealMsFor(n) + 500;
}

const RANGES: Partial<Record<AndarBaharArea, [number, number]>> = {
  C1_5: [1, 5],
  C6_10: [6, 10],
  C11_15: [11, 15],
  C16_25: [16, 25],
  C26_35: [26, 35],
  C36_49: [36, 49],
};

function areaWins(area: AndarBaharArea, winner: string | null, totalCards: number | null): boolean {
  if (!winner || !totalCards) return false;
  if (area === 'ANDAR' || area === 'BAHAR') return area === winner;
  const [lo, hi] = RANGES[area]!;
  return totalCards >= lo && totalCards <= hi;
}

// ---------- table ----------

// The table art is the Dragon Tiger table with the heads and boxes taken
// out (1852×849). Everything is laid out in its pixel coordinates.
const TABLE_BG = require('../../assets/andar-bahar/table.jpg');
const IMG_W = 1852;
const IMG_H = 849;

type Rect = [number, number, number, number];
const LANES: Record<'ANDAR' | 'BAHAR', Rect> = { ANDAR: [282, 206, 1500, 322], BAHAR: [282, 334, 1500, 450] };
const LANE_LOOK: Record<'ANDAR' | 'BAHAR', { colors: [string, string]; letter: string }> = {
  ANDAR: { colors: ['#2F6BE0', '#12287A'], letter: 'A' },
  BAHAR: { colors: ['#E0303F', '#72101C'], letter: 'B' },
};
const JOKER_AT = [855, 121] as const;

type BoxDef = { area: AndarBaharArea; title: string; sub?: string; mark?: string; big: boolean; r: Rect; colors: [string, string] };
const SIDE_COLORS: [string, string] = ['#8A4BE0', '#3A1370'];
const SIDE_GRID: Rect = [712, 460, 1064, 664];
function sideCell(i: number): Rect {
  const [x0, y0, x1, y1] = SIDE_GRID;
  const gap = 8;
  const w = (x1 - x0 - 2 * gap) / 3;
  const h = (y1 - y0 - gap) / 2;
  const c = i % 3;
  const r = Math.floor(i / 3);
  return [x0 + c * (w + gap), y0 + r * (h + gap), x0 + c * (w + gap) + w, y0 + r * (h + gap) + h];
}
const BOXES: BoxDef[] = [
  { area: 'ANDAR', title: 'ANDAR', mark: 'A', big: true, r: [276, 460, 700, 664], colors: LANE_LOOK.ANDAR.colors },
  ...(['C1_5', 'C6_10', 'C11_15', 'C16_25', 'C26_35', 'C36_49'] as AndarBaharArea[]).map((area, i) => {
    const [lo, hi] = RANGES[area]!;
    return { area, title: `${lo}-${hi}`, sub: 'CARDS', big: false, r: sideCell(i), colors: SIDE_COLORS };
  }),
  { area: 'BAHAR', title: 'BAHAR', mark: 'B', big: true, r: [1076, 460, 1503, 664], colors: LANE_LOOK.BAHAR.colors },
];

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


const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUIT_SYMBOL: Record<string, string> = { S: '♠', H: '♥', C: '♣', D: '♦' };


/** A band of light sweeping across the glass strip every few seconds. */
function StripShine({ width, height }: { width: number; height: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(2800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [t]);
  const band = Math.max(40, height * 0.9);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -height * 0.2,
        width: band,
        height: height * 1.4,
        transform: [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-band * 1.5, width + band * 0.5] }) }, { skewX: '-25deg' }],
      }}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}


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
    <LinearGradient colors={['#FFFFFF', '#E9E9F0']} style={[styles.card, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={styles.cardCorner}>
        <Text style={[styles.cardRank, { color, fontSize: w * 0.28 }]}>{RANK_LABEL[card.rank]}</Text>
        <Text style={{ color, fontSize: w * 0.22, marginTop: -3 }}>{SUIT_SYMBOL[card.suit]}</Text>
      </View>
      <Text style={{ color, fontSize: w * 0.62, marginTop: w * 0.12 }}>{SUIT_SYMBOL[card.suit]}</Text>
    </LinearGradient>
  );
}

function CardBack({ w }: { w: number }) {
  return (
    <LinearGradient colors={['#5A1A0E', '#2A0A04']} style={[styles.card, styles.cardBack, { width: w, height: w * 1.4, borderRadius: w * 0.1 }]}>
      <View style={[styles.cardBackInner, { borderRadius: w * 0.07 }]}>
        <View style={[styles.cardBackDiamond, { width: w * 0.42, height: w * 0.42 }]} />
        <Text style={[styles.cardBackMark, { fontSize: w * 0.2 }]}>NP</Text>
      </View>
    </LinearGradient>
  );
}

/** A card that flips from its back to `card` whenever the card changes. */
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

/** Stage card slot: empty while betting, dealt face-down while dealing,
 * flipped on the reveal. */
function DealtCard({ phase, card, w, from }: { phase: string; card: PlayingCard | null; w: number; from: 1 | -1 }) {
  const deal = useRef(new Animated.Value(phase === 'BETTING' ? 0 : 1)).current;
  useEffect(() => {
    if (phase === 'BETTING') {
      deal.setValue(0);
    } else {
      Animated.timing(deal, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [phase, deal]);
  return (
    <View style={[styles.cardSlot, { width: w + 6, height: w * 1.4 + 6, borderRadius: w * 0.12 }]}>
      <Animated.View
        style={{
          opacity: deal,
          transform: [
            { translateX: deal.interpolate({ inputRange: [0, 1], outputRange: [from * 140, 0] }) },
            { translateY: deal.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] }) },
            { rotate: deal.interpolate({ inputRange: [0, 1], outputRange: [`${from * 35}deg`, '0deg'] }) },
          ],
        }}
      >
        <FlipCard card={card} w={w} />
      </Animated.View>
    </View>
  );
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function Clock({ secs, fraction, size }: { secs: number; fraction: Animated.Value; size: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const urgent = secs <= 3;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id="clockGold" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFF1B8" />
            <Stop offset="1" stopColor="#C98A1C" />
          </SvgLinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r + 2} fill="#2A0C06" />
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#4A2412" strokeWidth={5} />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? '#FF4B3E' : 'url(#clockGold)'}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={fraction.interpolate({ inputRange: [0, 1], outputRange: [c, 0] })}
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <Text style={[styles.clockText, { fontSize: size * 0.4 }, urgent && { color: '#FF5A4E' }]}>{secs}</Text>
    </View>
  );
}

/** Gold coins bursting out of a winning box. */
function WinBurst() {
  const t = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [t, pop]);
  return (
    <View pointerEvents="none" style={styles.burstWrap}>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        return (
          <Animated.View
            key={i}
            style={[
              styles.coin,
              {
                opacity: t.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] }),
                transform: [
                  { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * 70] }) },
                  { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * 45] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.Text style={[styles.winText, { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] }]}>
        WIN
      </Animated.Text>
    </View>
  );
}

type AreaState = 'normal' | 'win' | 'lose';

/** One bet box: its own gradient body with a darker front lip, name,
 * payout, this player's stake and the win / lose lighting. */
const BetBox = memo(function BetBox({
  area,
  title,
  sub,
  mark,
  colors,
  multiplier,
  total,
  state,
  big,
  onPress,
  glow,
  boxRef,
  frame,
  k,
}: {
  area: AndarBaharArea;
  title: string;
  sub?: string;
  mark?: string;
  colors: [string, string];
  multiplier: number;
  total: number;
  state: AreaState;
  big: boolean;
  onPress: (area: AndarBaharArea) => void;
  glow: Animated.Value;
  boxRef: (v: View | null) => void;
  frame: { left: number; top: number; width: number; height: number };
  k: number;
}) {
  const radius = (big ? 14 : 10) * k;
  return (
    <Pressable onPress={() => onPress(area)} style={({ pressed }) => [styles.boxHit, frame, pressed && styles.boxPressed]}>
      <View ref={boxRef} collapsable={false} style={[styles.boxInner, { borderRadius: radius }, !big && total > 0 && styles.boxHasBet, state === 'win' && styles.boxWin]}>
        <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }} style={StyleSheet.absoluteFill} />
        <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={styles.boxShine} pointerEvents="none" />
        <View pointerEvents="none" style={[styles.boxLip, { height: frame.height * 0.1 }]} />
        {mark && (
          <Text pointerEvents="none" style={[styles.boxMark, { fontSize: frame.height * 0.72, lineHeight: frame.height * 0.85 }]}>
            {mark}
          </Text>
        )}
        <Text style={[styles.boxTitle, { fontSize: (big ? 24 : 13) * k, letterSpacing: (big ? 5 : 1) * k }]} numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </Text>
        {sub &&
          (total > 0 && !big ? (
            <Text style={[styles.boxSubBet, { fontSize: 9 * k }]}>₹{shortAmount(total)}</Text>
          ) : (
            <Text style={[styles.boxSub, { fontSize: 7 * k }]}>{sub}</Text>
          ))}
        <Text style={[styles.boxMult, { fontSize: (big ? 20 : 12) * k }]}>{multiplier}x</Text>
        {total > 0 && (
          <>
            {big && (
              <View style={[styles.boxBet, { left: 8 * k, bottom: 12 * k }]} pointerEvents="none">
                <Text style={[styles.boxBetText, { fontSize: 11 * k }]}>₹{round2(total)}</Text>
              </View>
            )}
            {big && (
              <View style={{ position: 'absolute', right: 10 * k, bottom: 10 * k }} pointerEvents="none">
                <Chip value={total} size={36 * k} label={shortAmount(total)} />
              </View>
            )}
          </>
        )}
        {state === 'win' && (
          <>
            <Animated.View pointerEvents="none" style={[styles.winGlow, { opacity: glow }]} />
            {big && <WinBurst />}
          </>
        )}
        {state === 'lose' && <View pointerEvents="none" style={styles.loseShade} />}
      </View>
    </Pressable>
  );
});

/** A dealt card flying from the Joker slot into its lane. `instant` skips
 * the flight for cards that were already down when the screen caught up. */
function LaneCard({ card, w, from, instant, match }: { card: PlayingCard; w: number; from: { x: number; y: number }; instant: boolean; match: boolean }) {
  const t = useRef(new Animated.Value(instant ? 1 : 0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!instant) Animated.timing(t, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    // Mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!match) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 420, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: 420, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [match, pulse]);
  return (
    <Animated.View
      style={{
        opacity: t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [from.x, 0] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [from.y, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '0deg'] }) },
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        ],
      }}
    >
      <CardFace card={card} w={w} />
      {match && <Animated.View pointerEvents="none" style={[styles.matchRing, { borderRadius: w * 0.12, opacity: pulse }]} />}
    </Animated.View>
  );
}

// ---------- screen ----------

type PlacedChip = { key: number; area: AndarBaharArea; amount: number; id?: string };
type Flight = { id: number; value: number; area: AndarBaharArea; from: { x: number; y: number }; to: { x: number; y: number }; anim: Animated.Value };

export default function AndarBaharScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const landscape = W > H;
  const { coins, refreshWallet } = useGameState();
  const { backendUser } = useAuth();

  // Played sideways: lock landscape while this screen is focused and hand
  // the rest of the app back its portrait lock on the way out.
  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      };
    }, [])
  );

  const [config, setConfig] = useState<AndarBaharConfig | null>(null);
  const [view, setView] = useState<AndarBaharRoundView | null>(null);
  const [history, setHistory] = useState<AndarBaharHistoryEntry[]>([]);
  const [chips, setChips] = useState<PlacedChip[]>([]);
  const [selectedChip, setSelectedChip] = useState(DEFAULT_CHIP);
  const [win, setWin] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; start: boolean } | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [flying, setFlying] = useState<Partial<Record<AndarBaharArea, number>>>({});
  const [, setPhaseTick] = useState(0);

  const offsetRef = useRef(0);
  const periodRef = useRef<string | null>(null);
  const resultHandledRef = useRef<string | null>(null);
  const chipsRef = useRef<PlacedChip[]>([]);
  chipsRef.current = chips;
  const lastRoundRef = useRef<{ area: AndarBaharArea; amount: number }[]>([]);
  const idMapRef = useRef(new Map<number, string>());
  const keyRef = useRef(1);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const winTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<View>(null);
  const chipRefs = useRef<Record<number, View | null>>({});
  const boxRefs = useRef<Partial<Record<AndarBaharArea, View | null>>>({});
  const flightId = useRef(1);

  const bannerAnim = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0.4)).current;
  const clockFraction = useRef(new Animated.Value(1)).current;

  const multipliers = config?.multipliers ?? FALLBACK_MULTIPLIERS;
  const minStake = config?.minStake ?? 1;
  const maxStake = config?.maxStake ?? 500;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const showBanner = useCallback(
    (text: string, start: boolean) => {
      setBanner({ text, start });
      bannerAnim.setValue(0);
      Animated.timing(bannerAnim, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }).start();
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      bannerTimer.current = setTimeout(() => {
        Animated.timing(bannerAnim, { toValue: 2, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
          () => mountedRef.current && setBanner(null)
        );
      }, BANNER_MS);
    },
    [bannerAnim]
  );

  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
  }, []);

  const syncMyRound = useCallback(() => {
    fetchAndarBaharMyRound()
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
    fetchAndarBaharConfig()
      .then(setConfig)
      .catch(() => {});
    fetchAndarBaharHistory(100)
      .then((h) => mountedRef.current && setHistory(h))
      .catch(() => {});
    return () => {
      mountedRef.current = false;
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (bannerTimer.current) clearTimeout(bannerTimer.current);
      if (winTimer.current) clearTimeout(winTimer.current);
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
        const v = await fetchAndarBaharCurrent();
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
      showBanner('Start Betting', true);
    }
    periodRef.current = view.periodNumber;
  }, [view, showBanner]);

  // Countdown ring for this round's betting window.
  useEffect(() => {
    if (!view) return;
    const betEnd = new Date(view.betEndTime).getTime();
    const total = Math.max(1, betEnd - new Date(view.startTime).getTime());
    const remaining = Math.max(0, betEnd - (Date.now() + offsetRef.current));
    clockFraction.setValue(remaining / total);
    const anim = Animated.timing(clockFraction, { toValue: 0, duration: remaining, easing: Easing.linear, useNativeDriver: false });
    anim.start();
    return () => anim.stop();
    // Restart only when the round (not every poll) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.periodNumber, clockFraction]);

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
          showBanner('Stop Betting', false);
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
      : view.phase === 'RESULT' && view.joker
        ? 'RESULT'
        : 'DEALING';
  const revealed = phase === 'RESULT' && view?.joker && view?.cards ? view : null;
  // The deal plays out card by card from the reveal time; the board lights
  // up once the matching card is down.
  const dealCards = revealed?.cards ?? [];
  const dealMs = dealMsFor(dealCards.length);
  const dealElapsed = revealed ? srvNow - new Date(revealed.resultTime).getTime() : 0;
  const dealtCount = revealed ? Math.max(0, Math.min(dealCards.length, Math.floor((dealElapsed - DEAL_START_MS) / dealMs) + 1)) : 0;
  const dealDone = !!revealed && dealElapsed >= dealEndMs(dealCards.length);
  const boardResult = dealDone ? revealed : null;

  // Tick while cards are being dealt.
  useEffect(() => {
    if (!revealed || dealDone) return;
    const id = setInterval(() => setPhaseTick((x) => x + 1), 80);
    return () => clearInterval(id);
  }, [revealed, dealDone]);

  // Result banner once the matching card lands.
  const bannerFor = boardResult ? boardResult.periodNumber : null;
  useEffect(() => {
    if (!bannerFor || !boardResult?.winner) return;
    showBanner(`${boardResult.winner} WINS`, boardResult.winner === 'ANDAR');
    // Once per round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bannerFor, showBanner]);

  useEffect(() => {
    if (phase !== 'BETTING') return;
    const id = setInterval(() => setPhaseTick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [phase]);

  // Reveal: road update, then this player's winnings once the deal is done.
  useEffect(() => {
    if (!view || view.phase !== 'RESULT' || !view.joker || !view.cards || resultHandledRef.current === view.periodNumber) return;
    const period = view.periodNumber;
    resultHandledRef.current = period;
    const entry: AndarBaharHistoryEntry = { periodNumber: period, joker: view.joker, winner: view.winner!, totalCards: view.cards.length };
    const doneAt = new Date(view.resultTime).getTime() + dealEndMs(view.cards.length) + 700;
    setTimeout(() => mountedRef.current && setHistory((h) => (h[0]?.periodNumber === period ? h : [entry, ...h].slice(0, 100))), Math.max(0, doneAt - (Date.now() + offsetRef.current)));
    if (chipsRef.current.length > 0) {
      enqueue(async () => {
        try {
          const res = await fetchAndarBaharMyRound(period);
          const won = round2(res.bets.reduce((sum, b) => sum + Number(b.payout), 0));
          if (won > 0) {
            if (winTimer.current) clearTimeout(winTimer.current);
            winTimer.current = setTimeout(() => mountedRef.current && setWin(won), Math.max(0, doneAt + 600 - (Date.now() + offsetRef.current)));
          }
        } catch {
          // Winnings still land in the wallet; only the card is skipped.
        }
        refreshWallet();
      });
    }
  }, [view, enqueue, refreshWallet]);

  useEffect(() => {
    if (win === null) return;
    const id = setTimeout(() => setWin(null), WIN_CARD_MS);
    return () => clearTimeout(id);
  }, [win]);

  useEffect(() => {
    if (!boardResult) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 0.9, duration: 450, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0.3, duration: 450, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [boardResult, glow]);

  const areaTotals = useMemo(() => {
    const m: Partial<Record<AndarBaharArea, number>> = {};
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
    (entries: { area: AndarBaharArea; amount: number }[]): boolean => {
      if (entries.length === 0) return false;
      if (!bettingOpenRef.current) {
        showToast('Betting closed — wait for the next round');
        return false;
      }
      const cost = round2(entries.reduce((s, e) => s + e.amount, 0));
      if (cost > displayBalanceRef.current) {
        showToast('Insufficient balance');
        return false;
      }
      const totals = { ...areaTotalsRef.current };
      for (const e of entries) {
        totals[e.area] = round2((totals[e.area] ?? 0) + e.amount);
        if ((totals[e.area] ?? 0) > maxStakeRef.current) {
          showToast(`Max bet per box is ₹${maxStakeRef.current}`);
          return false;
        }
      }
      const added: PlacedChip[] = entries.map((e) => ({ key: keyRef.current++, area: e.area, amount: e.amount }));
      const keys = new Set(added.map((c) => c.key));
      setChips((prev) => [...prev, ...added]);
      enqueue(async () => {
        try {
          const res = await placeAndarBaharBets(entries);
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
      return true;
    },
    [enqueue, refreshWallet, showToast]
  );

  // A chip flies from the rail to the box; the box counts it once it lands.
  const launchFlight = useCallback((area: AndarBaharArea, value: number) => {
    const chipView = chipRefs.current[value];
    const boxView = boxRefs.current[area];
    const root = rootRef.current;
    if (!chipView || !boxView || !root) return;
    root.measureInWindow((rx, ry) => {
      chipView.measureInWindow((cx, cy, cw, ch) => {
        boxView.measureInWindow((bx, by, bw, bh) => {
          if (!mountedRef.current) return;
          const id = flightId.current++;
          const anim = new Animated.Value(0);
          const flight: Flight = {
            id,
            value,
            area,
            from: { x: cx - rx + cw / 2, y: cy - ry + ch / 2 },
            to: { x: bx - rx + bw / 2 + (Math.random() - 0.5) * bw * 0.3, y: by - ry + bh / 2 + (Math.random() - 0.5) * bh * 0.2 },
            anim,
          };
          setFlights((prev) => [...prev, flight]);
          setFlying((prev) => ({ ...prev, [area]: round2((prev[area] ?? 0) + value) }));
          Animated.timing(anim, { toValue: 1, duration: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
            if (!mountedRef.current) return;
            setFlights((prev) => prev.filter((f) => f.id !== id));
            setFlying((prev) => ({ ...prev, [area]: Math.max(0, round2((prev[area] ?? 0) - value)) }));
          });
        });
      });
    });
  }, []);

  const onAreaPress = useCallback(
    (area: AndarBaharArea) => {
      const value = selectedChipRef.current;
      if (placeChips([{ area, amount: value }])) launchFlight(area, value);
    },
    [placeChips, launchFlight]
  );

  const undo = () => {
    const last = chips[chips.length - 1];
    if (!last) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips((prev) => prev.slice(0, -1));
    enqueue(async () => {
      const id = idMapRef.current.get(last.key);
      if (!id) return;
      try {
        await cancelAndarBaharBets([id]);
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const clearAll = () => {
    if (chips.length === 0) return;
    if (!bettingOpen) return showToast('Betting closed');
    setChips([]);
    enqueue(async () => {
      try {
        await cancelAndarBaharBets();
        refreshWallet();
      } catch (err) {
        if (mountedRef.current) {
          showToast(errorMessage(err));
          syncMyRound();
        }
      }
    });
  };

  const repeat = () => {
    if (lastRoundRef.current.length === 0) return showToast('No bets from the last round');
    const m = new Map<AndarBaharArea, number>();
    for (const c of lastRoundRef.current) m.set(c.area, round2((m.get(c.area) ?? 0) + c.amount));
    placeChips([...m.entries()].map(([area, amount]) => ({ area, amount })));
  };

  // Bead plate: oldest first, filled down each column.
  const beads = history.slice(0, BEAD_COLS * BEAD_ROWS).reverse();
  const stats = useMemo(() => {
    const n = history.length;
    if (!n) return null;
    const a = history.filter((h) => h.winner === 'ANDAR').length;
    return { a: Math.round((a / n) * 100), b: 100 - Math.round((a / n) * 100), n };
  }, [history]);

  const areaState = (area: AndarBaharArea): AreaState =>
    !boardResult ? 'normal' : areaWins(area, boardResult.winner, boardResult.totalCards) ? 'win' : 'lose';
  const shownTotal = (area: AndarBaharArea) => Math.max(0, round2((areaTotals[area] ?? 0) - (flying[area] ?? 0)));

  const secsLeft = Math.max(0, Math.ceil((betEndMs - srvNow) / 1000));
  const statusText =
    phase === 'BETTING' ? 'PLACE YOUR BETS' : phase === 'DEALING' ? 'JOKER…' : boardResult ? `${boardResult.winner} WINS · ${boardResult.totalCards} CARDS` : 'DEALING…';

  if (!landscape) {
    return (
      <View style={[styles.root, styles.rotating]}>
        <MaterialCommunityIcons name="phone-rotate-landscape" size={48} color={GOLD} />
        <Text style={styles.rotatingText}>Turning to landscape…</Text>
      </View>
    );
  }

  // ---- table art → screen ----
  let sx = W / IMG_W;
  let sy = H / IMG_H;
  // Phones are within a few % of the art's shape, so it is stretched edge to
  // edge; squarer screens (tablets) keep its aspect and letterbox instead.
  if (sx / sy > 1.1 || sy / sx > 1.1) sx = sy = Math.min(sx, sy);
  const ox = (W - IMG_W * sx) / 2;
  const oy = (H - IMG_H * sy) / 2;
  const s = Math.min(sx, sy);
  const k = Math.max(0.75, Math.min(1.8, s / 0.485));
  const X = (x: number) => ox + x * sx;
  const Y = (y: number) => oy + y * sy;
  const frameOf = ([x0, y0, x1, y1]: Rect) => ({ left: X(x0), top: Y(y0), width: (x1 - x0) * sx, height: (y1 - y0) * sy });
  const leftEdge = insets.left + 6;
  const rightInset = insets.right + 6;
  // Keep the bottom-rail controls clear of a gesture bar.
  const lift = Math.max(0, insets.bottom - (H - Y(IMG_H)));

  const jokerW = Math.min(90 * sx, (120 * sy) / 1.4);
  const clockSize = 96 * s;
  const chipSize = Math.min(48, 84 * sy, (880 * sx) / 9.5);
  const ctrlW = Math.min(64, 150 * sx);
  const ctrlH = Math.min(46, 78 * sy);

  const leftPanelL = Math.max(X(48), leftEdge);
  const leftPanel = { left: leftPanelL, top: Y(262), width: X(266) - leftPanelL, height: 360 * sy };
  const rightPanelR = Math.min(X(1806), W - rightInset);
  const rightPanel = { left: X(1516), top: Y(236), width: rightPanelR - X(1516), height: 410 * sy };
  const beadS = Math.max(8, Math.floor(Math.min(18 * k, (rightPanel.width - 14) / BEAD_COLS - 2, (rightPanel.height - 62 * k) / BEAD_ROWS - 2)));

  // Lanes: label pill, then the card track. Cards overlap once a lane fills.
  const laneH = (LANES.ANDAR[3] - LANES.ANDAR[1]) * sy;
  const laneCardW = Math.min((laneH - 14 * sy) / 1.4, 80 * sx);
  const trackX0 = X(440);
  const trackW = X(1490) - trackX0;
  const perLane = Math.max(1, Math.ceil(dealCards.length / 2));
  const spacing = Math.min(laneCardW * 1.1, perLane > 1 ? (trackW - laneCardW) / (perLane - 1) : laneCardW);
  const jokerCentre = { x: X(JOKER_AT[0]), y: Y(JOKER_AT[1]) };

  const bannerStart = banner?.start ?? true;
  const winnerLane = boardResult?.winner ?? null;

  return (
    <View ref={rootRef} collapsable={false} style={styles.root}>
      <Image source={TABLE_BG} style={[styles.abs, frameOf([0, 0, IMG_W, IMG_H])]} resizeMode="stretch" />

      {/* Glass strip: sweep, side names, Joker and clock */}
      <View pointerEvents="none" style={[styles.abs, styles.stripClip, frameOf([410, 62, 1300, 180]), { borderRadius: 16 * k }]}>
        <StripShine width={890 * sx} height={118 * sy} />
      </View>
      <View pointerEvents="none" style={[styles.abs, styles.center, frameOf([430, 62, 720, 180])]}>
        <Text style={[styles.stripName, { fontSize: 30 * k, textShadowColor: '#3D86FF' }]}>ANDAR</Text>
      </View>
      <View pointerEvents="none" style={[styles.abs, styles.center, frameOf([1110, 62, 1290, 180])]}>
        <Text style={[styles.stripName, { fontSize: 30 * k, textShadowColor: '#FF4A4A' }]}>BAHAR</Text>
      </View>
      <View pointerEvents="none" style={[styles.abs, styles.jokerTab, { left: X(JOKER_AT[0]) - 34 * k, top: Y(JOKER_AT[1]) + (jokerW * 1.4) / 2 - 6 * k, width: 68 * k, zIndex: 5, borderRadius: 8 * k }]}>
        <Text style={[styles.jokerLabel, { fontSize: 10 * k }]}>JOKER</Text>
      </View>
      <View style={[styles.abs, styles.jokerSlot, { left: jokerCentre.x - jokerW / 2 - 3, top: jokerCentre.y - (jokerW * 1.4) / 2 - 3, borderRadius: jokerW * 0.12 }]}>
        <FlipCard card={revealed?.joker ?? null} w={jokerW} />
      </View>
      <View style={[styles.abs, styles.center, { left: X(1000) - clockSize / 2, top: Y(JOKER_AT[1]) - clockSize / 2, width: clockSize, height: clockSize }]}>
        {phase === 'BETTING' ? (
          <Clock secs={secsLeft} fraction={clockFraction} size={clockSize} />
        ) : (
          <View style={[styles.countBadge, { width: clockSize, height: clockSize, borderRadius: clockSize / 2 }]}>
            <Text style={[styles.countNum, { fontSize: 24 * k }]}>{dealtCount}</Text>
            <Text style={[styles.countLbl, { fontSize: 8 * k }]}>CARDS</Text>
          </View>
        )}
      </View>

      {/* Top corners and status */}
      <Pressable onPress={() => navigation.goBack()} style={[styles.abs, styles.backBtn, { left: Math.max(X(14), leftEdge), top: Y(10) }]} hitSlop={8}>
        <MaterialCommunityIcons name="chevron-left" size={26 * k} color="#F5B942" />
        <Text style={[styles.title, { fontSize: 15 * k }]}>ANDAR BAHAR</Text>
      </Pressable>
      <View pointerEvents="none" style={[styles.abs, styles.center, frameOf([600, 4, 1110, 58])]}>
        <Text style={[styles.topStatus, { fontSize: 11 * k }]} numberOfLines={1}>
          #{view?.periodNumber.slice(-5) ?? '-----'} · {statusText}
        </Text>
      </View>
      <Pressable
        onPress={() => navigation.navigate('Deposit')}
        style={[styles.abs, styles.depositPill, { right: Math.max(W - X(1836), rightInset), top: Y(12) }]}
      >
        <MaterialCommunityIcons name="wallet-plus" size={15 * k} color="#F5B942" />
        <Text style={[styles.depositText, { fontSize: 13 * k }]}>Deposit</Text>
      </Pressable>

      {/* Andar / Bahar lanes with the dealt cards */}
      {(['ANDAR', 'BAHAR'] as const).map((side) => {
        const f = frameOf(LANES[side]);
        const look = LANE_LOOK[side];
        const lit = winnerLane === side;
        return (
          <View key={side} pointerEvents="none" style={[styles.abs, styles.lane, f, { borderRadius: 14 * k }, lit && styles.laneWin, winnerLane && !lit && styles.laneLose]}>
            <LinearGradient colors={[look.colors[0] + '55', look.colors[1] + '22']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
            <LinearGradient colors={look.colors} style={[styles.lanePill, { width: X(430) - X(292), height: f.height - 16 * sy, borderRadius: 10 * k }]}>
              <Text style={[styles.laneLetter, { fontSize: 28 * k }]}>{look.letter}</Text>
              <Text style={[styles.laneName, { fontSize: 11 * k }]}>{side}</Text>
            </LinearGradient>
          </View>
        );
      })}
      {dealCards.slice(0, dealtCount).map((card, i) => {
        const side = i % 2 === 0 ? 'ANDAR' : 'BAHAR';
        const f = frameOf(LANES[side]);
        const left = trackX0 + Math.floor(i / 2) * spacing;
        const top = f.top + (f.height - laneCardW * 1.4) / 2;
        const due = DEAL_START_MS + i * dealMs;
        return (
          <View key={`${revealed?.periodNumber}-${i}`} pointerEvents="none" style={[styles.abs, { left, top, zIndex: i }]}>
            <LaneCard
              card={card}
              w={laneCardW}
              from={{ x: jokerCentre.x - (left + laneCardW / 2), y: jokerCentre.y - (top + laneCardW * 0.7) }}
              instant={dealElapsed - due > 600}
              match={i === dealCards.length - 1 && dealDone}
            />
          </View>
        );
      })}

      {/* Player panel in the left end of the table */}
      <View style={[styles.abs, styles.sidePanel, leftPanel]}>
        <MaterialCommunityIcons name="account-circle" size={30 * k} color={GOLD} />
        <Text style={[styles.sideName, { fontSize: 12 * k }]} numberOfLines={1}>
          {backendUser?.firstName ?? 'Player'}
        </Text>
        <Text style={[styles.sideLabel, { fontSize: 10 * k }]}>Balance</Text>
        <Text style={[styles.sideValue, { fontSize: 14 * k }]} numberOfLines={1} adjustsFontSizeToFit>
          ₹{displayBalance.toFixed(2)}
        </Text>
        <Text style={[styles.sideLabel, { fontSize: 10 * k }]}>Your bet</Text>
        <Text style={[styles.sideValueWhite, { fontSize: 13 * k }]} numberOfLines={1} adjustsFontSizeToFit>
          ₹{myTotal.toFixed(2)}
        </Text>
      </View>

      {/* Road in the right end of the table */}
      <View style={[styles.abs, styles.sidePanel, rightPanel]}>
        <Text style={[styles.sideLabel, { fontSize: 10 * k }]}>LAST {Math.min(stats?.n ?? 0, BEAD_COLS * BEAD_ROWS)}</Text>
        <View style={styles.beadGrid}>
          {Array.from({ length: BEAD_COLS }, (_, c) => (
            <View key={c} style={styles.beadCol}>
              {Array.from({ length: BEAD_ROWS }, (_, r) => {
                const h = beads[c * BEAD_ROWS + r];
                const size = { width: beadS, height: beadS, borderRadius: beadS / 2 };
                if (!h) return <View key={r} style={[styles.beadEmpty, size]} />;
                const latest = c * BEAD_ROWS + r === beads.length - 1;
                return (
                  <View key={r} style={[styles.bead, size, { backgroundColor: BEAD_COLOR[h.winner] }, latest && styles.beadLatest]}>
                    <Text style={[styles.beadText, { fontSize: beadS * 0.55 }]}>{h.winner === 'ANDAR' ? 'A' : 'B'}</Text>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
        <View style={styles.statRow}>
          <Text style={[styles.statLine, { color: '#8FB6FF', fontSize: 10 * k }]}>A {stats?.a ?? 0}%</Text>
          <Text style={[styles.statLine, { color: '#FF9AA4', fontSize: 10 * k }]}>B {stats?.b ?? 0}%</Text>
        </View>
      </View>

      {/* Bet boxes */}
      {BOXES.map((b) => (
        <BetBox
          key={b.area}
          area={b.area}
          title={b.title}
          sub={b.sub}
          mark={b.mark}
          colors={b.colors}
          multiplier={multipliers[b.area]}
          total={shownTotal(b.area)}
          state={areaState(b.area)}
          big={b.big}
          onPress={onAreaPress}
          glow={glow}
          boxRef={(v) => {
            boxRefs.current[b.area] = v;
          }}
          frame={frameOf(b.r)}
          k={k}
        />
      ))}

      {/* Bottom rail: limits · chips · actions */}
      <View pointerEvents="none" style={[styles.abs, { left: Math.max(X(40), leftEdge), top: Y(772) - lift }]}>
        <Text style={[styles.railText, { fontSize: 10 * k }]}>
          Bet ₹{minStake} – ₹{maxStake} per box
        </Text>
        <Text style={[styles.railHint, { fontSize: 9 * k }]}>Andar first · match the Joker</Text>
      </View>
      <View style={[styles.abs, styles.chipRail, { left: X(392), width: 896 * sx, top: Y(794) - chipSize / 2 - 2 - lift, gap: Math.max(4, 10 * sx) }]}>
        {CHIP_VALUES.map((v) => {
          const allowed = v >= minStake && v <= maxStake;
          const active = v === selectedChip;
          return (
            <Pressable key={v} disabled={!allowed} onPress={() => setSelectedChip(v)} style={[styles.chipBtn, active && styles.chipActive, !allowed && styles.dim]}>
              <View
                ref={(r) => {
                  chipRefs.current[v] = r;
                }}
                collapsable={false}
              >
                <Chip value={v} size={chipSize} />
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={[styles.abs, styles.actions, { right: Math.max(W - X(1834), rightInset), top: Y(803) - ctrlH / 2 - lift }]}>
        {(
          [
            { label: 'UNDO', icon: 'undo-variant', color: '#F2E6FF', onPress: undo },
            { label: 'REPEAT', icon: 'repeat', color: '#F2E6FF', onPress: repeat },
            { label: 'CLEAR', icon: 'close-thick', color: '#FF6B6B', onPress: clearAll },
          ] as const
        ).map((a) => (
          <Pressable key={a.label} onPress={a.onPress} style={({ pressed }) => [styles.ctrlBtn, { width: ctrlW, height: ctrlH }, pressed && styles.pressed]}>
            <MaterialCommunityIcons name={a.icon} size={18 * k} color={a.color} />
            <Text style={[styles.ctrlLabel, { fontSize: 9 * k }]}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Chips in flight */}
      {flights.map((f) => (
        <Animated.View
          key={f.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: -chipSize / 2,
            top: -chipSize / 2,
            transform: [
              { translateX: f.anim.interpolate({ inputRange: [0, 1], outputRange: [f.from.x, f.to.x] }) },
              {
                translateY: f.anim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [f.from.y, Math.min(f.from.y, f.to.y) - 40, f.to.y],
                }),
              },
              { scale: f.anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.2, 0.85] }) },
            ],
          }}
        >
          <Chip value={f.value} size={chipSize} />
        </Animated.View>
      ))}

      {/* Start / Stop Betting */}
      {banner && (
        <View pointerEvents="none" style={styles.bannerLayer}>
          <Animated.View
            style={[
              styles.bannerBar,
              {
                top: H * 0.3,
                height: H * 0.26,
                width: W * 0.75,
                left: -W * 0.1,
                opacity: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0.95, 0] }),
                transform: [
                  { translateX: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [-W * 0.8, 0, -W * 0.2] }) },
                  { skewX: '-22deg' },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={bannerStart ? ['rgba(40,90,230,0)', 'rgba(40,90,230,0.85)', 'rgba(120,170,255,0.9)'] : ['rgba(90,20,20,0)', 'rgba(120,30,30,0.85)', 'rgba(200,80,40,0.9)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.bannerBar,
              {
                top: H * 0.3,
                height: H * 0.26,
                width: W * 0.75,
                right: -W * 0.1,
                opacity: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 0.95, 0] }),
                transform: [
                  { translateX: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [W * 0.8, 0, W * 0.2] }) },
                  { skewX: '-22deg' },
                ],
              },
            ]}
          >
            <LinearGradient
              colors={bannerStart ? ['rgba(255,110,110,0.9)', 'rgba(220,40,40,0.85)', 'rgba(220,40,40,0)'] : ['rgba(200,80,40,0.9)', 'rgba(120,30,30,0.85)', 'rgba(90,20,20,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.Text
            style={[
              styles.bannerText,
              {
                top: H * 0.3 + H * 0.13 - 30,
                opacity: bannerAnim.interpolate({ inputRange: [0, 0.6, 1, 2], outputRange: [0, 1, 1, 0] }),
                transform: [{ scale: bannerAnim.interpolate({ inputRange: [0, 1, 2], outputRange: [2.2, 1, 1.15] }) }],
              },
            ]}
          >
            {banner.text}
          </Animated.Text>
        </View>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070006' },
  rotating: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  rotatingText: { color: GOLD, fontSize: 16, fontWeight: '700' },

  abs: { position: 'absolute' },
  stripName: { color: 'rgba(255,255,255,0.92)', fontWeight: '900', letterSpacing: 4, textShadowRadius: 14 },
  jokerLabel: { color: GOLD, fontWeight: '900', letterSpacing: 1.5 },
  jokerSlot: { padding: 3, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.7)' },
  countBadge: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#2A0C06', borderWidth: 3, borderColor: GOLD },
  countNum: { color: '#FFFFFF', fontWeight: '900' },
  countLbl: { color: GOLD, fontWeight: '800', letterSpacing: 1, marginTop: -2 },
  lane: { overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,214,107,0.35)', justifyContent: 'center', paddingLeft: 8 },
  laneWin: { borderColor: GOLD, borderWidth: 3 },
  laneLose: { opacity: 0.55 },
  lanePill: { alignItems: 'center', justifyContent: 'center' },
  laneLetter: { color: '#FFFFFF', fontWeight: '900', lineHeight: undefined },
  laneName: { color: 'rgba(255,255,255,0.9)', fontWeight: '900', letterSpacing: 2, marginTop: -4 },
  matchRing: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderWidth: 3, borderColor: GOLD },
  boxShine: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%' },
  boxLip: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.28)' },
  boxSubBet: { color: GOLD, fontWeight: '900', marginTop: -1 },
  boxHasBet: { borderColor: GOLD, borderWidth: 2 },
  jokerTab: { position: 'absolute', alignItems: 'center', paddingVertical: 2, backgroundColor: 'rgba(40,12,4,0.9)', borderWidth: 1, borderColor: GOLD },
  boxSub: { color: 'rgba(255,255,255,0.7)', fontWeight: '800', letterSpacing: 1, marginTop: -2 },
  absFill: { position: 'absolute', top: 0, left: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  stripClip: { overflow: 'hidden' },

  backBtn: { flexDirection: 'row', alignItems: 'center' },
  title: { color: '#E7D9D2', fontWeight: '900', letterSpacing: 1.5 },
  topStatus: { color: GOLD, fontWeight: '800', letterSpacing: 0.5, textShadowColor: '#000', textShadowRadius: 4 },
  depositPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: 'rgba(58,10,16,0.85)', borderWidth: 1, borderColor: '#8A2E38' },
  depositText: { color: '#F5B942', fontWeight: '700' },

  clockText: { color: GOLD, fontWeight: '900' },
  vsSmall: { color: GOLD, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#C98A1C', textShadowRadius: 8 },
  namePlate: { position: 'absolute', bottom: -6, paddingHorizontal: 12, paddingVertical: 1, borderRadius: 8, borderWidth: 1, borderColor: '#7A4A00' },
  nameText: { color: '#3A1E00', fontSize: 11, fontWeight: '900', letterSpacing: 2 },

  card: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#C9C9D2', overflow: 'hidden' },
  cardCorner: { position: 'absolute', top: 3, left: 5, alignItems: 'center' },
  cardRank: { fontWeight: '900' },
  cardBack: { borderColor: '#D9A441', borderWidth: 2 },
  cardBackInner: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderWidth: 1, borderColor: 'rgba(217,164,65,0.6)', alignItems: 'center', justifyContent: 'center' },
  cardBackDiamond: { position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(217,164,65,0.7)', transform: [{ rotate: '45deg' }] },
  cardBackMark: { color: '#D9A441', fontWeight: '900' },
  cardSlot: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,214,107,0.45)', backgroundColor: 'rgba(0,0,0,0.3)' },

  sidePanel: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderRadius: 18, backgroundColor: 'rgba(16,2,20,0.55)', borderWidth: 1, borderColor: 'rgba(255,120,200,0.22)', gap: 1 },
  sideName: { color: '#FFFFFF', fontWeight: '800', marginBottom: 4 },
  sideLabel: { color: '#C9B6EE', fontWeight: '700', letterSpacing: 0.5 },
  sideValue: { color: GOLD, fontWeight: '900', marginBottom: 3 },
  sideValueWhite: { color: '#FFFFFF', fontWeight: '800' },
  beadGrid: { flexDirection: 'row', gap: 2, marginVertical: 4 },
  beadCol: { gap: 2 },
  bead: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  beadEmpty: { backgroundColor: 'rgba(255,255,255,0.06)' },
  beadLatest: { borderWidth: 2, borderColor: GOLD },
  beadText: { color: '#FFFFFF', fontWeight: '900' },
  statRow: { flexDirection: 'row', gap: 6 },
  statLine: { fontWeight: '800' },

  boxHit: { position: 'absolute' },
  boxPressed: { transform: [{ scale: 0.96 }] },
  boxInner: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)' },
  boxWin: { borderColor: GOLD, borderWidth: 3 },
  boxMark: { position: 'absolute', color: '#FFFFFF', opacity: 0.08, fontWeight: '900', textAlign: 'center' },
  boxTitle: { color: 'rgba(255,255,255,0.95)', fontWeight: '900', textShadowColor: 'rgba(0,0,0,0.65)', textShadowRadius: 5, textShadowOffset: { width: 0, height: 2 } },
  boxMult: { color: GOLD, fontWeight: '900', marginTop: 1, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } },
  boxBet: { position: 'absolute', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: 'rgba(255,214,107,0.5)' },
  boxBetText: { color: '#FFFFFF', fontWeight: '800' },
  pressed: { transform: [{ scale: 0.95 }] },
  winGlow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,214,107,0.22)' },
  burstWrap: { position: 'absolute', top: '42%', left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  coin: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFD23F', borderWidth: 1, borderColor: '#B7791F' },
  winText: { color: GOLD, fontSize: 30, fontWeight: '900', fontStyle: 'italic', textShadowColor: '#7A4A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },
  loseShade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },

  railText: { color: GOLD, fontWeight: '800' },
  railHint: { color: 'rgba(255,220,255,0.6)', marginTop: 1 },
  chipRail: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  chipBtn: { borderRadius: 30, padding: 2 },
  chipActive: { backgroundColor: GOLD, transform: [{ translateY: -6 }], elevation: 8, shadowColor: GOLD, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  dim: { opacity: 0.35 },
  actions: { flexDirection: 'row', gap: 6 },
  ctrlBtn: { borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(58,22,72,0.9)', borderWidth: 1.5, borderColor: '#7A3A8E' },
  ctrlLabel: { color: '#F2E6FF', fontWeight: '800', marginTop: 1 },

  bannerLayer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  bannerBar: { position: 'absolute', overflow: 'hidden' },
  bannerText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: GOLD,
    fontSize: 48,
    fontWeight: '900',
    fontStyle: 'italic',
    textShadowColor: '#6A3000',
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 4 },
  },

  vsOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,2,12,0.9)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', width: '100%' },
  vsSide: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  shardWrap: { position: 'absolute', top: '45%', left: '45%' },
  vsResult: { marginTop: 14, color: GOLD, fontSize: 32, fontWeight: '900', letterSpacing: 2, textShadowColor: '#7A3A00', textShadowRadius: 6, textShadowOffset: { width: 0, height: 2 } },

  winWrap: { position: 'absolute', top: '28%', alignSelf: 'center', alignItems: 'center' },
  winCard: { alignItems: 'center', paddingHorizontal: 34, paddingVertical: 12, borderRadius: 16, borderWidth: 2, borderColor: '#F5B942' },
  winTitle: { color: '#FFE08A', fontSize: 15, fontWeight: '900', letterSpacing: 3 },
  winAmount: { color: '#FFFFFF', fontSize: 26, fontWeight: '900', marginTop: 2 },
  winClose: { marginTop: 8, width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1C0B02', borderWidth: 2, borderColor: '#F5B942' },
  toast: { position: 'absolute', alignSelf: 'center', top: '42%', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1, borderColor: '#B7791F' },
  toastText: { color: '#FFE08A', fontSize: 14, fontWeight: '700' },
});
