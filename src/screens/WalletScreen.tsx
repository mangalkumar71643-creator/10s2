import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import PrimaryButton from '../components/PrimaryButton';
import ScreenContainer from '../components/ScreenContainer';
import { BottomTabParamList, RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

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
          <Pressable onPress={() => rootNavigation.navigate('BalanceRecords')} style={styles.headerButton}>
            <MaterialCommunityIcons name="clock-time-four-outline" size={24} color={colors.gold} />
          </Pressable>
        </View>
      </View>

      <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
        <MaterialCommunityIcons
          name="wallet-outline"
          size={130}
          color={CARD_TEXT_COLOR}
          style={styles.balanceCardIcon}
        />
        <View style={styles.balanceLabelRow}>
          <MaterialCommunityIcons name="circle-multiple" size={16} color={CARD_TEXT_COLOR} />
          <Text style={styles.balanceLabel}>My Balance</Text>
        </View>
        <Text style={styles.balanceValue}>{coins.toLocaleString('en-IN')}</Text>
        <Text style={styles.balanceUnit}>Virtual Coins</Text>
      </LinearGradient>

      <View style={styles.buttonRow}>
        <PrimaryButton
          label="History"
          variant="crimson"
          onPress={() => rootNavigation.navigate('BalanceRecords')}
          style={styles.buttonFlex}
        />
        <PrimaryButton
          label="Earn Coins"
          variant="gold"
          onPress={() => navigation.navigate('Home')}
          style={styles.buttonFlex}
        />
      </View>

      <View style={styles.tipsBlock}>
        <Text style={styles.tipsTitle}>How to earn coins:</Text>
        <Text style={styles.tipsText}>
          Play games, finish daily missions and keep your streak alive to earn coins — new coins land in your
          balance the moment you collect them.
        </Text>
      </View>

      <View style={styles.tipsBlock}>
        <Text style={styles.tipsTitle}>About your coins:</Text>
        <Text style={styles.tipsText}>
          Coins are for in-app fun only — they have no cash value and can&apos;t be bought, withdrawn or cashed
          out.
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
    borderRadius: radius.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    overflow: 'hidden',
    marginBottom: spacing.xl,
    ...shadow.glow,
  },
  balanceCardIcon: { position: 'absolute', right: -14, bottom: -14, opacity: 0.22, transform: [{ rotate: '-8deg' }] },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  balanceLabel: { color: CARD_TEXT_COLOR, fontSize: typography.lg, fontWeight: '700', marginLeft: spacing.xs },
  balanceValue: { color: CARD_TEXT_COLOR, fontSize: typography.display + 6, fontWeight: '800' },
  balanceUnit: { color: CARD_TEXT_COLOR, fontSize: typography.sm, fontWeight: '700', opacity: 0.75, marginTop: spacing.xs },
  buttonRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xxl },
  buttonFlex: { flex: 1 },
  tipsBlock: { marginBottom: spacing.xl },
  tipsTitle: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '700', marginBottom: spacing.sm },
  tipsText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
});
