import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { BottomTabParamList, RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, spacing, typography } from '../theme';

const CARD_TEXT_COLOR = '#5C3A0E';

export default function WalletScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coins } = useGameState();

  return (
    <ScreenContainer contentStyle={styles.content}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate('Home')} style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Wallet</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => rootNavigation.navigate('Help')} style={styles.headerButton}>
            <MaterialCommunityIcons name="headset" size={24} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => rootNavigation.navigate('History')} style={styles.headerButton}>
            <MaterialCommunityIcons name="clock-time-four-outline" size={24} color={colors.gold} />
          </Pressable>
        </View>
      </View>

      <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
        <MaterialCommunityIcons
          name="wallet-outline"
          size={110}
          color={CARD_TEXT_COLOR}
          style={styles.balanceCardIcon}
        />
        <Text style={styles.balanceLabel}>My Balance</Text>
        <Text style={styles.balanceValue}>{coins.toLocaleString('en-IN')} Coins</Text>
      </LinearGradient>

      <View style={styles.tipsBlock}>
        <Text style={styles.tipsTitle}>How to earn coins:</Text>
        <Text style={styles.tipsText}>
          Play games and complete daily challenges to earn coins. Coins are for in-app fun only and have no cash
          value.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerRight: { flexDirection: 'row' },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' },
  balanceCard: {
    borderRadius: radius.lg,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xxl,
  },
  balanceCardIcon: { position: 'absolute', right: -10, bottom: -10, opacity: 0.25, transform: [{ rotate: '-8deg' }] },
  balanceLabel: { color: CARD_TEXT_COLOR, fontSize: typography.lg, fontWeight: '700', marginBottom: spacing.md },
  balanceValue: { color: CARD_TEXT_COLOR, fontSize: typography.display, fontWeight: '800' },
  tipsBlock: { marginBottom: spacing.xxl },
  tipsTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700', marginBottom: spacing.sm },
  tipsText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  withdrawButton: {
    flex: 1,
    backgroundColor: colors.crimson,
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  withdrawLabel: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700' },
  depositButtonWrap: { flex: 1 },
  depositButton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositLabel: { color: CARD_TEXT_COLOR, fontSize: typography.lg, fontWeight: '700' },
});
