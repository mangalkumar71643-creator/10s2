import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { ApiClientError } from '../api/client';
import { RootStackParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import * as walletService from '../services/walletService';
import { colors, gradients, radius, spacing, typography } from '../theme';

const CARD_TEXT_COLOR = '#5C3A0E';
const MIN_WITHDRAW = 100;
const QUICK_AMOUNTS = [100, 300, 500, 1000, 2000, 5000, 10000, 20000, 35000];

export default function WithdrawScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    coins,
    withdrawable,
    lockedBonus,
    wageringRequired,
    wageringProgress,
    payoutUpiId,
    dailyWithdrawalLimit,
    remainingWithdrawalLimit,
    refreshWallet,
  } = useGameState();
  const { backendUser } = useAuth();
  const [amountText, setAmountText] = useState(String(QUICK_AMOUNTS[0]));
  const [busy, setBusy] = useState(false);
  const [editingUpi, setEditingUpi] = useState(false);
  const [upiInput, setUpiInput] = useState('');
  const [savingUpi, setSavingUpi] = useState(false);

  const kycApproved = backendUser?.kycStatus === 'APPROVED';
  const maxWithdraw = Math.min(withdrawable, remainingWithdrawalLimit);
  const amount = Number(amountText);
  const isValidAmount = amountText.trim().length > 0 && amount >= MIN_WITHDRAW && amount <= maxWithdraw;
  const wageringRemaining = Math.max(0, wageringRequired - wageringProgress);

  async function handleSaveUpi() {
    if (!upiInput.includes('@')) {
      Alert.alert('Invalid UPI ID', 'Enter a UPI ID like yourname@bank.');
      return;
    }
    setSavingUpi(true);
    try {
      await walletService.setPayoutUpiId(upiInput.trim());
      await refreshWallet();
      setEditingUpi(false);
    } catch (err) {
      Alert.alert('Could not save UPI ID', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setSavingUpi(false);
    }
  }

  async function handleWithdraw() {
    if (!kycApproved) {
      Alert.alert('Verify your identity', 'Complete KYC verification in Settings before withdrawing.');
      return;
    }
    if (!payoutUpiId) {
      Alert.alert('Add a UPI ID', 'Add a UPI ID under Bank Account before withdrawing.');
      return;
    }
    if (!isValidAmount) return;
    setBusy(true);
    try {
      await walletService.withdraw(amount);
      await refreshWallet();
      Alert.alert('Withdrawal requested', `₹${amount.toLocaleString('en-IN')} will be sent to ${payoutUpiId}.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Withdrawal failed', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenContainer scroll={false} contentStyle={{ paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Withdraw</Text>
        <View style={styles.headerRight}>
          <Pressable onPress={() => navigation.navigate('Help')} style={styles.headerButton}>
            <MaterialCommunityIcons name="headset" size={24} color={colors.gold} />
          </Pressable>
          <Pressable onPress={() => navigation.navigate('History')} style={styles.headerButton}>
            <MaterialCommunityIcons name="clock-time-four-outline" size={24} color={colors.gold} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.cardsRow}>
          <LinearGradient colors={gradients.goldButton} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
            <MaterialCommunityIcons
              name="wallet-outline"
              size={64}
              color={CARD_TEXT_COLOR}
              style={styles.balanceCardIcon}
            />
            <Text style={styles.balanceLabel}>Cash balance</Text>
            <Text style={styles.balanceValue}>₹{Math.floor(coins)}</Text>
          </LinearGradient>

          <Pressable style={{ flex: 1 }} onPress={() => navigation.navigate('History')}>
            <LinearGradient colors={gradients.peachCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.balanceCard}>
              <MaterialCommunityIcons name="chevron-right" size={22} color={CARD_TEXT_COLOR} style={styles.balanceCardArrow} />
              <Text style={styles.balanceLabel}>Withdrawable</Text>
              <Text style={styles.balanceValue}>₹{Math.floor(withdrawable)}</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {!kycApproved ? (
          <View style={styles.kycBanner}>
            <MaterialCommunityIcons name="shield-alert-outline" size={18} color={colors.gold} />
            <Text style={styles.kycBannerText}>
              Verify your identity (KYC) in Settings before you can withdraw.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Bank Account</Text>
        {editingUpi ? (
          <View style={styles.upiEditRow}>
            <TextInput
              value={upiInput}
              onChangeText={setUpiInput}
              placeholder="yourname@bank"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              style={styles.upiInput}
            />
            <Pressable style={styles.upiSaveButton} onPress={handleSaveUpi} disabled={savingUpi}>
              <Text style={styles.upiSaveButtonText}>{savingUpi ? '...' : 'Save'}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.bankRow}
            onPress={() => {
              setUpiInput(payoutUpiId ?? '');
              setEditingUpi(true);
            }}
          >
            <MaterialCommunityIcons
              name={payoutUpiId ? 'bank-outline' : 'plus-circle'}
              size={20}
              color={colors.gold}
            />
            <Text style={styles.bankRowText}>{payoutUpiId ?? 'Add UPI ID'}</Text>
          </Pressable>
        )}

        <View style={styles.amountCard}>
          <View style={styles.amountLabelRow}>
            <Text style={styles.amountLabel}>Withdrawal amount:</Text>
            <Text style={styles.amountLimit}>
              Min: ₹{MIN_WITHDRAW}   Max: ₹{Math.floor(maxWithdraw)}
            </Text>
          </View>

          <View style={styles.amountInputBox}>
            <Text style={styles.amountInputPrefix}>₹</Text>
            <TextInput
              value={amountText}
              onChangeText={(t) => setAmountText(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={styles.amountInput}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.quickGrid}>
            {QUICK_AMOUNTS.map((value) => {
              const selected = amount === value;
              return (
                <Pressable
                  key={value}
                  style={[styles.quickChip, selected && styles.quickChipSelected]}
                  onPress={() => setAmountText(String(value))}
                >
                  <Text style={[styles.quickChipText, selected && styles.quickChipTextSelected]}>
                    ₹{value.toLocaleString('en-IN')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.limitsCard}>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Remaining today's limit</Text>
            <Text style={styles.limitValue}>₹{remainingWithdrawalLimit.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.limitRow}>
            <Text style={styles.limitLabel}>Daily withdrawal limit</Text>
            <Text style={styles.limitValue}>₹{dailyWithdrawalLimit.toLocaleString('en-IN')}</Text>
          </View>
          {lockedBonus > 0 ? (
            <View style={styles.limitRow}>
              <Text style={styles.limitLabel}>Wager requirement left</Text>
              <Text style={styles.limitValue}>₹{wageringRemaining.toLocaleString('en-IN')}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.tipsBlock}>
          <Text style={styles.tipsTitle}>Withdraw tips:</Text>
          <Text style={styles.tipsText}>
            Withdrawals go through a sandbox payment provider in this build — no processing fee is
            deducted right now. Once a real, licensed payment processor is connected, a transfer can take
            up to 24 hours to arrive.
          </Text>
          {lockedBonus > 0 ? (
            <Text style={styles.tipsText}>
              ₹{lockedBonus.toLocaleString('en-IN')} of your balance is a deposit bonus, locked until you've
              staked ₹{wageringRemaining.toLocaleString('en-IN')} more in games.
            </Text>
          ) : null}
        </View>
      </ScrollView>

      <View style={styles.payBar}>
        <Pressable
          onPress={handleWithdraw}
          disabled={!isValidAmount || !kycApproved || !payoutUpiId || busy}
          style={{ opacity: !isValidAmount || !kycApproved || !payoutUpiId || busy ? 0.5 : 1 }}
        >
          <LinearGradient
            colors={gradients.crimsonButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.payButton}
          >
            <Text style={styles.payButtonText}>{busy ? 'Processing…' : 'Withdraw'}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = {
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  headerButton: { width: 36, height: 36, alignItems: 'center' as const, justifyContent: 'center' as const },
  headerRight: { flexDirection: 'row' as const },
  headerTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' as const },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: 140 },
  cardsRow: { flexDirection: 'row' as const, gap: spacing.md, marginBottom: spacing.xl },
  balanceCard: {
    flex: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden' as const,
  },
  balanceCardIcon: { position: 'absolute' as const, right: -6, bottom: -6, opacity: 0.3, transform: [{ rotate: '-8deg' }] },
  balanceCardArrow: { position: 'absolute' as const, top: spacing.md, right: spacing.md, opacity: 0.6 },
  balanceLabel: { color: CARD_TEXT_COLOR, fontSize: typography.sm, fontWeight: '700' as const, marginBottom: spacing.sm },
  balanceValue: { color: CARD_TEXT_COLOR, fontSize: typography.xl, fontWeight: '800' as const },
  kycBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  kycBannerText: { color: colors.textSecondary, fontSize: typography.xs, flex: 1, lineHeight: 16 },
  sectionLabel: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm, marginBottom: spacing.sm },
  bankRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  bankRowText: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm },
  upiEditRow: { flexDirection: 'row' as const, gap: spacing.sm, marginBottom: spacing.xl },
  upiInput: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  upiSaveButton: {
    backgroundColor: colors.gold,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  upiSaveButtonText: { color: colors.background, fontWeight: '800' as const, fontSize: typography.sm },
  limitsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  limitRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  limitLabel: { color: colors.textSecondary, fontSize: typography.sm },
  limitValue: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '700' as const },
  amountCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  amountLabelRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const, marginBottom: spacing.md },
  amountLabel: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm },
  amountLimit: { color: colors.textMuted, fontSize: typography.xs },
  amountInputBox: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  amountInputPrefix: { color: colors.gold, fontSize: typography.xxl, fontWeight: '800' as const },
  amountInput: {
    color: colors.gold,
    fontSize: typography.xxl,
    fontWeight: '800' as const,
    minWidth: 100,
    textAlign: 'center' as const,
    padding: 0,
  },
  quickGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: spacing.sm },
  quickChip: {
    width: '31%' as const,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: 'center' as const,
  },
  quickChipSelected: { backgroundColor: colors.crimson, borderColor: colors.crimsonLight },
  quickChipText: { color: colors.textSecondary, fontWeight: '700' as const, fontSize: typography.sm },
  quickChipTextSelected: { color: colors.textPrimary },
  tipsBlock: { marginBottom: spacing.xl },
  tipsTitle: { color: colors.textPrimary, fontSize: typography.md, fontWeight: '700' as const, marginBottom: spacing.sm },
  tipsText: { color: colors.textSecondary, fontSize: typography.sm, lineHeight: 20 },
  payBar: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  payButton: { borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' as const },
  payButtonText: { color: colors.textPrimary, fontWeight: '800' as const, fontSize: typography.md, letterSpacing: 1 },
};
