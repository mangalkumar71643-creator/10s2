import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mission } from '../data/models';
import { colors, radius, spacing, typography } from '../theme';

type Props = { mission: Mission; onClaim: () => void };

const GREEN_BUTTON = ['#4FE3A0', '#1E9E63', '#0E6B41'] as const;

export default function MissionCard({ mission, onClaim }: Props) {
  const ready = mission.progress >= mission.target && !mission.claimed;
  const shown = Math.min(mission.progress, mission.target);
  const progressFraction = Math.min(1, mission.progress / mission.target);

  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <MaterialCommunityIcons name={mission.icon} size={22} color={colors.textPrimary} />
      </View>

      <View style={styles.middle}>
        <View style={styles.topRow}>
          <Text style={styles.title}>
            {mission.title}: <Text style={styles.fraction}>{shown}/{mission.target}</Text>
          </Text>
          <Text style={styles.reward}>+{mission.reward}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressFraction * 100}%` }]} />
        </View>
      </View>

      <Pressable onPress={onClaim} disabled={!ready} style={styles.buttonWrap}>
        {ready ? (
          <LinearGradient colors={GREEN_BUTTON} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.button}>
            <Text style={styles.buttonText}>Claim</Text>
          </LinearGradient>
        ) : (
          <View style={[styles.button, styles.buttonMuted]}>
            <Text style={styles.buttonTextMuted}>{mission.claimed ? 'Claimed' : 'In progress'}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.crimson,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  middle: { flex: 1, marginRight: spacing.sm },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  title: { flex: 1, color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm },
  fraction: { color: colors.gold, fontWeight: '800' },
  reward: { color: colors.gold, fontWeight: '800', fontSize: typography.md, flexShrink: 0 },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: colors.gold },
  buttonWrap: { marginLeft: spacing.xs },
  button: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMuted: { backgroundColor: colors.surfaceAlt },
  buttonText: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.xs },
  buttonTextMuted: { color: colors.textMuted, fontWeight: '800', fontSize: typography.xs },
});
