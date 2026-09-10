import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Mission } from '../data/models';
import { radius, spacing, typography } from '../theme';

type Props = { mission: Mission; onClaim: () => void };

const GREEN_BUTTON = ['#3FBE7A', '#1E9E63', '#146B45'] as const;
const CARD_BG = '#FFFFFF';
const TITLE_COLOR = '#2B2320';
const AMOUNT_COLOR = '#F07B1E';
const TRACK_COLOR = '#E4E1DD';
const BADGE_RED = '#E4453A';
const BADGE_GREEN = '#3FBE7A';

export default function MissionCard({ mission, onClaim }: Props) {
  const ready = mission.progress >= mission.target && !mission.claimed;
  const shown = Math.min(mission.progress, mission.target);
  const progressFraction = Math.min(1, mission.progress / mission.target);

  return (
    <View style={styles.card}>
      <View style={[styles.badge, { backgroundColor: mission.claimed ? BADGE_GREEN : BADGE_RED }]}>
        <MaterialCommunityIcons name={mission.claimed ? 'check' : 'close'} size={24} color="#FFFFFF" />
      </View>

      <View style={styles.middle}>
        <Text style={styles.missionName} numberOfLines={1}>
          {mission.title}
        </Text>
        <View style={styles.topRow}>
          <Text style={styles.title}>
            Progress: <Text style={styles.fraction}>{shown}/{mission.target}</Text>
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
    backgroundColor: CARD_BG,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  badge: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  missionName: { color: TITLE_COLOR, fontWeight: '800', fontSize: typography.sm, marginBottom: 2 },
  title: { flex: 1, color: TITLE_COLOR, fontWeight: '700', fontSize: typography.sm },
  fraction: { color: AMOUNT_COLOR, fontWeight: '800' },
  reward: { color: AMOUNT_COLOR, fontWeight: '800', fontSize: typography.lg, flexShrink: 0 },
  progressTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: TRACK_COLOR,
    overflow: 'hidden',
  },
  progressFill: { height: 12, borderRadius: 6, backgroundColor: AMOUNT_COLOR },
  buttonWrap: { marginLeft: spacing.xs },
  button: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonMuted: { backgroundColor: '#E4E1DD' },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: typography.xs },
  buttonTextMuted: { color: '#9A938D', fontWeight: '800', fontSize: typography.xs },
});
