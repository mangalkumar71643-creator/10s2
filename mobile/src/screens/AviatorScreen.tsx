import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
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

function FlyingPlane() {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    const runCycle = () => {
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: ASCEND_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !cancelled) {
          setTimeout(runCycle, FLYAWAY_PAUSE);
        }
      });
    };
    runCycle();
    return () => {
      cancelled = true;
    };
  }, [progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [PANEL_WIDTH * 0.05, PANEL_WIDTH * 0.62, PANEL_WIDTH * 1.05],
  });
  const translateY = progress.interpolate({
    inputRange: [0, 0.4, 0.8, 1],
    outputRange: [PANEL_HEIGHT * 0.72, PANEL_HEIGHT * 0.5, PANEL_HEIGHT * 0.32, -PANEL_HEIGHT * 0.4],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: ['-6deg', '-16deg', '-42deg'],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.75, 0.95, 1],
    outputRange: [1, 1, 0.5, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.8, 1],
    outputRange: [1, 1, 1.15],
  });

  return (
    <Animated.Image
      source={require('../../assets/aviator-plane.png')}
      resizeMode="contain"
      style={[
        styles.plane,
        {
          width: PLANE_WIDTH,
          height: PLANE_HEIGHT,
          opacity,
          transform: [{ translateX }, { translateY }, { rotate }, { scale }],
        },
      ]}
    />
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
        <FlyingPlane />
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
