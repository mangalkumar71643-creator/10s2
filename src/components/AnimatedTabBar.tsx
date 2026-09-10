import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconName } from '../data/models';
import { BottomTabParamList } from '../navigation/types';
import { colors, gradients, radius, spacing, typography } from '../theme';

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

type TabKey = keyof BottomTabParamList;
type AnimationKind = 'bounce' | 'wobble' | 'shake' | 'flip' | 'float';

const TAB_CONFIG: Record<TabKey, { icon: IconName; label: string; animation: AnimationKind }> = {
  Home: { icon: 'home-variant', label: 'Home', animation: 'bounce' },
  Ranking: { icon: 'trophy-variant', label: 'Rank', animation: 'wobble' },
  Rewards: { icon: 'gift', label: 'Rewards', animation: 'shake' },
  Wallet: { icon: 'wallet', label: 'Wallet', animation: 'flip' },
  Vip: { icon: 'crown', label: 'VIP', animation: 'float' },
};

function useIconTransform(animation: AnimationKind, anim: Animated.Value) {
  switch (animation) {
    case 'bounce': {
      const scale = anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 1.22, 1] });
      return [{ scale }];
    }
    case 'wobble': {
      const rotate = anim.interpolate({
        inputRange: [0, 0.25, 0.5, 0.75, 1],
        outputRange: ['0deg', '-20deg', '16deg', '-8deg', '0deg'],
      });
      const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
      return [{ rotate }, { scale }];
    }
    case 'shake': {
      const translateX = anim.interpolate({
        inputRange: [0, 0.2, 0.4, 0.6, 0.8, 1],
        outputRange: [0, -7, 7, -5, 5, 0],
      });
      const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1] });
      return [{ translateX }, { scale }];
    }
    case 'flip': {
      const rotateY = anim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '0deg'] });
      return [{ perspective: 300 }, { rotateY }];
    }
    case 'float': {
      const translateY = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [12, -7, 0] });
      const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] });
      return [{ translateY }, { scale }];
    }
  }
}

function TabButton({
  isFocused,
  onPress,
  onLongPress,
  config,
}: {
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  config: (typeof TAB_CONFIG)[TabKey];
}) {
  const pillScale = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const iconAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  const ringLoop = useRef<Animated.CompositeAnimation | null>(null);

  const playEntrance = () => {
    iconAnim.setValue(0);
    Animated.timing(iconAnim, {
      toValue: 1,
      duration: config.animation === 'flip' ? 420 : 520,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    Animated.spring(pillScale, {
      toValue: isFocused ? 1 : 0,
      friction: 7,
      tension: 140,
      useNativeDriver: true,
    }).start();

    if (isFocused) {
      playEntrance();
      ringLoop.current?.stop();
      ring.setValue(0);
      ringLoop.current = Animated.loop(
        Animated.timing(ring, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true })
      );
      ringLoop.current.start();
    } else {
      ringLoop.current?.stop();
      ring.setValue(0);
    }
    return () => {
      ringLoop.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  const iconTransform = useIconTransform(config.animation, iconAnim);
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  const handlePress = () => {
    if (isFocused) playEntrance();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      style={styles.tabButton}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
    >
      <View style={styles.iconWrap}>
        {isFocused && (
          <Animated.View
            pointerEvents="none"
            style={[styles.ring, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]}
          />
        )}
        <Animated.View
          pointerEvents="none"
          style={[styles.pill, { opacity: pillScale, transform: [{ scale: pillScale }] }]}
        >
          <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <AnimatedIcon
          name={config.icon}
          size={21}
          color={isFocused ? colors.background : colors.textMuted}
          style={{ transform: iconTransform }}
        />
      </View>
      <Text style={[styles.label, isFocused && styles.labelActive]} numberOfLines={1}>
        {config.label}
      </Text>
    </Pressable>
  );
}

export default function AnimatedTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { marginBottom: Math.max(insets.bottom, spacing.md) }]}>
      <LinearGradient colors={gradients.card} style={StyleSheet.absoluteFill} />
      <View style={styles.row}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const config = TAB_CONFIG[route.name as TabKey];
          const { options } = descriptors[route.key];

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };
          const onLongPress = () => {
            navigation.emit({ type: 'tabLongPress', target: route.key });
          };

          return (
            <TabButton
              key={route.key}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              config={{ ...config, label: (options.title as string) ?? config.label }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: radius.pill,
  },
  ring: {
    position: 'absolute',
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.goldLight,
  },
  label: {
    fontSize: typography.xs - 1,
    fontWeight: '600',
    color: colors.textMuted,
  },
  labelActive: {
    color: colors.gold,
    fontWeight: '800',
  },
});
