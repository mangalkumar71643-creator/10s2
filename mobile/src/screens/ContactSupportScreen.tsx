import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import { Alert, LayoutAnimation, Modal, Platform, Pressable, Text, TextInput, UIManager, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { ApiClientError } from '../api/client';
import { escalateSupportTicket } from '../api/backend';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TOPICS: { question: string; answer: string }[] = [
  {
    question: 'Deposit not arrived',
    answer:
      'A successful deposit is usually credited within a couple of minutes — check Wallet → transaction history. If it still isn’t there after 30 minutes but money left your account, escalate below.',
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
      'Confirm the amount meets the deposit minimum and try again. If money was deducted from your bank/UPI but wasn’t credited here, escalate immediately so we can trace it.',
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
  const [escalateFor, setEscalateFor] = useState<string | null>(null);
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [escalatedTopics, setEscalatedTopics] = useState<string[]>([]);

  function toggle(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((prev) => (prev === index ? null : index));
  }

  function openEscalate(topic: string) {
    setDetail('');
    setEscalateFor(topic);
  }

  async function submitEscalation() {
    if (!escalateFor) return;
    setSubmitting(true);
    try {
      await escalateSupportTicket(escalateFor, detail.trim() || undefined);
      setEscalatedTopics((prev) => [...prev, escalateFor]);
      setEscalateFor(null);
      Alert.alert('Escalated', 'Our team has been notified and will follow up soon.');
    } catch (err) {
      Alert.alert('Could not escalate', err instanceof ApiClientError ? err.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScreenContainer>
      <AppHeader showBack title="Customer Service" showCoins={false} showNotifications={false} showProfile={false} />

      <Text style={styles.sectionTitle}>You may want to ask about:</Text>

      <View style={styles.list}>
        {TOPICS.map((topic, index) => {
          const open = openIndex === index;
          const escalated = escalatedTopics.includes(topic.question);
          return (
            <View key={topic.question} style={styles.card}>
              <Pressable onPress={() => toggle(index)} style={styles.questionRow}>
                <Text style={styles.question}>{topic.question}</Text>
                <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.gold} />
              </Pressable>
              {open ? (
                <View>
                  <Text style={styles.answer}>{topic.answer}</Text>
                  {escalated ? (
                    <View style={styles.escalatedBadge}>
                      <MaterialCommunityIcons name="check-circle-outline" size={16} color={colors.positive} />
                      <Text style={styles.escalatedText}>Escalated — our team will follow up soon.</Text>
                    </View>
                  ) : (
                    <Pressable onPress={() => openEscalate(topic.question)} style={styles.escalateRow}>
                      <Text style={styles.escalateText}>Still not solved? Escalate to our team</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={colors.crimsonLight} />
                    </Pressable>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.contactCard}>
        <MaterialCommunityIcons name="lifebuoy" size={22} color={colors.gold} />
        <Text style={styles.contactTitle}>For other issues</Text>
        <Text style={styles.contactBody}>Open any topic above and tap Escalate — our team reviews every escalation.</Text>
      </View>

      <Modal visible={!!escalateFor} transparent animationType="fade" onRequestClose={() => setEscalateFor(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Escalate issue</Text>
              <Pressable onPress={() => setEscalateFor(null)} hitSlop={10}>
                <MaterialCommunityIcons name="close" size={22} color={colors.gold} />
              </Pressable>
            </View>

            <Text style={styles.modalLabel}>Topic</Text>
            <Text style={styles.modalTopic}>{escalateFor}</Text>

            <Text style={styles.modalLabel}>Add details (optional)</Text>
            <TextInput
              value={detail}
              onChangeText={setDetail}
              placeholder="Anything that will help our team, e.g. transaction time or amount"
              placeholderTextColor={colors.textMuted}
              style={styles.modalInput}
              multiline
              numberOfLines={4}
            />

            <Pressable onPress={submitEscalation} disabled={submitting}>
              <LinearGradient
                colors={gradients.crimsonButton}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalSaveButton}
              >
                <Text style={styles.modalSaveButtonText}>{submitting ? 'Sending…' : 'Send to our team'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = {
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
  escalatedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  escalatedText: { color: colors.positive, fontSize: typography.xs, fontWeight: '700' as const },
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
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center' as const, justifyContent: 'center' as const, padding: spacing.lg },
  modalCard: {
    width: '100%' as const,
    maxWidth: 420,
    borderRadius: radius.xl,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: spacing.xl,
    ...shadow.glow,
  },
  modalHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: { color: colors.gold, fontSize: typography.xl, fontWeight: '800' as const },
  modalLabel: { color: colors.textPrimary, fontWeight: '700' as const, fontSize: typography.sm, marginBottom: spacing.sm },
  modalTopic: { color: colors.textSecondary, fontSize: typography.sm, marginBottom: spacing.lg },
  modalInput: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    textAlignVertical: 'top' as const,
    minHeight: 90,
  },
  modalSaveButton: { borderRadius: radius.lg, paddingVertical: spacing.md, alignItems: 'center' as const },
  modalSaveButtonText: { color: colors.textPrimary, fontWeight: '800' as const, fontSize: typography.md, letterSpacing: 1 },
};
