import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { G, Path, Text as SvgText } from 'react-native-svg';
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

const SEGMENT_DEG = 360 / WHEEL_SECTIONS.length;

// Angle is measured clockwise from 12 o'clock.
function polar(angleDeg: number, r: number): [number, number] {
  const rad = (angleDeg * Math.PI) / 180;
  return [WHEEL_RADIUS + r * Math.sin(rad), WHEEL_RADIUS - r * Math.cos(rad)];
}

const BET_AMOUNTS = [10, 50, 100, 500, 1000];

export default function LuckyWheelScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { coins } = useGameState();
  const [selectedBet, setSelectedBet] = useState(100);
  const [isSpinning, setIsSpinning] = useState(false);
  const [result, setResult] = useState<{
    multiplier: number;
    winAmount: number;
    section: string;
  } | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;
  const rotationRef = useRef(0);

  const handleSpin = async () => {
    if (isSpinning) return;

    setIsSpinning(true);
    setResult(null);

    // Random winning section
    const randomIndex = Math.floor(Math.random() * WHEEL_SECTIONS.length);
    const winningSection = WHEEL_SECTIONS[randomIndex];

    // Pointer is fixed at 12 o'clock, so rotate the wheel until the winning
    // wedge's centre sits under it, plus a few full turns for show.
    const base = Math.ceil(rotationRef.current / 360) * 360;
    const finalRotation = base + 360 * 5 + (360 - (randomIndex + 0.5) * SEGMENT_DEG);
    rotationRef.current = finalRotation;

    Animated.timing(spinAnim, {
      toValue: finalRotation,
      duration: 4000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setIsSpinning(false);

      const winAmount = selectedBet * winningSection.multiplier;

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
                top: -6,
                width: 0,
                height: 0,
                backgroundColor: 'transparent',
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderTopColor: '#FFD66B',
                borderLeftWidth: 12,
                borderRightWidth: 12,
                borderTopWidth: 22,
                zIndex: 10,
              }}
            />

            <Animated.View
              style={{
                width: WHEEL_SIZE,
                height: WHEEL_SIZE,
                transform: [{ rotate: spinInterpolation }],
              }}
            >
              <Svg width={WHEEL_SIZE} height={WHEEL_SIZE}>
                {WHEEL_SECTIONS.map((section, index) => {
                  const a0 = index * SEGMENT_DEG;
                  const a1 = a0 + SEGMENT_DEG;
                  const [x0, y0] = polar(a0, WHEEL_RADIUS);
                  const [x1, y1] = polar(a1, WHEEL_RADIUS);
                  const mid = a0 + SEGMENT_DEG / 2;
                  const [tx, ty] = polar(mid, WHEEL_RADIUS * 0.7);
                  return (
                    <G key={section.id}>
                      <Path
                        d={`M${WHEEL_RADIUS},${WHEEL_RADIUS} L${x0},${y0} A${WHEEL_RADIUS},${WHEEL_RADIUS} 0 0 1 ${x1},${y1} Z`}
                        fill={section.color}
                        stroke="#1a1a1a"
                        strokeWidth={2}
                      />
                      <SvgText
                        x={tx}
                        y={ty}
                        fill="#000"
                        fontSize={18}
                        fontWeight="900"
                        textAnchor="middle"
                        alignmentBaseline="middle"
                        transform={`rotate(${mid}, ${tx}, ${ty})`}
                      >
                        {section.label}
                      </SvgText>
                    </G>
                  );
                })}
              </Svg>
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
            disabled={isSpinning}
            style={{
              width: '100%',
              paddingVertical: 16,
              borderRadius: 12,
              backgroundColor: isSpinning ? '#666' : '#FFD66B',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <Text
              style={{
                color: isSpinning ? '#999' : '#000',
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
                {result.section}
              </Text>
              <Text style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>
                Payout: {result.winAmount.toLocaleString('en-IN')}
              </Text>
              <Text style={{ color: '#888', fontSize: 12 }}>
                Practice mode — your wallet balance is not affected.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
