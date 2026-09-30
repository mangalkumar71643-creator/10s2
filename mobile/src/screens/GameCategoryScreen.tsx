import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GAME_CATEGORIES, GAME_ICON_SIZE, GameTile } from '../components/GameTile';
import { RootStackParamList } from '../navigation/types';

const SIDE = 12;
const TILE_GAP = 10;
const PER_ROW = 3;

/** Every game in one category, opened from its banner on the home screen. */
export default function GameCategoryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'GameCategory'>>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const category = GAME_CATEGORIES.find((c) => c.id === route.params?.categoryId) ?? GAME_CATEGORIES[0];
  // Three tiles a row across the screen, capped at their full size on wide screens.
  const tile = Math.min(GAME_ICON_SIZE, Math.floor((width - SIDE * 2 - TILE_GAP * (PER_ROW - 1)) / PER_ROW));
  const gridWidth = PER_ROW * tile + (PER_ROW - 1) * TILE_GAP;

  return (
    <ImageBackground source={require('../../assets/home-background.webp')} style={styles.fill} resizeMode="cover">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={8} accessibilityLabel="Back">
            <MaterialCommunityIcons name="chevron-left" size={26} color="#FFD66B" />
          </Pressable>
        </View>
        <View style={[styles.grid, { width: gridWidth }]}>
          {category.games.map((id) => (
            <GameTile key={id} id={id} size={tile} />
          ))}
        </View>
      </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#120204' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SIDE, marginBottom: 10 },
  back: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,4,6,0.85)', borderWidth: 1.2, borderColor: 'rgba(255,214,107,0.6)' },
  grid: { alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, marginTop: 8 },
});
