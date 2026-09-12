import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React, { useState } from 'react';
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import { colors, radius, spacing, typography } from '../theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'What are Coins?',
    answer: 'Coins are NovaPlay’s real-money balance — 1 Coin is backed 1:1 by real money. You must be 18+ and complete identity verification (KYC) to deposit, withdraw or play.',
  },
  {
    question: 'How do I add or withdraw Coins?',
    answer: 'Go to Wallet to deposit or withdraw. Withdrawals go back to your original payment method and may take time to process once a licensed payment provider is connected.',
  },
  {
    question: 'How do I earn a bonus?',
    answer: 'Claim your daily streak reward from Rewards. Daily bonus amounts are fixed and tracked server-side so they can’t be claimed more than once a day.',
  },
  {
    question: 'How does VIP work?',
    answer:
      'Your VIP level rises as you earn XP through gameplay and activity. Higher VIP levels unlock cosmetic badges, avatar frames and bonus daily missions.',
  },
  {
    question: 'How does ranking work?',
    answer:
      'The leaderboard ranks players by their total Coin balance. Play more games and complete missions to climb higher.',
  },
  {
    question: 'How do achievements work?',
    answer:
      'Achievements track your progress toward specific milestones, like playing your first game or reaching a certain level. Completing one unlocks a badge on your profile.',
  },
  {
    question: 'How do game outcomes work?',
    answer:
      'Every round is decided by a server-side random number generator when you stake Coins — the app itself never decides win or loss. Please play responsibly and only stake what you can afford to lose.',
  },
  {
    question: 'What if I need to stop playing?',
    answer:
      'You can set a daily deposit limit or self-exclude for 30 days from Settings → Identity & Responsible Gambling at any time.',
  },
];

export default function HelpScreen() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  function toggle(index: number) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenIndex((prev) => (prev === index ? null : index));
  }

  return (
    <ScreenContainer>
      <AppHeader showBack title="Help Center" showCoins={false} showNotifications={false} showProfile={false} />

      <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

      <View style={styles.list}>
        {FAQS.map((faq, index) => {
          const open = openIndex === index;
          return (
            <View key={faq.question} style={styles.card}>
              <Pressable onPress={() => toggle(index)} style={styles.questionRow}>
                <Text style={styles.question}>{faq.question}</Text>
                <MaterialCommunityIcons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.gold} />
              </Pressable>
              {open ? <Text style={styles.answer}>{faq.answer}</Text> : null}
            </View>
          );
        })}
      </View>

      <View style={styles.contactCard}>
        <MaterialCommunityIcons name="lifebuoy" size={22} color={colors.gold} />
        <Text style={styles.contactTitle}>Still need help?</Text>
        <Text style={styles.contactBody}>Reach out from Settings → Account for further support.</Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg, paddingHorizontal: spacing.lg, marginTop: spacing.lg, marginBottom: spacing.md },
  list: { paddingHorizontal: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  question: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm, flex: 1, marginRight: spacing.sm },
  answer: { color: colors.textSecondary, fontSize: typography.sm, marginTop: spacing.sm, lineHeight: 20 },
  contactCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xl,
  },
  contactTitle: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.md, marginTop: spacing.sm },
  contactBody: { color: colors.textMuted, fontSize: typography.xs, marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.xl },
});
