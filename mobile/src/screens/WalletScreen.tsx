import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import AmountInputModal from '../components/AmountInputModal';
import ScreenContainer from '../components/ScreenContainer';
import { ApiClientError } from '../api/client';
import { BottomTabParamList, RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import * as walletService from '../services/walletService';
import { colors, gradients, radius, spacing, typography } from '../theme';

const CARD_TEXT_COLOR = '#5C3A0E';

export default function WalletScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const rootNavigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { coins, refreshWallet } = useGameState();
  const { backendUser } = useAuth();
  const [modal, setModal] = useState<'deposit' | 'withdraw' | null>(null);
  const [busy, setBusy] = useState(false);

  const kycApproved = backendUser?.kycStatus === 'APPROVED';

  async function handleConfirm(amount: number) {
    if (!modal) return;
    setBusy(true);
    try {
      if (modal === 'deposit') await walletService.deposit(amount);
      else await walletService.withdraw(amount);
      await refreshWallet();
      setModal(null);
    } catch (err) {
      Alert.alert(
        modal === 'deposit' ? 'Deposit failed' : 'Withdrawal failed',
        err instanceof ApiClientError ? err.message : 'Please try again.'
      );
    } finally {
      setBusy(false);
    }
  }

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
        <Text style={styles.balanceValue}>₹{coins.toFixed(2)}</Text>
      </LinearGradient>

      {!kycApproved ? (
        <View style={styles.kycBanner}>
          <MaterialCommunityIcons name="shield-alert-outline" size={18} color={colors.gold} />
          <Text style={styles.kycBannerText}>
            Verify your identity (KYC) in Settings before you can deposit, withdraw or play for real money.
          </Text>
        </View>
      ) : null}

      <View style={styles.tipsBlock}>
        <Text style={styles.tipsTitle}>Deposit tips:</Text>
        <Text style={styles.tipsText}>
          Deposits are credited within 1-5 minutes. Contact customer service to resolve any deposit issues.
        </Text>
      </View>

      <View style={styles.tipsBlock}>
        <Text style={styles.tipsTitle}>Withdraw tips:</Text>
        <Text style={styles.tipsText}>
          Normally, the withdrawal amount will be credited to your account within 2 hours, but it may take
          up to 24 hours at the most.
        </Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable style={{ flex: 1 }} onPress={() => setModal('withdraw')} disabled={!kycApproved}>
          <LinearGradient
            colors={gradients.crimsonButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionButton}
          >
            <Text style={[styles.actionButtonText, { color: colors.textPrimary }]}>Withdraw</Text>
          </LinearGradient>
        </Pressable>
        <Pressable style={{ flex: 1 }} onPress={() => setModal('deposit')} disabled={!kycApproved}>
          <LinearGradient
            colors={gradients.goldButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.actionButton}
          >
            <Text style={styles.actionButtonText}>Deposit</Text>
          </LinearGradient>
        </Pressable>
      </View>

      <AmountInputModal
        visible={modal !== null}
        title={modal === 'deposit' ? 'Deposit' : 'Withdraw'}
        confirmLabel={modal === 'deposit' ? 'Deposit' : 'Withdraw'}
        helperText={modal === 'deposit' ? 'Add coins to your balance.' : 'Move coins out to your bank/UPI.'}
        busy={busy}
        onConfirm={handleConfirm}
        onClose={() => setModal(null)}
      />
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
  kycBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  kycBannerText: { color: colors.textSecondary, fontSize: typography.xs, flex: 1, lineHeight: 16 },
  actionRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xxl },
  actionButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  actionButtonText: { color: colors.background, fontWeight: '800', fontSize: typography.md },
});
