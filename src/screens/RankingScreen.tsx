import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, radius, spacing, typography } from '../theme';

type Tab = 'leaderboard' | 'myrank';

export default function RankingScreen() {
  const { notifications, coins } = useGameState();
  const { avatarId } = useAuth();
  const [tab, setTab] = useState<Tab>('leaderboard');
  const hasUnread = notifications.some((n) => !n.read);

  return (
    <ScreenContainer>
      <AppHeader title="Ranking" hasUnreadNotifications={hasUnread} showCoins={false} />

      <View style={styles.tabRow}>
        <Pressable onPress={() => setTab('leaderboard')} style={[styles.tab, tab === 'leaderboard' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'leaderboard' && styles.tabTextActive]}>Leaderboard</Text>
        </Pressable>
        <Pressable onPress={() => setTab('myrank')} style={[styles.tab, tab === 'myrank' && styles.tabActive]}>
          <Text style={[styles.tabText, tab === 'myrank' && styles.tabTextActive]}>My Rank</Text>
        </Pressable>
      </View>

      {tab === 'leaderboard' ? (
        <View style={styles.wrap}>
          <View style={styles.meCard}>
            <Image source={AVATARS[avatarId - 1]} style={styles.meAvatar} />
            <View style={styles.meInfo}>
              <Text style={styles.meName}>You</Text>
              <View style={styles.meCoinsRow}>
                <MaterialCommunityIcons name="circle-multiple" size={13} color={colors.gold} />
                <Text style={styles.meCoins}>{coins.toLocaleString('en-US')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-group-outline" size={40} color={colors.textMuted} />
            <Text style={styles.emptyText}>No other players on the leaderboard yet.</Text>
            <Text style={styles.emptyHint}>Invite friends from Rewards to start competing for the top spot.</Text>
          </View>
        </View>
      ) : (
        <View style={styles.wrap}>
          <Text style={styles.myRankBig}>—</Text>
          <Text style={styles.myRankLabel}>Not ranked yet</Text>

          <View style={styles.meCard}>
            <Image source={AVATARS[avatarId - 1]} style={styles.meAvatar} />
            <View style={styles.meInfo}>
              <Text style={styles.meName}>You</Text>
              <View style={styles.meCoinsRow}>
                <MaterialCommunityIcons name="circle-multiple" size={13} color={colors.gold} />
                <Text style={styles.meCoins}>{coins.toLocaleString('en-US')}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.myRankHint}>
            The leaderboard ranks players by coin balance. Once other players join, your rank will show here.
          </Text>
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', paddingHorizontal: spacing.lg, marginTop: spacing.md },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.gold },
  tabText: { color: colors.textMuted, fontSize: typography.sm, fontWeight: '700' },
  tabTextActive: { color: colors.gold },
  wrap: { alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.lg },
  meCard: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
  },
  meAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: spacing.md },
  meInfo: { flex: 1 },
  meName: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md },
  meCoinsRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, gap: 4 },
  meCoins: { color: colors.gold, fontWeight: '700', fontSize: typography.sm },
  emptyState: { alignItems: 'center', marginTop: spacing.xxxl, gap: spacing.sm },
  emptyText: { color: colors.textSecondary, fontSize: typography.sm, fontWeight: '700', textAlign: 'center' },
  emptyHint: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', paddingHorizontal: spacing.lg },
  myRankBig: { color: colors.gold, fontSize: 56, fontWeight: '800' },
  myRankLabel: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.xs, marginBottom: spacing.xl },
  myRankHint: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.lg, textAlign: 'center' },
});
