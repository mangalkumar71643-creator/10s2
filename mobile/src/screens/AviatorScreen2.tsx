// Second Aviator game screen — an exact duplicate of AviatorScreen.tsx
// (same panel art, same plane/trail animation, same bet-panel logic),
// kept as its own independent file per an explicit request to add
// "one more Aviator game just like the one already built" without
// touching or deleting the original AviatorScreen.tsx in any way.
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';
import { ApiClientError } from '../api/client';
import {
  AviatorRoundView,
  cashOutAviatorBet,
  fetchAviatorCurrentRound,
  fetchAviatorHistory,
  fetchAviatorMyBets,
  placeAviatorBet,
} from '../api/backend';
import { useGameState } from '../state/GameStateContext';

const MIN_STAKE = 10;
const STAKE_STEP = 10;

// Stepper hotspot positions as fractions of the bet-panel image (688x688
// source pixels), measured from the minus/plus circle art so the overlay
// lines up with the drawn buttons at any screen size.
const STEPPER_LAYOUT = {
  minus: { left: 32 / 688, top: 105 / 572, width: 43 / 688, height: 43 / 572 },
  plus: { left: 235 / 688, top: 104 / 572, width: 43 / 688, height: 44 / 572 },
  track: { left: 75 / 688, top: 105 / 572, width: 160 / 688, height: 43 / 572 },
};
// Second (lower) panel's stepper row sits at the same x layout, lower y.
const STEPPER_LAYOUT_2 = {
  minus: { left: 32 / 688, top: 388 / 572, width: 43 / 688, height: 44 / 572 },
  plus: { left: 235 / 688, top: 388 / 572, width: 43 / 688, height: 44 / 572 },
  track: { left: 75 / 688, top: 388 / 572, width: 160 / 688, height: 44 / 572 },
};

// Green "Bet" button hotspots — measured from the same source art as the
// stepper layouts above (688x572px), one per panel.
const BET_BUTTON_LAYOUT_1 = { left: 307 / 688, top: 103 / 572, width: 348 / 688, height: 154 / 572 };
const BET_BUTTON_LAYOUT_2 = { left: 307 / 688, top: 387 / 572, width: 348 / 688, height: 153 / 572 };

// Panel background asset's own aspect ratio and on-screen width, matched
// to the reference Aviator site's panel: ~96.6% of screen width, and a
// shorter/wider aspect ratio than our first crop (measured directly off a
// reference screenshot: panel width/height ≈ 1237/722 px there).
const PANEL_ASPECT = 393 / 673;
const SCREEN_WIDTH = Dimensions.get('window').width;
const PANEL_WIDTH = SCREEN_WIDTH * 0.966;
const PANEL_HEIGHT = PANEL_WIDTH * PANEL_ASPECT;

// "Aviator" wordmark that sits in the header's empty space above the panel.
const LOGO_ASPECT = 49 / 148;
const LOGO_WIDTH = SCREEN_WIDTH * 0.32;
const LOGO_HEIGHT = LOGO_WIDTH * LOGO_ASPECT;

// Round-history strip: sits in the gap between the logo and the panel's
// top border. Placeholder values for now — this is just the strip itself.
const HISTORY_BAR_HEIGHT = 28;
const HISTORY_SAMPLE: number[] = [1.75, 1.0, 1.0, 1.89, 2.42, 4.25, 1.01];
function historyColor(mult: number) {
  if (mult >= 10) return '#E056FD';
  if (mult >= 2) return '#8854D0';
  return '#4B7BEC';
}

// Bet/Auto toggle + stake stepper + Bet button block — same width as the
// panel above it, own native aspect ratio preserved.
const BET_PANEL_ASPECT = 572 / 688;
const BET_PANEL_WIDTH = PANEL_WIDTH;
const BET_PANEL_HEIGHT = BET_PANEL_WIDTH * BET_PANEL_ASPECT;

// Plane icon's own aspect ratio, sized relative to the rays panel it flies
// inside of.
const PLANE_ASPECT = 215 / 441;
const PLANE_WIDTH = PANEL_WIDTH * 0.24;
const PLANE_HEIGHT = PLANE_WIDTH * PLANE_ASPECT;

// Ascend time is randomized each round so the fly-away moment can't be
// timed/predicted. The burst itself (t: 0.8 -> 1) is deliberately very
// short — a sudden, fast dash off-screen rather than a smooth glide.
const ASCEND_MS_MIN = 2600;
const ASCEND_MS_MAX = 5200;
// Order is: ascend to t=0.8 and hold → red line fades out first (plane
// stays put) → only then does the plane dash away, so fast there's no
// time to react to it.
const LINE_FADE_MS = 50;
const BURST_MS = 25;
const ROUND_PAUSE_MS = 1000;
const TRAIL_SAMPLES = 32;

// Plain-JS interpolation (mirrors Animated.interpolate's multi-stop
// breakpoints) so the same curve can drive both the plane's transform and
// the SVG trail points on every animation frame, in lockstep.
function interpolate(t: number, inputRange: number[], outputRange: number[]) {
  const last = inputRange.length - 1;
  if (t <= inputRange[0]) return outputRange[0];
  if (t >= inputRange[last]) return outputRange[last];
  for (let i = 0; i < last; i++) {
    if (t >= inputRange[i] && t <= inputRange[i + 1]) {
      const f = (t - inputRange[i]) / (inputRange[i + 1] - inputRange[i]);
      return outputRange[i] + f * (outputRange[i + 1] - outputRange[i]);
    }
  }
  return outputRange[last];
}

const planeRotate = (t: number) => interpolate(t, [0, 0.8, 1], [-6, -16, -42]);
const planeOpacity = (t: number) => interpolate(t, [0, 0.75, 0.95, 1], [1, 1, 0.5, 0]);
const planeScale = (t: number) => interpolate(t, [0, 0.8, 1], [1, 1, 1.15]);

// Tail-fin tip in the source plane art (441x215px), used so the curve is
// defined by where the TAIL sits, not the image's geometric center —
// planeX/planeY below are then solved backwards from this so the tail
// (not just the bounding box) starts exactly at the panel's corner.
const TAIL_PX = { x: 12, y: 197 };
const PLANE_CENTER_PX = { x: 441 / 2, y: 215 / 2 };

function rotatedTailOffset(t: number) {
  const scaleFactor = (PLANE_WIDTH / 441) * planeScale(t);
  const localDx = TAIL_PX.x - PLANE_CENTER_PX.x;
  const localDy = TAIL_PX.y - PLANE_CENTER_PX.y;
  const rad = (planeRotate(t) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    dx: (localDx * cos - localDy * sin) * scaleFactor,
    dy: (localDx * sin + localDy * cos) * scaleFactor,
  };
}

// Real Aviator's curve hugs the bottom-left corner while the multiplier is
// still near 1.00x, then rockets upward as it grows — a "hockey stick"
// shape, not a straight diagonal. CURVE_POWER > 1 gives exactly that: y
// barely moves while s is small, then rises sharply as s approaches 1.
// These are TAIL positions (small inset from the corner) — the plane's own
// box position is derived from these further down.
const TAIL_X_START = PANEL_WIDTH * 0.02;
const TAIL_X_MID = PANEL_WIDTH * 0.64; // hand-off point from ascend to burst
const TAIL_X_END = PANEL_WIDTH * 1.08;
const TAIL_Y_START = PANEL_HEIGHT * 0.94; // hugs the bottom-left corner at first
const TAIL_Y_MID = PANEL_HEIGHT * 0.3;
const TAIL_Y_END = -PANEL_HEIGHT * 0.35;
const CURVE_POWER = 2.8;

function tailCurveX(t: number) {
  if (t <= 0.8) {
    return TAIL_X_START + (TAIL_X_MID - TAIL_X_START) * (t / 0.8);
  }
  return TAIL_X_MID + (TAIL_X_END - TAIL_X_MID) * ((t - 0.8) / 0.2);
}
function tailCurveY(t: number) {
  if (t <= 0.8) {
    const yFrac = Math.pow(t / 0.8, CURVE_POWER);
    return TAIL_Y_START - (TAIL_Y_START - TAIL_Y_MID) * yFrac;
  }
  const burstFrac = Math.pow((t - 0.8) / 0.2, 1.5);
  return TAIL_Y_MID - (TAIL_Y_MID - TAIL_Y_END) * burstFrac;
}

// The plane's own <Image> is positioned (translateX/Y, i.e. its top-left
// corner) by subtracting the tail's rotated offset from the desired tail
// position, so the tail itself — not the box center — always sits exactly
// on the curve.
const planeX = (t: number) => tailCurveX(t) - PLANE_WIDTH / 2 - rotatedTailOffset(t).dx;
const planeY = (t: number) => tailCurveY(t) - PLANE_HEIGHT / 2 - rotatedTailOffset(t).dy;

function tailPoint(t: number) {
  return { x: tailCurveX(t), y: tailCurveY(t) };
}

function randomAscendMs() {
  return ASCEND_MS_MIN + Math.random() * (ASCEND_MS_MAX - ASCEND_MS_MIN);
}

function FlightTrail() {
  const [t, setT] = useState(0);
  const [trailFade, setTrailFade] = useState(1);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const fadeStartRef = useRef(0);
  const burstStartRef = useRef(0);
  const ascendMsRef = useRef(randomAscendMs());
  const phaseRef = useRef<'ascend' | 'lineFade' | 'burst' | 'paused'>('ascend');

  useEffect(() => {
    let mounted = true;
    const tick = (now: number) => {
      if (!mounted) return;
      if (phaseRef.current === 'ascend') {
        if (!startRef.current) startRef.current = now;
        const elapsed = now - startRef.current;
        const ascendMs = ascendMsRef.current;
        setT(Math.min(0.8, 0.8 * (elapsed / ascendMs)));
        if (elapsed >= ascendMs) {
          setT(0.8);
          phaseRef.current = 'lineFade';
          fadeStartRef.current = now;
        }
      } else if (phaseRef.current === 'lineFade') {
        // Plane holds still at t=0.8 while the red line fades out first.
        const fadeElapsed = now - fadeStartRef.current;
        setTrailFade(Math.max(0, 1 - fadeElapsed / LINE_FADE_MS));
        if (fadeElapsed >= LINE_FADE_MS) {
          setTrailFade(0);
          phaseRef.current = 'burst';
          burstStartRef.current = now;
        }
      } else if (phaseRef.current === 'burst') {
        // Only once the line is fully gone does the plane dash away — and
        // it does so almost instantly, too fast to react to.
        const burstElapsed = now - burstStartRef.current;
        const bs = Math.min(1, burstElapsed / BURST_MS);
        setT(0.8 + 0.2 * bs);
        if (burstElapsed >= BURST_MS) {
          phaseRef.current = 'paused';
          setTimeout(() => {
            if (!mounted) return;
            startRef.current = 0;
            ascendMsRef.current = randomAscendMs();
            setT(0);
            setTrailFade(1);
            phaseRef.current = 'ascend';
          }, ROUND_PAUSE_MS);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Trail traces the plane's tail tip (not its geometric center) so the
  // red line always meets the plane exactly at its tail, at every step so
  // far. The stroke itself is one fully-opaque solid path — only the glow
  // fill beneath it fades for the glow effect; trailFade is what makes the
  // whole line vanish quickly once the plane has flown away.
  // Clamped to the panel's own box: during the fly-away burst the plane
  // itself is allowed to dash out above/past the border (that's the
  // intended premium crash effect), but the line stays bounded inside the
  // panel like a real graph, instead of leaking off past the screen edge.
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= TRAIL_SAMPLES; i++) {
    const raw = tailPoint((t * i) / TRAIL_SAMPLES);
    points.push({
      x: Math.min(Math.max(raw.x, 0), PANEL_WIDTH),
      y: Math.min(Math.max(raw.y, 0), PANEL_HEIGHT),
    });
  }
  const lineD = points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  const fillD = `M ${lineD} L ${points[points.length - 1].x.toFixed(1)} ${PANEL_HEIGHT} L ${points[0].x.toFixed(1)} ${PANEL_HEIGHT} Z`;

  return (
    <>
      <Svg width={PANEL_WIDTH} height={PANEL_HEIGHT} style={[styles.trailSvg, { opacity: trailFade }]} pointerEvents="none">
        <Defs>
          <LinearGradient id="trailFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C4172C" stopOpacity={0.5} />
            <Stop offset="1" stopColor="#C4172C" stopOpacity={0.05} />
          </LinearGradient>
        </Defs>
        <Path d={fillD} fill="url(#trailFill)" />
        <Path
          d={`M ${lineD}`}
          stroke="#E8102F"
          strokeWidth={4}
          strokeOpacity={1}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      <Image
        source={require('../../assets/aviator-plane.png')}
        resizeMode="contain"
        style={[
          styles.plane,
          {
            width: PLANE_WIDTH,
            height: PLANE_HEIGHT,
            opacity: planeOpacity(t),
            transform: [
              { translateX: planeX(t) },
              { translateY: planeY(t) },
              { rotate: `${planeRotate(t)}deg` },
              { scale: planeScale(t) },
            ],
          },
        ]}
      />
    </>
  );
}

function StakeStepper({
  layout,
  value,
  onChange,
}: {
  layout: typeof STEPPER_LAYOUT;
  value: number;
  onChange: (next: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const parsed = parseInt(text, 10);
    const clamped = Number.isFinite(parsed) ? Math.max(MIN_STAKE, parsed) : MIN_STAKE;
    setText(String(clamped));
    onChange(clamped);
  };

  const hotspot = (key: keyof typeof STEPPER_LAYOUT) => ({
    position: 'absolute' as const,
    left: layout[key].left * BET_PANEL_WIDTH,
    top: layout[key].top * BET_PANEL_HEIGHT,
    width: layout[key].width * BET_PANEL_WIDTH,
    height: layout[key].height * BET_PANEL_HEIGHT,
  });

  return (
    <>
      <Pressable
        onPress={() => onChange(Math.max(MIN_STAKE, value - STAKE_STEP))}
        hitSlop={4}
        style={hotspot('minus')}
      />
      <TextInput
        style={[hotspot('track'), styles.stakeText]}
        value={text}
        onChangeText={setText}
        onFocus={() => setEditing(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        textAlign="center"
      />
      <Pressable onPress={() => onChange(value + STAKE_STEP)} hitSlop={4} style={hotspot('plus')} />
    </>
  );
}

type PanelBetState =
  | { status: 'idle' }
  | { status: 'placing' }
  | { status: 'pending'; betId: string; amount: number; periodNumber: string }
  | { status: 'cashingOut'; betId: string; amount: number; periodNumber: string }
  | { status: 'won'; payout: number; cashoutMultiplier: number }
  | { status: 'lost' };

// Overlays the button hotspot with the current bet's state — the source
// art's own "Bet" text shows through untouched while idle; once a bet is
// live this paints a same-shaped rounded rect on top so the label can
// change (Cash Out / Won / Lost) without touching the underlying image.
function BetButton({
  layout,
  state,
  phase,
  liveMultiplier,
  onBet,
  onCashout,
}: {
  layout: { left: number; top: number; width: number; height: number };
  state: PanelBetState;
  phase: AviatorRoundView['phase'] | null;
  liveMultiplier: number;
  onBet: () => void;
  onCashout: () => void;
}) {
  const hotspot = {
    position: 'absolute' as const,
    left: layout.left * BET_PANEL_WIDTH,
    top: layout.top * BET_PANEL_HEIGHT,
    width: layout.width * BET_PANEL_WIDTH,
    height: layout.height * BET_PANEL_HEIGHT,
  };

  if (state.status === 'idle') {
    return <Pressable onPress={onBet} style={hotspot} />;
  }

  let label = '';
  let bg = 'rgba(0,0,0,0.6)';
  let onPress: (() => void) | undefined;

  if (state.status === 'placing') {
    label = 'Placing…';
  } else if (state.status === 'pending') {
    if (phase === 'FLYING') {
      label = `CASH OUT\n₹${(state.amount * liveMultiplier).toFixed(2)}`;
      bg = 'rgba(46,160,67,0.92)';
      onPress = onCashout;
    } else {
      label = `Waiting…\n₹${state.amount}`;
    }
  } else if (state.status === 'cashingOut') {
    label = 'Cashing out…';
    bg = 'rgba(46,160,67,0.92)';
  } else if (state.status === 'won') {
    label = `WON\n+₹${state.payout.toFixed(2)}`;
    bg = 'rgba(46,160,67,0.9)';
  } else if (state.status === 'lost') {
    label = 'LOST';
    bg = 'rgba(196,23,44,0.9)';
  }

  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[hotspot, styles.betOverlay, { backgroundColor: bg }]}>
      <Text style={styles.betOverlayText}>{label}</Text>
    </Pressable>
  );
}

export default function AviatorScreen2() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();
  const [stake1, setStake1] = useState(MIN_STAKE);
  const [stake2, setStake2] = useState(MIN_STAKE);
  const [round, setRound] = useState<AviatorRoundView | null>(null);
  const [history, setHistory] = useState<number[]>(HISTORY_SAMPLE);
  const [bet1, setBet1] = useState<PanelBetState>({ status: 'idle' });
  const [bet2, setBet2] = useState<PanelBetState>({ status: 'idle' });

  // Polling reads the latest bet state via refs (not the state variables
  // directly) so the interval set up once on mount always sees the
  // current value without needing to be torn down and recreated.
  const bet1Ref = useRef(bet1);
  const bet2Ref = useRef(bet2);
  useEffect(() => {
    bet1Ref.current = bet1;
  }, [bet1]);
  useEffect(() => {
    bet2Ref.current = bet2;
  }, [bet2]);

  const resolveIfPending = useCallback(
    async (bet: PanelBetState, setBet: (s: PanelBetState) => void) => {
      if (bet.status !== 'pending') return;
      try {
        const bets = await fetchAviatorMyBets();
        const match = bets.find((b) => b.id === bet.betId);
        if (!match) return;
        if (match.status === 'WON') {
          setBet({ status: 'won', payout: Number(match.payout), cashoutMultiplier: Number(match.cashoutMultiplier ?? 0) });
          refreshWallet().catch(() => {});
        } else if (match.status === 'LOST') {
          setBet({ status: 'lost' });
        }
      } catch {
        // Transient failure — next poll tick tries again.
      }
    },
    [refreshWallet]
  );

  useEffect(() => {
    let mounted = true;
    const lastPeriod = { current: null as string | null };

    const poll = async () => {
      try {
        const view = await fetchAviatorCurrentRound();
        if (!mounted) return;
        setRound(view);

        if (lastPeriod.current !== null && lastPeriod.current !== view.periodNumber) {
          // A new round has started — any bet from the previous one is by
          // now either won/lost (resolved below while it was CRASHED) or
          // never got placed, so it's safe to reset both panels.
          setBet1((b) => (b.status === 'idle' ? b : { status: 'idle' }));
          setBet2((b) => (b.status === 'idle' ? b : { status: 'idle' }));
          fetchAviatorHistory()
            .then((entries) => setHistory(entries.slice(0, 7).reverse().map((e) => Number(e.crashMultiplier))))
            .catch(() => {});
        }
        lastPeriod.current = view.periodNumber;

        if (view.phase === 'CRASHED') {
          resolveIfPending(bet1Ref.current, setBet1);
          resolveIfPending(bet2Ref.current, setBet2);
        }
      } catch {
        // Transient network hiccup — just try again on the next tick.
      }
    };

    poll();
    fetchAviatorHistory()
      .then((entries) => setHistory(entries.slice(0, 7).reverse().map((e) => Number(e.crashMultiplier))))
      .catch(() => {});
    const id = setInterval(poll, 350);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [resolveIfPending]);

  const placeBet = useCallback(
    async (panel: 1 | 2) => {
      const stake = panel === 1 ? stake1 : stake2;
      const setBet = panel === 1 ? setBet1 : setBet2;
      if (!round || round.phase !== 'BETTING') {
        Alert.alert('Betting closed', 'Wait for the next round to place a bet.');
        return;
      }
      setBet({ status: 'placing' });
      try {
        const result = await placeAviatorBet(stake);
        setBet({ status: 'pending', betId: result.id, amount: Number(result.amount), periodNumber: round.periodNumber });
        refreshWallet().catch(() => {});
      } catch (err) {
        setBet({ status: 'idle' });
        Alert.alert('Bet failed', err instanceof ApiClientError ? err.message : 'Please try again.');
      }
    },
    [round, stake1, stake2, refreshWallet]
  );

  const cashout = useCallback(
    async (panel: 1 | 2) => {
      const bet = panel === 1 ? bet1 : bet2;
      const setBet = panel === 1 ? setBet1 : setBet2;
      if (bet.status !== 'pending') return;
      const { betId, amount, periodNumber } = bet;
      setBet({ status: 'cashingOut', betId, amount, periodNumber });
      try {
        const result = await cashOutAviatorBet(betId);
        setBet({ status: 'won', payout: result.payout, cashoutMultiplier: result.multiplier });
        refreshWallet().catch(() => {});
      } catch (err) {
        Alert.alert('Cash out failed', err instanceof ApiClientError ? err.message : 'Please try again.');
        setBet({ status: 'pending', betId, amount, periodNumber });
      }
    },
    [bet1, bet2, refreshWallet]
  );

  const multiplierLabel = round ? `${round.multiplier.toFixed(2)}x` : '1.00x';
  const multiplierColor = round?.phase === 'CRASHED' ? '#FF3B4E' : '#FFFFFF';

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={10}
        style={[styles.backBtn, { top: insets.top + 8 }]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
      </Pressable>

      <Text style={[styles.balanceChip, { top: insets.top + 8 }]}>₹{coins.toFixed(2)}</Text>

      <Image
        source={require('../../assets/aviator-logo.png')}
        resizeMode="contain"
        style={[styles.logo, { marginTop: insets.top + 8, width: LOGO_WIDTH, height: LOGO_HEIGHT }]}
      />

      <View style={[styles.historyBar, { width: PANEL_WIDTH, height: HISTORY_BAR_HEIGHT }]}>
        {history.map((mult, i) => (
          <Text key={i} style={[styles.historyChip, { color: historyColor(mult) }]}>
            {mult.toFixed(2)}x
          </Text>
        ))}
      </View>

      <View style={[styles.panelWrap, { width: PANEL_WIDTH, height: PANEL_HEIGHT }]}>
        <Image
          source={require('../../assets/aviator-panel-bg.png')}
          style={{ width: PANEL_WIDTH, height: PANEL_HEIGHT }}
          resizeMode="contain"
        />
        <FlightTrail />
        <View style={styles.multiplierWrap} pointerEvents="none">
          <Text style={[styles.multiplierText, { color: multiplierColor }]}>{multiplierLabel}</Text>
          {round?.phase === 'CRASHED' && <Text style={styles.multiplierSubLabel}>FLEW AWAY!</Text>}
          {round?.phase === 'BETTING' && <Text style={styles.multiplierSubLabel}>Next round starting…</Text>}
        </View>
      </View>

      <View style={[styles.betPanelWrap, { width: BET_PANEL_WIDTH, height: BET_PANEL_HEIGHT }]}>
        <Image
          source={require('../../assets/aviator-bet-panel.png')}
          style={{ width: BET_PANEL_WIDTH, height: BET_PANEL_HEIGHT }}
          resizeMode="contain"
        />
        <StakeStepper layout={STEPPER_LAYOUT} value={stake1} onChange={setStake1} />
        <StakeStepper layout={STEPPER_LAYOUT_2} value={stake2} onChange={setStake2} />
        <BetButton
          layout={BET_BUTTON_LAYOUT_1}
          state={bet1}
          phase={round?.phase ?? null}
          liveMultiplier={round?.multiplier ?? 1}
          onBet={() => placeBet(1)}
          onCashout={() => cashout(1)}
        />
        <BetButton
          layout={BET_BUTTON_LAYOUT_2}
          state={bet2}
          phase={round?.phase ?? null}
          liveMultiplier={round?.multiplier ?? 1}
          onBet={() => placeBet(2)}
          onCashout={() => cashout(2)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000', alignItems: 'center' },
  backBtn: {
    position: 'absolute',
    left: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  balanceChip: {
    position: 'absolute',
    right: 12,
    color: '#3ECF8E',
    fontSize: 15,
    fontWeight: '700',
    zIndex: 10,
  },
  // Logo, history bar and panel are stacked as normal flow siblings (each
  // with its own marginTop gap) instead of independently-computed absolute
  // offsets, so they can never overlap regardless of a device's actual
  // safe-area inset.
  logo: {},
  historyBar: {
    marginTop: 10,
    backgroundColor: '#2C2D31',
    borderRadius: HISTORY_BAR_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 10,
  },
  historyChip: {
    fontSize: 12,
    fontWeight: '600',
  },
  panelWrap: {
    marginTop: 14,
  },
  plane: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  trailSvg: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  betPanelWrap: {
    marginTop: 30,
    alignSelf: 'center',
  },
  stakeText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    padding: 0,
    backgroundColor: 'transparent',
  },
  multiplierWrap: {
    position: 'absolute',
    top: PANEL_HEIGHT * 0.3,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  multiplierText: {
    fontSize: 40,
    fontWeight: '800',
  },
  multiplierSubLabel: {
    marginTop: 4,
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  betOverlay: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  betOverlayText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
});
