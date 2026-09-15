import React from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions } from 'react-native';

// Reference screenshot's own pixel size — used to scale it to full device
// width while keeping its proportions.
const IMAGE_ASPECT = 688 / 1504;

// Just the reference image for now, nothing else — no wiring, no buttons,
// no live balance. That gets added on top of this once the design is final.
export default function ColorPredictScreen() {
  const { width } = useWindowDimensions();

  return (
    <ScrollView style={styles.root} showsVerticalScrollIndicator={false}>
      <Image source={require('../../assets/win-go-screen.jpg')} style={{ width, height: width / IMAGE_ASPECT }} resizeMode="cover" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
});
