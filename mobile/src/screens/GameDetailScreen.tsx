import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AmountInputModal from '../components/AmountInputModal';
import EmptyState from '../components/EmptyState';
import LoadingState from '../components/LoadingState';
import PrimaryButton from '../components/PrimaryButton';
import RewardPopup from '../components/RewardPopup';
import ScreenContainer from '../components/ScreenContainer';
import { Game } from '../data/models';
import { RootStackParamList } from '../navigation/types';
import { fetchGameById, fetchGameConfig, playGame } from '../services/gameService';
import { ApiClientError } from '../api/client';
import { colors, radius, shadow, spacing, typography } from '../theme';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';

type Route = RouteProp<RootStackParamList, 'GameDetail'>;

export default function GameDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Route>();
  const { favoriteGameIds, toggleFavoriteGame, coins, refreshWallet } = useGameState();
  const { backendUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<Game | undefined>(undefined);
  const [stakeModalOpen, setStakeModalOpen] = useState(false);
  const [placingBet, setPlacingBet] = useState(false);
  const [result, setResult] = useState<{ won: boolean; amount: number } | null>(null);
  const [stakeLimits, setStakeLimits] = useState({ minStake: 5, maxStake: 500 });

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchGameById(route.params.gameId), fetchGameConfig()]).then(([g, config]) => {
      if (!cancelled) {
        setGame(g);
        setStakeLimits(config);
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
  const kycApproved = backendUser?.kycStatus === 'APPROVED';

  function handlePlayPress() {
    if (!kycApproved) {
      Alert.alert('Verify your identity', 'Complete KYC verification in Settings before playing for real money.');
      return;
    }
    setStakeModalOpen(true);
  }

  async function handleStake(stake: number) {
    if (stake > coins) {
      Alert.alert('Insufficient balance', 'Add funds to your wallet before staking this amount.');
      return;
    }
    setPlacingBet(true);
    try {
      const outcome = await playGame(game!.id, stake);
      await refreshWallet();
      setStakeModalOpen(false);
      setResult({ won: outcome.round.won, amount: Number(outcome.round.payout) });
    } catch (err) {
      Alert.alert('Could not place bet', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setPlacingBet(false);
    }
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
              Stake {stakeLimits.minStake}–{stakeLimits.maxStake} Coins per round · win pays 2x
            </Text>
          </View>
          <Text style={styles.rngNote}>
            Outcomes are decided by a server-side random number generator — see backend/README.md.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.playBar}>
        <PrimaryButton label="PLAY FOR REAL" onPress={handlePlayPress} />
      </View>

      <AmountInputModal
        visible={stakeModalOpen}
        title="Place your stake"
        confirmLabel="Play"
        helperText={`Balance: ${coins.toLocaleString('en-IN')} Coins · Stake ${stakeLimits.minStake}-${stakeLimits.maxStake}`}
        defaultValue={String(stakeLimits.minStake)}
        busy={placingBet}
        onConfirm={handleStake}
        onClose={() => setStakeModalOpen(false)}
      />

      <RewardPopup
        visible={result !== null}
        amount={result?.amount ?? 0}
        title={result?.won ? `${game.title} — You Won!` : `${game.title} — No Win This Time`}
        onClose={() => setResult(null)}
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
  rngNote: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.sm, lineHeight: 16 },
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
