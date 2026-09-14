import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { AVATARS } from '../data/avatars';
import { BottomTabParamList } from '../navigation/types';
import { useAuth } from '../state/AuthContext';
import { useGameState } from '../state/GameStateContext';
import { colors, gradients, radius, shadow, spacing, typography } from '../theme';

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
// the red control-panel graphic's bottom edge to the top of its "Crash" game
// tile, and that tile's own box (x:18-1200, y:1700-1935 in that same
// reference frame) — reused here so our tile sits the same distance below
// our own panel, at the same size, just themed for Win Go instead.
const WIN_GO_GAP_BELOW_PANEL = 250;
const WIN_GO_TILE_WIDTH_FRACTION = 0.92;
const WIN_GO_TILE_ASPECT = 1182 / 235;

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
  const winGoTileWidth = screenWidth * WIN_GO_TILE_WIDTH_FRACTION;
  const winGoTileHeight = winGoTileWidth / WIN_GO_TILE_ASPECT;
  const winGoTileTop = panelTop + panelHeight + screenHeight * (WIN_GO_GAP_BELOW_PANEL / REFERENCE_HEIGHT);
  const walletButtonWidth = WALLET_BUTTON_HEIGHT * WALLET_BUTTON_ASPECT;
  const walletButtonLeft = (screenWidth - walletButtonWidth) / 2 - 25;

  return (
    <ScreenContainer scroll={false} backgroundImage={require('../../assets/home-background.png')}>
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
      <Pressable
        onPress={() => (navigation as any).navigate('ColorPredict')}
        style={{
          position: 'absolute',
          top: winGoTileTop,
          left: (screenWidth - winGoTileWidth) / 2,
          width: winGoTileWidth,
          height: winGoTileHeight,
          borderRadius: radius.lg,
          borderWidth: 2,
          borderColor: colors.gold,
          overflow: 'hidden',
          ...shadow.glow,
        }}
      >
        <LinearGradient
          colors={gradients.balanceCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.lg,
          }}
        >
          <View>
            <Text style={{ color: colors.gold, fontWeight: '800', fontSize: typography.md, letterSpacing: 1 }}>
              WIN GO
            </Text>
            <Text
              style={{
                color: colors.goldLight,
                fontWeight: '800',
                fontSize: typography.display,
                letterSpacing: 0.5,
                textShadowColor: colors.crimson,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 8,
              }}
            >
              999X
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginRight: spacing.md }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#2FBE6B' }} />
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#9B5DE5', marginTop: 10 }} />
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#E14B4B' }} />
          </View>
          <LinearGradient
            colors={gradients.crimsonButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: winGoTileHeight * 0.62,
              height: winGoTileHeight * 0.62,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="play" size={winGoTileHeight * 0.32} color={colors.textPrimary} />
          </LinearGradient>
        </LinearGradient>
      </Pressable>
    </ScreenContainer>
  );
}
