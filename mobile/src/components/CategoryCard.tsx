import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { GameCategory } from '../data/models';
import { radius, shadow, spacing, typography } from '../theme';

type Props = { category: GameCategory; onPress: () => void };

export default function CategoryCard({ category, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <LinearGradient colors={category.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <MaterialCommunityIcons name={category.icon} size={26} color="rgba(255,255,255,0.95)" />
        <Text style={styles.label}>{category.name}</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '23%', marginBottom: spacing.md },
  card: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.card,
  },
  label: { color: '#fff', fontSize: typography.xs, fontWeight: '700', marginTop: spacing.xs },
});
