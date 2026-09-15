import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useGameState } from '../state/GameStateContext';

// Reference screenshot's own pixel size — used to scale it (and the overlaid
// balance text below) to full device width while keeping proportions.
const IMAGE_REF_WIDTH = 688;
const IMAGE_ASPECT = 688 / 1504;

// Vertical center, in that same 688-wide reference image, of the blank gap
// between the "Wallet balance" label and the Withdraw/Deposit buttons —
// measured directly off the screenshot.
const BALANCE_CENTER_Y = 367;

// Just the reference image, plus the real wallet balance overlaid into the
// blank space it left for it — no other buttons/logic added yet.
export default function ColorPredictScreen() {
  const { width } = useWindowDimensions();
  const { coins } = useGameState();
  const scale = width / IMAGE_REF_WIDTH;
  const imageHeight = width / IMAGE_ASPECT;

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
      </View>
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
