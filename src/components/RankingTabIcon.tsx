import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

const badge = require('../../assets/ranking-badge.webp');
const ASPECT = 820 / 700;

export default function RankingTabIcon({ focused }: { focused: boolean }) {
  const scale = useRef(new Animated.Value(focused ? 1 : 0.82)).current;
  const hop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: focused ? 1 : 0.82,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();

    if (focused) {
      hop.setValue(0);
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(hop, { toValue: 0, friction: 3.5, tension: 140, useNativeDriver: true }),
      ]).start();
    }
  }, [focused, scale, hop]);

  const translateY = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -7] });
  const rotate = hop.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '-6deg', '0deg'] });

  return (
    <Animated.Image
      source={badge}
      resizeMode="contain"
      style={[
        styles.image,
        {
          opacity: focused ? 1 : 0.6,
          transform: [{ scale }, { translateY }, { rotate }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: 30,
    height: 30 * ASPECT,
  },
});
