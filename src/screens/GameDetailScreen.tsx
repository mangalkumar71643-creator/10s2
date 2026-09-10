import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import RewardPopup from '../components/RewardPopup';
import ScreenContainer from '../components/ScreenContainer';
import { Game } from '../data/models';
import { RootStackParamList } from '../navigation/types';
import { fetchGameById } from '../services/gameService';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { useGameState } from '../state/GameStateContext';

type Route = RouteProp<RootStackParamList, 'GameDetail'>;

export default function GameDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Route>();
  const { favoriteGameIds, toggleFavoriteGame } = useGameState();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | undefined>(undefined);
  const [rewardPopup, setRewardPopup] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchGameById(route.params.gameId).then((g) => {
      if (!cancelled) {
        setGame(g);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [route.params.gameId]);

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  if (!game) {
    return (
      <ScreenContainer>
        <EmptyState icon="alert-circle-outline" title="Game not found" />
      </ScreenContainer>
    );
  }

  const isFavorite = favoriteGameIds.includes(game.id);

  function handlePlay() {
    const reward = Math.round(game!.rewardMin + Math.random() * (game!.rewardMax - game!.rewardMin));
    setRewardPopup(reward);
  }

  return (
    <ScreenContainer scroll={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <LinearGradient colors={game.gradient} style={styles.artwork}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
            <MaterialCommunityIcons name="chevron-left" size={26} color="#fff" />
          </Pressable>
          <Pressable onPress={() => toggleFavoriteGame(game.id)} hitSlop={10} style={styles.favButton}>
            <MaterialCommunityIcons name={isFavorite ? 'heart' : 'heart-outline'} size={22} color="#fff" />
          </Pressable>
          <MaterialCommunityIcons name={game.icon} size={90} color="rgba(255,255,255,0.9)" />
        </LinearGradient>

        <View style={styles.body}>
          <Text style={styles.title}>{game.title}</Text>
          <Text style={styles.category}>{game.categoryId.toUpperCase()}</Text>

          <View style={styles.metaRow}>
            <View style={styles.ratingRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <MaterialCommunityIcons
                  key={i}
                  name={i < Math.round(game.rating) ? 'star' : 'star-outline'}
                  size={16}
                  color={colors.gold}
                />
              ))}
              <Text style={styles.ratingText}>{game.rating.toFixed(1)}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <StatBlock icon="account-group-outline" label="Players" value={`${(game.players / 1000).toFixed(1)}K`} />
            <StatBlock icon="database-outline" label="Size" value={`${game.sizeMb} MB`} />
            <StatBlock icon="speedometer" label="Difficulty" value={game.difficulty} />
          </View>

          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.description}>{game.description}</Text>

          <View style={styles.rewardCard}>
            <MaterialCommunityIcons name="circle-multiple" size={20} color={colors.gold} />
            <Text style={styles.rewardText}>
              Rewards: {game.rewardMin}–{game.rewardMax} Virtual Coins
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.playBar}>
        <PrimaryButton label="PLAY NOW" onPress={handlePlay} />
      </View>

      <RewardPopup
        visible={rewardPopup !== null}
        amount={rewardPopup ?? 0}
        title={`${game.title} Reward`}
        onClose={() => setRewardPopup(null)}
      />
    </ScreenContainer>
  );
}

function StatBlock({ icon, label, value }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; value: string }) {
  return (
    <View style={styles.statBlock}>
      <MaterialCommunityIcons name={icon} size={18} color={colors.gold} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { height: 240, alignItems: 'center', justifyContent: 'center' },
  backButton: {
    position: 'absolute',
    top: spacing.xl,
    left: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.lg,
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { padding: spacing.lg },
  title: { color: colors.textPrimary, fontSize: typography.xxl, fontWeight: '800' },
  category: { color: colors.gold, fontSize: typography.xs, fontWeight: '700', letterSpacing: 1, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  ratingRow: { flexDirection: 'row', alignItems: 'center' },
  ratingText: { color: colors.textSecondary, fontSize: typography.sm, marginLeft: spacing.xs, fontWeight: '700' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  statBlock: { alignItems: 'center' },
  statValue: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.sm, marginTop: 4 },
  statLabel: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  sectionTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md, marginTop: spacing.xl, marginBottom: spacing.sm },
  description: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  rewardText: { color: colors.gold, fontWeight: '700', fontSize: typography.sm, marginLeft: spacing.sm },
  playBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.card,
  },
});
