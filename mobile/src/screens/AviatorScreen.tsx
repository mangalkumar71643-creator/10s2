import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useEffect, useState } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';
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
