import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { RootStackParamList } from '../navigation/types';
import { colors, spacing, typography } from '../theme';

type Tab = 'all' | 'income' | 'expense';

export default function BalanceRecordsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tab, setTab] = useState<Tab>('all');

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.gold} />
        </Pressable>
        <Text style={styles.headerTitle}>Detail</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.tabRow}>
        <Pressable style={styles.tab} onPress={() => setTab('all')}>
          <Text style={[styles.tabLabel, tab === 'all' && styles.tabLabelActive]}>All</Text>
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('income')}>
          <Text style={[styles.tabLabel, tab === 'income' && styles.tabLabelActive]}>Income</Text>
        </Pressable>
        <Pressable style={styles.tab} onPress={() => setTab('expense')}>
          <Text style={[styles.tabLabel, tab === 'expense' && styles.tabLabelActive]}>Expense</Text>
        </Pressable>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.tableHeaderCell, styles.tableHeaderType]}>Type</Text>
        <Text style={[styles.tableHeaderCell, styles.tableHeaderMuted]}>Change</Text>
        <Text style={[styles.tableHeaderCell, styles.tableHeaderMuted]}>Balance</Text>
      </View>

      <View style={styles.body}>
        <MaterialCommunityIcons name="text-box-multiple-outline" size={64} color={colors.crimsonLight} style={{ opacity: 0.35 }} />
        <Text style={styles.emptyText}>No record</Text>
      </View>
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
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.crimsonDark,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  tableHeaderCell: { flex: 1, fontSize: typography.md, fontWeight: '700' },
  tableHeaderType: { color: colors.gold },
  tableHeaderMuted: { color: colors.crimsonLight, textAlign: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl },
  emptyText: {
    color: colors.crimsonLight,
    opacity: 0.8,
    fontSize: typography.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
