import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { BottomTabParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';

const TOP_BAR_HEIGHT = 69;

const WALLET_BUTTON_ASPECT = 2172 / 724;
const WALLET_BUTTON_HEIGHT = 63;
// The balance text was baked into wallet-button.png at 543x181; these are
// that glyph's position/size scaled into the button's rendered dimensions.
const WALLET_BUTTON_SOURCE_HEIGHT = 181;
const WALLET_BALANCE_SCALE = WALLET_BUTTON_HEIGHT / WALLET_BUTTON_SOURCE_HEIGHT;
const WALLET_BALANCE_LEFT = 132 * WALLET_BALANCE_SCALE;
const WALLET_BALANCE_TOP = 58 * WALLET_BALANCE_SCALE;
const WALLET_BALANCE_WIDTH = 205 * WALLET_BALANCE_SCALE;
const WALLET_BALANCE_HEIGHT = 52 * WALLET_BALANCE_SCALE;

const TOP_BAR_ICON_GAP = 10;
const TOP_BAR_ICON_OFFSET_Y = 7;

const NOVAPLAY_BADGE_SIZE = 40;
const GIFT_ICON_SIZE = 40;
const PROFILE_ICON_SIZE = 44;

const CONTROL_PANEL_ASPECT = 1536 / 530;

// Reference frame the requested top/bottom/height pixel values were measured
// against (the device screenshot used to position this element).
const REFERENCE_HEIGHT = 2800;
const PANEL_TOP = 890;
const PANEL_HEIGHT = 408;

// Measured from a JILI lobby reference screenshot (1280x2800): the gap from
// the red control-panel graphic's bottom edge to the top of its game-icon
// row — reused here so our row sits the same distance below our own panel.
const GAME_GRID_GAP_BELOW_PANEL = 250;

// Fixed-size grid for game icons below the control panel, left-aligned so
// more icons can be added in a row/wrap layout later — each one just needs
// its own {row, col} using GAME_ICON_SIZE/GAME_GRID_GAP/GAME_GRID_LEFT below.
const GAME_ICON_SIZE = 150;
const GAME_GRID_LEFT = 24;
const GAME_GRID_GAP = 16;
const GAME_GRID_CELL = GAME_ICON_SIZE + GAME_GRID_GAP;

// All content and navigation elements were intentionally stripped from this
// screen — new custom buttons/UI go here next.
export default function HomeScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const navigation = useNavigation<BottomTabNavigationProp<BottomTabParamList>>();
  const { avatarId } = useAuth();
  const { coins } = useGameState();
  const panelHeight = screenHeight * (PANEL_HEIGHT / REFERENCE_HEIGHT);
  const panelWidth = panelHeight * CONTROL_PANEL_ASPECT;
  const panelTop = screenHeight * (PANEL_TOP / REFERENCE_HEIGHT);
  const gameGridTop = panelTop + panelHeight + screenHeight * (GAME_GRID_GAP_BELOW_PANEL / REFERENCE_HEIGHT) - 50;
  // Win Go is grid cell {row: 0, col: 0}, Aviator is {row: 0, col: 1} —
  // a later icon at {row: 0, col: 2} would sit at
  // left: GAME_GRID_LEFT + 2 * GAME_GRID_CELL, same top.
  // Tile tops are relative to the game grid, which scrolls once the rows
  // run past the bottom of the screen.
  const winGoTileTop = 0;
  const winGoTileLeft = GAME_GRID_LEFT;
  const aviatorTileTop = 0;
  const aviatorTileLeft = GAME_GRID_LEFT + GAME_GRID_CELL;
  // Chicken Road sits directly below Win Go — same column, next row down.
  const chickenRoadTileTop = GAME_GRID_CELL;
  const chickenRoadTileLeft = GAME_GRID_LEFT;
  const minesTileTop = GAME_GRID_CELL;
  const minesTileLeft = GAME_GRID_LEFT + GAME_GRID_CELL;
  const sevenUpDownTileTop = 2 * GAME_GRID_CELL;
  const sevenUpDownTileLeft = GAME_GRID_LEFT;
  const plinkoTileTop = 2 * GAME_GRID_CELL;
  const plinkoTileLeft = GAME_GRID_LEFT + GAME_GRID_CELL;
  const gameGridRows = 3;
  const walletButtonWidth = WALLET_BUTTON_HEIGHT * WALLET_BUTTON_ASPECT;
  const walletButtonLeft = (screenWidth - walletButtonWidth) / 2 - 25;

  return (
    <ScreenContainer scroll={false} backgroundImage={require('../../assets/home-background.jpg')}>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: TOP_BAR_HEIGHT,
          backgroundColor: '#151112',
        }}
      >
        <Image
          source={require('../../assets/novaplay-badge.png')}
          style={{
            position: 'absolute',
            width: NOVAPLAY_BADGE_SIZE,
            height: NOVAPLAY_BADGE_SIZE,
            left: walletButtonLeft - NOVAPLAY_BADGE_SIZE - TOP_BAR_ICON_GAP,
            top: (TOP_BAR_HEIGHT - NOVAPLAY_BADGE_SIZE) / 2 + TOP_BAR_ICON_OFFSET_Y,
          }}
          resizeMode="contain"
        />
        <Pressable
          onPress={() => navigation.navigate('Wallet')}
          style={{
            position: 'absolute',
            left: walletButtonLeft,
            top: (TOP_BAR_HEIGHT - WALLET_BUTTON_HEIGHT) / 2 + TOP_BAR_ICON_OFFSET_Y + 5,
          }}
        >
          <Image
            source={require('../../assets/wallet-button.png')}
            style={{ width: walletButtonWidth, height: WALLET_BUTTON_HEIGHT }}
            resizeMode="contain"
          />
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={{
              position: 'absolute',
              left: WALLET_BALANCE_LEFT,
              top: WALLET_BALANCE_TOP,
              width: WALLET_BALANCE_WIDTH,
              height: WALLET_BALANCE_HEIGHT,
              lineHeight: WALLET_BALANCE_HEIGHT,
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: '800',
            }}
          >
            {coins.toLocaleString('en-IN')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('Rewards')}
          style={{
            position: 'absolute',
            left: walletButtonLeft + walletButtonWidth + TOP_BAR_ICON_GAP,
            top: (TOP_BAR_HEIGHT - GIFT_ICON_SIZE) / 2 + TOP_BAR_ICON_OFFSET_Y,
          }}
        >
          <Image
            source={require('../../assets/gift-icon.png')}
            style={{ width: GIFT_ICON_SIZE, height: GIFT_ICON_SIZE }}
            resizeMode="contain"
          />
        </Pressable>
        <Pressable
          onPress={() => (navigation as any).navigate('Profile')}
          style={{
            position: 'absolute',
            left: walletButtonLeft + walletButtonWidth + TOP_BAR_ICON_GAP + GIFT_ICON_SIZE + TOP_BAR_ICON_GAP,
            top: (TOP_BAR_HEIGHT - PROFILE_ICON_SIZE) / 2 + TOP_BAR_ICON_OFFSET_Y,
          }}
        >
          <Image
            source={AVATARS[avatarId - 1]}
            style={{ width: PROFILE_ICON_SIZE, height: PROFILE_ICON_SIZE, borderRadius: PROFILE_ICON_SIZE / 2 }}
            resizeMode="cover"
          />
        </Pressable>
      </View>
      <Image
        source={require('../../assets/control-panel.png')}
        style={{
          position: 'absolute',
          top: panelTop,
          left: (screenWidth - panelWidth) / 2,
          width: panelWidth,
          height: panelHeight,
        }}
        resizeMode="contain"
      />
      <ScrollView
        style={{ position: 'absolute', top: gameGridTop, left: 0, right: 0, bottom: 0 }}
        contentContainerStyle={{ height: gameGridRows * GAME_GRID_CELL + GAME_GRID_GAP }}
        showsVerticalScrollIndicator={false}
      >
      <Pressable
        onPress={() => (navigation as any).navigate('ColorPredict')}
        style={{
          position: 'absolute',
          top: winGoTileTop,
          left: winGoTileLeft,
          width: GAME_ICON_SIZE,
          height: GAME_ICON_SIZE,
          overflow: 'hidden',
        }}
      >
        <Image
          source={require('../../assets/wingo-home-icon.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </Pressable>
      <Pressable
        onPress={() => (navigation as any).navigate('Aviator')}
        style={{
          position: 'absolute',
          top: aviatorTileTop,
          left: aviatorTileLeft,
          width: GAME_ICON_SIZE,
          height: GAME_ICON_SIZE,
          overflow: 'hidden',
        }}
      >
        <Image
          source={require('../../assets/aviator-home-icon.png')}
          style={{ width: '100%', height: '100%' }}
          resizeMode="contain"
        />
      </Pressable>
      {/* No dedicated home-icon art given for this one yet (unlike Win Go/
          Aviator's own home-icon.png) — a plain rounded tile with an emoji
          until one is provided. */}
      <Pressable
        onPress={() => (navigation as any).navigate('ChickenRoad')}
        style={{
          position: 'absolute',
          top: chickenRoadTileTop,
          left: chickenRoadTileLeft,
          width: GAME_ICON_SIZE,
          height: GAME_ICON_SIZE,
          borderRadius: 20,
          backgroundColor: '#1A1B1E',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: GAME_ICON_SIZE * 0.5 }}>🐔</Text>
      </Pressable>
      <Pressable
        onPress={() => (navigation as any).navigate('Mines')}
        style={{
          position: 'absolute',
          top: minesTileTop,
          left: minesTileLeft,
          width: GAME_ICON_SIZE,
          height: GAME_ICON_SIZE,
          borderRadius: 20,
          backgroundColor: '#0B4FB8',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: GAME_ICON_SIZE * 0.5 }}>💣</Text>
      </Pressable>
      <Pressable
        onPress={() => (navigation as any).navigate('SevenUpDown')}
        style={{
          position: 'absolute',
          top: sevenUpDownTileTop,
          left: sevenUpDownTileLeft,
          width: GAME_ICON_SIZE,
          height: GAME_ICON_SIZE,
          borderRadius: 20,
          backgroundColor: '#0C5230',
          borderWidth: 2,
          borderColor: '#B7791F',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: GAME_ICON_SIZE * 0.36 }}>🎲</Text>
        <Text style={{ color: '#FFD66B', fontSize: 18, fontWeight: '900', marginTop: 2 }}>7 UP DOWN</Text>
      </Pressable>
      <Pressable
        onPress={() => (navigation as any).navigate('Plinko')}
        style={{
          position: 'absolute',
          top: plinkoTileTop,
          left: plinkoTileLeft,
          width: GAME_ICON_SIZE,
          height: GAME_ICON_SIZE,
          borderRadius: 20,
          backgroundColor: '#1B0B45',
          borderWidth: 2,
          borderColor: '#8A4DFF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* A tiny pin pyramid with a ball, drawn instead of an emoji. */}
        {[1, 2, 3, 4].map((n) => (
          <View key={n} style={{ flexDirection: 'row', gap: 9, marginBottom: 7 }}>
            {Array.from({ length: n }, (_, i) => (
              <View key={i} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#E9D8FF' }} />
            ))}
          </View>
        ))}
        <View style={{ position: 'absolute', top: 22, right: 44, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF3D9A' }} />
        <Text style={{ color: '#FFD66B', fontSize: 20, fontWeight: '900', marginTop: 2, letterSpacing: 2 }}>PLINKO</Text>
      </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
