import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
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

// Panel background asset's own aspect ratio (cropped to just the rounded
// rays panel, corners made transparent) — used so scaling it up keeps its
// proportions instead of stretching.
const PANEL_ASPECT = 517 / 673;
const SCREEN_WIDTH = Dimensions.get('window').width;
// Base width matches the app's usual 16px-per-side card margin; the panel
// is then sized 10% larger than that per the requested layout.
const PANEL_WIDTH = (SCREEN_WIDTH - 32) * 1.1;
const PANEL_HEIGHT = PANEL_WIDTH * PANEL_ASPECT;

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

const ASCEND_DURATION = 4200;
const FLYAWAY_PAUSE = 1400;
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

const planeX = (t: number) => interpolate(t, [0, 0.8, 1], [PANEL_WIDTH * 0.05, PANEL_WIDTH * 0.62, PANEL_WIDTH * 1.05]);
const planeY = (t: number) =>
  interpolate(t, [0, 0.4, 0.8, 1], [PANEL_HEIGHT * 0.72, PANEL_HEIGHT * 0.5, PANEL_HEIGHT * 0.32, -PANEL_HEIGHT * 0.4]);
const planeRotate = (t: number) => interpolate(t, [0, 0.8, 1], [-6, -16, -42]);
const planeOpacity = (t: number) => interpolate(t, [0, 0.75, 0.95, 1], [1, 1, 0.5, 0]);
const planeScale = (t: number) => interpolate(t, [0, 0.8, 1], [1, 1, 1.15]);

// Tail-fin tip in the source plane art (441x215px), used so the trail
// always meets the plane at its tail instead of its geometric center.
const TAIL_PX = { x: 12, y: 197 };
const PLANE_CENTER_PX = { x: 441 / 2, y: 215 / 2 };

// Screen-space point where the trail should end: the plane's tail tip,
// rotated and scaled exactly like the rendered <Image> is at time t.
function tailPoint(t: number) {
  const scaleFactor = (PLANE_WIDTH / 441) * planeScale(t);
  const localDx = TAIL_PX.x - PLANE_CENTER_PX.x;
  const localDy = TAIL_PX.y - PLANE_CENTER_PX.y;
  const rad = (planeRotate(t) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rx = (localDx * cos - localDy * sin) * scaleFactor;
  const ry = (localDx * sin + localDy * cos) * scaleFactor;
  return {
    x: planeX(t) + PLANE_WIDTH / 2 + rx,
    y: planeY(t) + PLANE_HEIGHT / 2 + ry,
  };
}

function FlightTrail() {
  const [t, setT] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const phaseRef = useRef<'flying' | 'paused'>('flying');

  useEffect(() => {
    let mounted = true;
    const tick = (now: number) => {
      if (!mounted) return;
      if (phaseRef.current === 'flying') {
        if (!startRef.current) startRef.current = now;
        const nextT = Math.min(1, (now - startRef.current) / ASCEND_DURATION);
        setT(nextT);
        if (nextT >= 1) {
          phaseRef.current = 'paused';
          setTimeout(() => {
            if (!mounted) return;
            startRef.current = 0;
            phaseRef.current = 'flying';
            setT(0);
          }, FLYAWAY_PAUSE);
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
  // fill beneath it fades, so the line never looks patchy.
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= TRAIL_SAMPLES; i++) {
    points.push(tailPoint((t * i) / TRAIL_SAMPLES));
  }
  const lineD = points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  const fillD = `M ${lineD} L ${points[points.length - 1].x.toFixed(1)} ${PANEL_HEIGHT} L ${points[0].x.toFixed(1)} ${PANEL_HEIGHT} Z`;

  return (
    <>
      <Svg width={PANEL_WIDTH} height={PANEL_HEIGHT} style={styles.trailSvg} pointerEvents="none">
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
  panelWrap: {
    marginTop: 60,
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
