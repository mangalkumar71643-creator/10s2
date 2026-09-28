import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import ScreenContainer from '../components/ScreenContainer';
import { useGameState } from '../state/GameStateContext';

const { width: screenWidth } = Dimensions.get('window');

const WHEEL_SIZE = Math.min(screenWidth - 40, 300);
const WHEEL_RADIUS = WHEEL_SIZE / 2;

const WHEEL_SECTIONS = [
  { id: 1, label: '2X', color: '#FF6B6B', multiplier: 2 },
  { id: 2, label: '5X', color: '#4ECDC4', multiplier: 5 },
  { id: 3, label: '10X', color: '#FFE66D', multiplier: 10 },
  { id: 4, label: '3X', color: '#95E1D3', multiplier: 3 },
  { id: 5, label: '7X', color: '#FF9FF3', multiplier: 7 },
  { id: 6, label: '2X', color: '#54A0FF', multiplier: 2 },
  { id: 7, label: '1X', color: '#48DBFB', multiplier: 1 },
  { id: 8, label: '4X', color: '#FF7675', multiplier: 4 },
];

const BET_AMOUNTS = [10, 50, 100, 500, 1000];

export default function LuckyWheelScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { coins, refreshWallet } = useGameState();
  const [selectedBet, setSelectedBet] = useState(100);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<{
    multiplier: number;
    winAmount: number;
    section: string;
  } | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const handleSpin = async () => {
    if (isSpinning || coins < selectedBet) return;

    setIsSpinning(true);
    setResult(null);

    // Random winning section
    const randomIndex = Math.floor(Math.random() * WHEEL_SECTIONS.length);
    const winningSection = WHEEL_SECTIONS[randomIndex];

    // Spin animation (multiple rotations + final angle)
    const finalRotation = (randomIndex * (360 / WHEEL_SECTIONS.length)) + 360 * 3;

    Animated.timing(spinAnim, {
      toValue: finalRotation,
      duration: 3000,
      useNativeDriver: false,
    }).start(() => {
      setIsSpinning(false);

      // Calculate win amount
      const winAmount = selectedBet * winningSection.multiplier;
      const netWin = winAmount - selectedBet;

      // Refresh wallet from backend to get updated balance
      refreshWallet().catch(() => {});

      setResult({
        multiplier: winningSection.multiplier,
        winAmount,
        section: winningSection.label,
      });
    });
  };

  const spinInterpolation = spinAnim.interpolate({
    inputRange: [0, 360],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <ScreenContainer scroll={false} backgroundImage={require('../../assets/home-background.webp')}>
      {/* Header */}
      <View
        style={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <MaterialCommunityIcons name="chevron-left" size={28} color="#FFD66B" />
        </Pressable>
        <Text style={{ flex: 1, color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginLeft: 8 }}>
          Lucky Wheel
        </Text>
      </View>

      <ScrollView style={{ flex: 1, paddingHorizontal: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginTop: 20 }}>
          {/* Wheel Container */}
          <View
            style={{
              width: WHEEL_SIZE + 20,
              height: WHEEL_SIZE + 20,
              borderRadius: (WHEEL_SIZE + 20) / 2,
              backgroundColor: '#1a1a1a',
              padding: 10,
              borderWidth: 3,
              borderColor: '#FFD66B',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 30,
            }}
          >
            {/* Pointer */}
            <View
              style={{
                position: 'absolute',
                top: -10,
                width: 0,
                height: 0,
                backgroundColor: 'transparent',
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: '#FFD66B',
                borderLeftWidth: 10,
                borderRightWidth: 10,
                borderBottomWidth: 15,
                zIndex: 10,
              }}
            />

            {/* Wheel */}
            <Animated.View
              style={[
                {
                  width: WHEEL_SIZE,
                  height: WHEEL_SIZE,
                  borderRadius: WHEEL_RADIUS,
                  overflow: 'hidden',
                },
                {
                  transform: [
                    {
                      rotate: spinInterpolation,
                    },
                  ],
                },
              ]}
            >
              {WHEEL_SECTIONS.map((section, index) => {
                const angle = (index * 360) / WHEEL_SECTIONS.length;
                return (
                  <View
                    key={section.id}
                    style={{
                      position: 'absolute',
                      width: WHEEL_SIZE,
                      height: WHEEL_SIZE,
                      borderRadius: WHEEL_RADIUS,
                    }}
                  >
                    <View
                      style={{
                        position: 'absolute',
                        width: '100%',
                        height: '100%',
                        backgroundColor: section.color,
                        transform: [
                          {
                            rotate: `${angle}deg`,
                          },
                        ],
                        transformOrigin: `${WHEEL_RADIUS}px ${WHEEL_RADIUS}px`,
                        opacity: 0.9,
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        top: WHEEL_RADIUS * 0.15,
                        left: '50%',
                        marginLeft: -20,
                        width: 40,
                        alignItems: 'center',
                        transform: [
                          {
                            rotate: `${angle + 22.5}deg`,
                          },
                        ],
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: '900',
                          color: '#000',
                          textAlign: 'center',
                        }}
                      >
                        {section.label}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </Animated.View>

            {/* Center Circle */}
            <View
              style={{
                position: 'absolute',
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: '#FFD66B',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 5,
              }}
            >
              <MaterialCommunityIcons name="star" size={32} color="#000" />
            </View>
          </View>

          {/* Bet Selection */}
          <View style={{ width: '100%', marginBottom: 20 }}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 10 }}>
              Select Bet Amount
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {BET_AMOUNTS.map((amount) => (
                <Pressable
                  key={amount}
                  onPress={() => setSelectedBet(amount)}
                  style={{
                    flex: 1,
                    minWidth: '30%',
                    paddingVertical: 12,
                    borderRadius: 8,
                    backgroundColor:
                      selectedBet === amount ? '#FFD66B' : 'rgba(255, 214, 107, 0.1)',
                    borderWidth: 2,
                    borderColor: selectedBet === amount ? '#FFD66B' : 'transparent',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: selectedBet === amount ? '#000' : '#FFD66B',
                      fontWeight: '700',
                      fontSize: 12,
                    }}
                  >
                    {amount}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Balance Info */}
          <View
            style={{
              width: '100%',
              flexDirection: 'row',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(255, 214, 107, 0.1)',
              borderRadius: 8,
              padding: 12,
              marginBottom: 20,
            }}
          >
            <View>
              <Text style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Your Balance</Text>
              <Text style={{ color: '#FFD66B', fontSize: 16, fontWeight: '700' }}>
                {coins.toLocaleString('en-IN')}
              </Text>
            </View>
            <View>
              <Text style={{ color: '#888', fontSize: 12, marginBottom: 4 }}>Bet Amount</Text>
              <Text style={{ color: '#FFD66B', fontSize: 16, fontWeight: '700' }}>
                {selectedBet.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>

          {/* Spin Button */}
          <Pressable
            onPress={handleSpin}
            disabled={isSpinning || coins < selectedBet}
            style={{
              width: '100%',
              paddingVertical: 16,
              borderRadius: 12,
              backgroundColor: isSpinning || coins < selectedBet ? '#666' : '#FFD66B',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                color: isSpinning || coins < selectedBet ? '#999' : '#000',
                fontSize: 16,
                fontWeight: '800',
                letterSpacing: 1,
              }}
            >
              {isSpinning ? 'SPINNING...' : 'SPIN WHEEL'}
            </Text>
          </Pressable>

          {/* Result */}
          {result && !isSpinning && (
            <View
              style={{
                width: '100%',
                backgroundColor: 'rgba(255, 214, 107, 0.15)',
                borderRadius: 12,
                padding: 20,
                marginBottom: 20,
                borderLeftWidth: 4,
                borderLeftColor: '#FFD66B',
              }}
            >
              <Text style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>RESULT</Text>
              <Text style={{ color: '#FFD66B', fontSize: 24, fontWeight: '900', marginBottom: 8 }}>
                {result.section} - {result.multiplier}X
              </Text>
              <Text style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>
                Win Amount: {result.winAmount.toLocaleString('en-IN')}
              </Text>
              {result.multiplier > 1 && (
                <Text style={{ color: '#4ECB71', fontSize: 13, fontWeight: '600' }}>
                  ✓ You won {(result.winAmount - selectedBet).toLocaleString('en-IN')}!
                </Text>
              )}
              {result.multiplier === 1 && (
                <Text style={{ color: '#FF6B6B', fontSize: 13, fontWeight: '600' }}>
                  Better luck next time!
                </Text>
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
