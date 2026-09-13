import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { Alert, LayoutAnimation, Linking, Platform, Pressable, Text, UIManager, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { API_BASE_URL, ApiClientError } from '../api/client';
import { startChatSession } from '../api/backend';
import { colors, radius, spacing, typography } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TOPICS: { question: string; answer: string }[] = [
  {
    question: 'Deposit not arrived',
    answer:
      'A successful deposit is usually credited within a couple of minutes — check Wallet → transaction history. If it still isn’t there after 30 minutes but money left your account, use Live Support below.',
  },
  {
    question: 'Unable to add bank account',
    answer:
      'Account Number must be 9–18 digits and IFSC must be exactly 11 characters in the format HDFC0001234 (4 letters, a zero, then 6 letters/digits). Check for extra spaces.',
  },
  {
    question: 'Unable to withdraw cash',
    answer:
      'Withdrawals need: a saved bank account, KYC approval, an amount within your remaining daily limit, and no pending wagering requirement on a locked deposit bonus. Check all four on the Withdraw screen.',
  },
  {
    question: 'Deposit failed',
    answer:
      'Confirm the amount meets the deposit minimum and try again. If money was deducted from your bank/UPI but wasn’t credited here, use Live Support immediately so we can trace it.',
  },
  {
    question: 'Withdrawal requirements',
    answer:
      'You need an approved KYC, a saved bank account, an amount within your daily withdrawal limit, and any deposit-bonus wagering requirement fully met.',
  },
  {
    question: 'Game rules & fairness',
    answer:
      'Every round is decided by a server-side, provably-fair RNG. You can verify past rounds and rotate your seed from Settings → Provably Fair.',
  },
];

export default function ContactSupportScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [connecting, setConnecting] = useState(false);

  function toggle(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((prev) => (prev === index ? null : index));
  }

  async function openLiveSupport() {
    setConnecting(true);
    try {
      const { chatToken } = await startChatSession();
      await Linking.openURL(`${API_BASE_URL}/chat.html?token=${encodeURIComponent(chatToken)}`);
    } catch (err) {
      Alert.alert('Could not connect', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <ScreenContainer>
      <AppHeader showBack title="Customer Service" showCoins={false} showNotifications={false} showProfile={false} />

      <Pressable style={styles.liveButton} onPress={openLiveSupport} disabled={connecting}>
        <MaterialCommunityIcons name="chat-processing-outline" size={20} color={colors.textPrimary} />
        <Text style={styles.liveButtonText}>{connecting ? 'Connecting…' : 'Live Support — chat with our team'}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>You may want to ask about:</Text>

      <View style={styles.list}>
        {TOPICS.map((topic, index) => {
          const open = openIndex === index;
          return (
            <View key={topic.question} style={styles.card}>
              <Pressable onPress={() => toggle(index)} style={styles.questionRow}>
                <Text style={styles.question}>{topic.question}</Text>
                <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.gold} />
              </Pressable>
              {open ? (
                <View>
                  <Text style={styles.answer}>{topic.answer}</Text>
                  <Pressable onPress={openLiveSupport} style={styles.escalateRow} disabled={connecting}>
                    <Text style={styles.escalateText}>Still not solved? Talk to our team live</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={colors.crimsonLight} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.contactCard}>
        <MaterialCommunityIcons name="lifebuoy" size={22} color={colors.gold} />
        <Text style={styles.contactTitle}>For other issues</Text>
        <Text style={styles.contactBody}>Tap Live Support above — it opens a chat with our team in your browser.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = {
  liveButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    backgroundColor: colors.crimson,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
  },
  liveButtonText: { color: colors.textPrimary, fontWeight: '800' as const, fontSize: typography.sm },
  sectionTitle: { color: colors.textPrimary, fontWeight: '800' as const, fontSize: typography.lg, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  questionRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
  question: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm, flex: 1, marginRight: spacing.sm },
  answer: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.sm, lineHeight: 20 },
  escalateRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  escalateText: { color: colors.crimsonLight, fontWeight: '700' as const, fontSize: typography.sm },
  contactCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center' as const,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
  },
  contactTitle: { color: colors.textPrimary, fontWeight: '800' as const, fontSize: typography.md, marginTop: spacing.sm },
  contactBody: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.xs, textAlign: 'center' as const, paddingHorizontal: spacing.xl },
};
