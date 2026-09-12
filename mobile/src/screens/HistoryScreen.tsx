import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { useGameState } from '../state/GameStateContext';
import { colors, radius, spacing, typography } from '../theme';

type Range = 1 | 7 | 30;

const RANGES: { label: string; days: Range }[] = [
  { label: '1 Day', days: 1 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
];

// Deposits and withdrawals are tagged with these two icons when they're
// recorded, so this screen can pull the real transaction list instead of
// keeping its own separate (and possibly stale) copy.
const DEPOSIT_WITHDRAW_ICONS = ['bank-transfer-in', 'bank-transfer-out'];

export default function HistoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { transactions } = useGameState();
  const [range, setRange] = useState<Range>(1);

  const cutoff = Date.now() - range * 24 * 60 * 60 * 1000;
  const records = transactions.filter(
    (t) => DEPOSIT_WITHDRAW_ICONS.includes(t.icon) && new Date(t.timestampISO).getTime() >= cutoff
  );

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.tabRow}>
        {RANGES.map((r) => (
          <Pressable key={r.days} style={styles.tab} onPress={() => setRange(r.days)}>
            <Text style={[styles.tabLabel, range === r.days && styles.tabLabelActive]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      {records.length === 0 ? (
        <View style={styles.body}>
          <MaterialCommunityIcons name="clipboard-text-clock-outline" size={64} color={colors.crimsonLight} style={{ opacity: 0.35 }} />
          <Text style={styles.emptyText}>No records</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {records.map((t) => (
            <View key={t.id} style={styles.row}>
              <View style={styles.rowIconWrap}>
                <MaterialCommunityIcons name={t.icon} size={20} color={colors.gold} />
              </View>
              <View style={styles.rowMiddle}>
                <Text style={styles.rowTitle}>{t.title}</Text>
                <Text style={styles.rowTimestamp}>{t.timestamp}</Text>
              </View>
              <Text style={[styles.rowAmount, t.amount < 0 && styles.rowAmountNegative]}>
                {t.amount >= 0 ? '+' : ''}
                {t.amount.toLocaleString('en-US')}
              </Text>
            </View>
          ))}
        </View>
      )}
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
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.backgroundAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.md,
  },
  tab: { flex: 1, alignItems: 'center' },
  tabLabel: { color: colors.textPrimary, fontSize: typography.lg, fontWeight: '600' },
  tabLabelActive: { color: colors.gold },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  emptyText: {
    color: colors.crimsonLight,
    opacity: 0.8,
    fontSize: typography.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  list: { paddingTop: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  rowMiddle: { flex: 1 },
  rowTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: typography.sm },
  rowTimestamp: { color: colors.textMuted, fontSize: typography.xs, marginTop: 2 },
  rowAmount: { color: colors.positive, fontWeight: '800', fontSize: typography.md },
  rowAmountNegative: { color: colors.negative },
});
