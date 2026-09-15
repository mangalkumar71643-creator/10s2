import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useGameState } from '../state/GameStateContext';

// Reference screenshot's own pixel size — used to scale it (and the overlaid
// balance text below) to full device width while keeping proportions.
const IMAGE_REF_WIDTH = 688;
const IMAGE_ASPECT = 688 / 1504;

// Vertical center, in that same 688-wide reference image, of the blank gap
// above the "Wallet balance" label (between the card's top edge and that
// label) — measured directly off the screenshot.
const BALANCE_CENTER_Y = 250;

// Bounding box (in that same 688x1504 reference image) of the "Grok"
// watermark in the bottom-right corner, sampled directly off the
// screenshot — covered with a patch matching its own background there.
const WATERMARK_LEFT = 620;
const WATERMARK_TOP = 1465;
const WATERMARK_BG_TOP = 'rgb(248,247,253)';
const WATERMARK_BG_BOTTOM = 'rgb(253,253,255)';

// The "bottom half" reference image (Game history / Chart / My history +
// results table) was cropped to remove its own copy of the Big/Small bar —
// the top image above already ends with that bar, so this picks up right
// after it with no duplicate.
const BOTTOM_IMAGE_ASPECT = 1595 / 2636;

// Just the two reference images stacked into one continuous screen, plus
// the real wallet balance overlaid above the "Wallet balance" label and the
// Grok watermark patched over — no other buttons/logic added yet.
export default function ColorPredictScreen() {
  const { width } = useWindowDimensions();
  const { coins } = useGameState();
  const scale = width / IMAGE_REF_WIDTH;
  const imageHeight = width / IMAGE_ASPECT;
  const bottomImageHeight = width / BOTTOM_IMAGE_ASPECT;

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      <View style={{ width, height: imageHeight }}>
        <Image source={require('../../assets/win-go-screen.jpg')} style={{ width, height: imageHeight }} resizeMode="cover" />
        <Text
          style={[
            styles.balanceText,
            { top: scale * BALANCE_CENTER_Y - scale * 17, fontSize: scale * 30 },
          ]}
        >
          ₹{coins.toFixed(2)}
        </Text>
        <LinearGradient
          colors={[WATERMARK_BG_TOP, WATERMARK_BG_BOTTOM]}
          style={{ position: 'absolute', left: scale * WATERMARK_LEFT, top: scale * WATERMARK_TOP, right: 0, bottom: 0 }}
        />
      </View>
      <Image
        source={require('../../assets/win-go-screen-bottom.jpg')}
        style={{ width, height: bottomImageHeight }}
        resizeMode="cover"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  balanceText: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#1C8A5C',
    fontWeight: '800',
  },
});
