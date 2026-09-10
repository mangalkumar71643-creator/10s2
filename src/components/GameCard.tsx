import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Game } from '../data/models';
import { colors, radius, shadow, spacing, typography } from '../theme';

type Props = { game: Game; onPress: () => void; variant?: 'featured' | 'grid' };

export default function GameCard({ game, onPress, variant = 'featured' }: Props) {
  const isFeatured = variant === 'featured';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        isFeatured ? styles.featuredCard : styles.gridCard,
        { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <LinearGradient colors={game.gradient} style={[styles.artwork, isFeatured ? styles.artworkFeatured : styles.artworkGrid]}>
        <MaterialCommunityIcons name={game.icon} size={isFeatured ? 46 : 30} color="rgba(255,255,255,0.92)" />
      </LinearGradient>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {game.title}
        </Text>
        <View style={styles.metaRow}>
          <MaterialCommunityIcons name="account-group-outline" size={12} color={colors.textMuted} />
          <Text style={styles.meta}>{(game.players / 1000).toFixed(1)}K</Text>
          {isFeatured ? (
            <>
              <MaterialCommunityIcons name="star" size={12} color={colors.gold} style={{ marginLeft: spacing.sm }} />
              <Text style={styles.meta}>{game.rating.toFixed(1)}</Text>
            </>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  featuredCard: {
    width: 168,
    marginLeft: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow.card,
  },
  gridCard: {
    width: '47%',
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  artwork: { alignItems: 'center', justifyContent: 'center' },
  artworkFeatured: { height: 110 },
  artworkGrid: { height: 90 },
  info: { padding: spacing.md },
  title: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.md },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs },
  meta: { color: colors.textMuted, fontSize: typography.xs, marginLeft: 4 },
});
