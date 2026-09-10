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
    question: 'What are Virtual Coins?',
    answer:
      'Virtual Coins are the in-app currency used across NovaPlay for entertainment purposes. They have no monetary value and cannot be exchanged for real money.',
  },
  {
    question: 'How do I earn Coins?',
    answer:
      'Earn coins by playing games, completing daily missions, claiming your daily streak reward, unlocking achievements and climbing the leaderboard.',
  },
  {
    question: 'How does VIP work?',
    answer:
      'Your VIP level rises as you earn XP through gameplay and activity, not by spending money. Higher VIP levels unlock cosmetic badges, avatar frames and bonus daily missions.',
  },
  {
    question: 'How does ranking work?',
    answer:
      'The leaderboard ranks players by their total Virtual Coin balance. Play more games and complete missions to climb higher.',
  },
  {
    question: 'How do achievements work?',
    answer:
      'Achievements track your progress toward specific milestones, like playing your first game or reaching a certain level. Completing one unlocks a badge on your profile.',
  },
  {
    question: 'Can Coins be converted to money?',
    answer: 'No. Virtual Coins have no monetary value and cannot be converted into cash, withdrawn, or deposited via any payment method.',
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
