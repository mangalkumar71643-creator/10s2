import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import EmptyState from '../components/EmptyState';
import GameCard from '../components/GameCard';
import LoadingState from '../components/LoadingState';
import ScreenContainer from '../components/ScreenContainer';
import { Game, GameCategory, GameCategoryId } from '../data/models';
import { RootStackParamList } from '../navigation/types';
import { fetchCategories, fetchGames } from '../services/gameService';
import { colors, radius, spacing, typography } from '../theme';

type Route = RouteProp<RootStackParamList, 'GameCategory'>;

export default function GameCategoryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<Route>();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<GameCategory[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [selected, setSelected] = useState<GameCategoryId | 'all'>(route.params?.categoryId ?? 'all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCategories(), fetchGames()]).then(([cats, gms]) => {
      if (cancelled) return;
      setCategories(cats);
      setGames(gms);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return games.filter((g) => {
      const matchesCategory = selected === 'all' || g.categoryId === selected;
      const matchesQuery = query.trim().length === 0 || g.title.toLowerCase().includes(query.trim().toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [games, selected, query]);

  if (loading) {
    return (
      <ScreenContainer scroll={false}>
        <LoadingState />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>All Games</Text>
        <View style={styles.backButton} />
      </View>

      <View style={styles.searchRow}>
        <MaterialCommunityIcons name="magnify" size={18} color={colors.textMuted} />
        <TextInput
          placeholder="Search games"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.body}>
        <ScrollView style={styles.sidebar} showsVerticalScrollIndicator={false}>
          <SidebarItem label="All" active={selected === 'all'} onPress={() => setSelected('all')} icon="view-grid-outline" />
          {categories.map((c) => (
            <SidebarItem key={c.id} label={c.name} active={selected === c.id} onPress={() => setSelected(c.id)} icon={c.icon} />
          ))}
        </ScrollView>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentInner}>
          {filtered.length === 0 ? (
            <EmptyState icon="magnify" title="No games found" subtitle="Try a different search term or category." />
          ) : (
            <View style={styles.grid}>
              {filtered.map((g) => (
                <GameCard key={g.id} game={g} variant="grid" onPress={() => navigation.navigate('GameDetail', { gameId: g.id })} />
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </ScreenContainer>
  );
}

function SidebarItem({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
}) {
  return (
    <Pressable onPress={onPress} style={[styles.sidebarItem, active && styles.sidebarItemActive]}>
      <MaterialCommunityIcons name={icon} size={16} color={active ? colors.background : colors.textSecondary} />
      <Text style={[styles.sidebarLabel, active && styles.sidebarLabelActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.textPrimary, fontWeight: '800', fontSize: typography.lg },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, color: colors.textPrimary, paddingVertical: spacing.sm, marginLeft: spacing.sm, fontSize: typography.sm },
  body: { flex: 1, flexDirection: 'row', marginTop: spacing.md },
  sidebar: { width: 96, borderRightWidth: 1, borderRightColor: colors.border },
  sidebarItem: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    marginBottom: spacing.xs,
    marginLeft: spacing.sm,
    borderRadius: radius.md,
  },
  sidebarItemActive: { backgroundColor: colors.gold },
  sidebarLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  sidebarLabelActive: { color: colors.background },
  content: { flex: 1 },
  contentInner: { padding: spacing.lg, paddingBottom: 40 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
});
