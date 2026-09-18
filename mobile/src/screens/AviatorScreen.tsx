import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';

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
const HISTORY_BAR_MARGIN_BOTTOM = 10;
const HISTORY_BAR_TOP = 110 - HISTORY_BAR_MARGIN_BOTTOM - HISTORY_BAR_HEIGHT;
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

export default function AviatorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [stake1, setStake1] = useState(MIN_STAKE);
  const [stake2, setStake2] = useState(MIN_STAKE);

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={10}
        style={[styles.backBtn, { top: insets.top + 8 }]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
      </Pressable>

      <Image
        source={require('../../assets/aviator-logo.png')}
        resizeMode="contain"
        style={[
          styles.logo,
          { top: insets.top + 8, left: (SCREEN_WIDTH - LOGO_WIDTH) / 2, width: LOGO_WIDTH, height: LOGO_HEIGHT },
        ]}
      />

      <View
        style={[
          styles.historyBar,
          { top: HISTORY_BAR_TOP, left: (SCREEN_WIDTH - PANEL_WIDTH) / 2, width: PANEL_WIDTH, height: HISTORY_BAR_HEIGHT },
        ]}
      >
        {HISTORY_SAMPLE.map((mult, i) => (
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
      </View>

      <View style={[styles.betPanelWrap, { width: BET_PANEL_WIDTH, height: BET_PANEL_HEIGHT }]}>
        <Image
          source={require('../../assets/aviator-bet-panel.png')}
          style={{ width: BET_PANEL_WIDTH, height: BET_PANEL_HEIGHT }}
          resizeMode="contain"
        />
        <StakeStepper layout={STEPPER_LAYOUT} value={stake1} onChange={setStake1} />
        <StakeStepper layout={STEPPER_LAYOUT_2} value={stake2} onChange={setStake2} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  backBtn: {
    position: 'absolute',
    left: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  logo: {
    position: 'absolute',
    zIndex: 5,
  },
  historyBar: {
    position: 'absolute',
    zIndex: 5,
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
    marginTop: 110,
    alignSelf: 'center',
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
});
