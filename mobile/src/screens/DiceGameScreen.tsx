import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import RewardPopup from '../components/RewardPopup';
import ScreenContainer from '../components/ScreenContainer';
import { ApiClientError } from '../api/client';
import { fetchGameConfig, playGame } from '../services/gameService';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, radius, shadow, spacing, typography } from '../theme';

const GAME_KEY = 'dice-classic';
const MIN_TARGET = 2;
const MAX_TARGET = 98;

export default function DiceGameScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { backendUser } = useAuth();
  const { coins, refreshWallet } = useGameState();
  const [target, setTarget] = useState(50);
  const [stake, setStake] = useState('10');
  const [rtp, setRtp] = useState(0.92);
  const [stakeLimits, setStakeLimits] = useState({ minStake: 5, maxStake: 500 });
  const [placingBet, setPlacingBet] = useState(false);
  const [result, setResult] = useState<{ won: boolean; amount: number; multiplier: number } | null>(null);

  useEffect(() => {
    fetchGameConfig().then((config) => {
      setRtp(config.rtp);
      setStakeLimits(config);
    });
  }, []);

  const multiplier = Math.round((rtp * 100 * 100) / target) / 100;
  const stakeAmount = Number(stake) || 0;
  const potentialPayout = Math.round(stakeAmount * multiplier * 100) / 100;
  const kycApproved = backendUser?.kycStatus === 'APPROVED';

  function adjustTarget(delta: number) {
    setTarget((prev) => Math.min(MAX_TARGET, Math.max(MIN_TARGET, prev + delta)));
  }

  async function handlePlay() {
    if (!kycApproved) {
      Alert.alert('Verify your identity', 'Complete KYC verification in Settings before playing for real money.');
      return;
    }
    if (stakeAmount < stakeLimits.minStake || stakeAmount > stakeLimits.maxStake) {
      Alert.alert('Invalid stake', `Stake must be between ${stakeLimits.minStake} and ${stakeLimits.maxStake} Coins.`);
      return;
    }
    if (stakeAmount > coins) {
      Alert.alert('Insufficient balance', 'Add funds to your wallet before staking this amount.');
      return;
    }
    setPlacingBet(true);
    try {
      const outcome = await playGame(GAME_KEY, stakeAmount, 'dice', target);
      await refreshWallet();
      setResult({
        won: outcome.round.won,
        amount: Number(outcome.round.payout),
        multiplier: Number(outcome.round.multiplier),
      });
    } catch (err) {
      Alert.alert('Could not place bet', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setPlacingBet(false);
    }
  }

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Dice</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 140 }}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Roll under</Text>
          <View style={styles.targetRow}>
            <Pressable style={styles.stepButton} onPress={() => adjustTarget(-1)}>
              <MaterialCommunityIcons name="minus" size={20} color={colors.gold} />
            </Pressable>
            <Text style={styles.targetValue}>{target}</Text>
            <Pressable style={styles.stepButton} onPress={() => adjustTarget(1)}>
              <MaterialCommunityIcons name="plus" size={20} color={colors.gold} />
            </Pressable>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Win chance</Text>
              <Text style={styles.statValue}>{target}%</Text>
            </View>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Multiplier</Text>
              <Text style={styles.statValue}>{multiplier.toFixed(2)}x</Text>
            </View>
          </View>

          <Text style={styles.cardLabel}>Stake</Text>
          <TextInput
            style={styles.stakeInput}
            keyboardType="decimal-pad"
            value={stake}
            onChangeText={setStake}
            placeholder="Stake"
            placeholderTextColor={colors.textMuted}
          />
          <Text style={styles.potential}>Potential payout: {potentialPayout.toLocaleString('en-IN')} Coins</Text>

          <PrimaryButton
            label={placingBet ? 'Rolling…' : 'Roll the Dice'}
            variant="gold"
            onPress={handlePlay}
            disabled={placingBet}
          />
        </View>

        <Text style={styles.fairnessNote}>
          Every roll is provably fair — computed from a secret server seed you can verify later. See
          Settings → Identity & Responsible Gambling → Provably Fair.
        </Text>
      </ScrollView>

      <RewardPopup
        visible={result !== null}
        amount={result?.amount ?? 0}
        title={result?.won ? `You Won! (${result?.multiplier.toFixed(2)}x)` : 'No Win This Time'}
        onClose={() => setResult(null)}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    ...shadow.card,
  },
  cardLabel: { color: colors.textMuted, fontSize: typography.xs, fontWeight: '700', marginBottom: spacing.sm },
  targetRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, marginBottom: spacing.lg },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  targetValue: { color: colors.gold, fontSize: typography.display, fontWeight: '800', minWidth: 90, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  statBlock: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  statLabel: { color: colors.textMuted, fontSize: typography.xs },
  statValue: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg, marginTop: 4 },
  stakeInput: {
    backgroundColor: colors.surfaceAlt,
    color: colors.textPrimary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    fontSize: typography.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  potential: { color: colors.textSecondary, fontSize: typography.xs, textAlign: 'center', marginBottom: spacing.xl },
  fairnessNote: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.lg, lineHeight: 16 },
});
