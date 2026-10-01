import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Pressable, View, useWindowDimensions } from 'react-native';

const STORAGE_KEY = 'novaplay:depositPopup:hiddenOn';

// deposit-bonus.webp is 832x1248. The "Don't show again today" bar and its
// text were baked into the art; these are their positions in that image.
const IMAGE_W = 832;
const IMAGE_H = 1248;
const BAR = { left: 125, top: 1052, right: 705, bottom: 1145 };
const CHECKBOX = { left: 196, centerY: 1101, size: 38 };

const CLOSE_SIZE = 34;

// Shown once per app launch, unless the player ticked the box earlier today.
let shownThisLaunch = false;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export default function DepositBonusPopup() {
  const { width, height } = useWindowDimensions();
  const [visible, setVisible] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (shownThisLaunch) return;
    shownThisLaunch = true;
    let cancelled = false;
    (async () => {
      let hiddenOn: string | null = null;
      try {
        hiddenOn = await AsyncStorage.getItem(STORAGE_KEY);
      } catch {
        hiddenOn = null;
      }
      if (!cancelled && hiddenOn !== today()) setVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const close = () => {
    setVisible(false);
    if (dontShow) AsyncStorage.setItem(STORAGE_KEY, today()).catch(() => {});
  };

  // Fit the art inside the screen, leaving room for the close button above it.
  const imageW = Math.min(width - 40, (height - CLOSE_SIZE - 80) * (IMAGE_W / IMAGE_H), 420);
  const scale = imageW / IMAGE_W;
  const imageH = IMAGE_H * scale;
  const box = CHECKBOX.size * scale;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: imageW }}>
          <Pressable
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              alignSelf: 'flex-end',
              width: CLOSE_SIZE,
              height: CLOSE_SIZE,
              borderRadius: CLOSE_SIZE / 2,
              marginBottom: 8,
              borderWidth: 1.5,
              borderColor: 'rgba(255,255,255,0.85)',
              backgroundColor: 'rgba(0,0,0,0.35)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
          </Pressable>
          <View style={{ width: imageW, height: imageH, borderRadius: 14, overflow: 'hidden' }}>
            <Image source={require('../../assets/popup/deposit-bonus.webp')} style={{ width: imageW, height: imageH }} resizeMode="cover" />
            {/* The whole baked-in bar toggles the box, so the text is tappable too. */}
            <Pressable
              onPress={() => setDontShow((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dontShow }}
              accessibilityLabel="Don't show again today"
              style={{
                position: 'absolute',
                left: BAR.left * scale,
                top: BAR.top * scale,
                width: (BAR.right - BAR.left) * scale,
                height: (BAR.bottom - BAR.top) * scale,
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  left: (CHECKBOX.left - BAR.left) * scale,
                  top: (CHECKBOX.centerY - BAR.top) * scale - box / 2,
                  width: box,
                  height: box,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: '#F3CF7A',
                  backgroundColor: dontShow ? '#F3CF7A' : 'rgba(0,0,0,0.25)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {dontShow && <MaterialCommunityIcons name="check-bold" size={box * 0.8} color="#5A0E0A" />}
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
