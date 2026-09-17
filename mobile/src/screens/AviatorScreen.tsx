import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RootStackParamList } from '../navigation/types';

export default function AviatorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Pressable
        onPress={() => navigation.goBack()}
        hitSlop={10}
        style={[styles.backBtn, { top: insets.top + 8 }]}
      >
        <MaterialCommunityIcons name="chevron-left" size={28} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  backBtn: {
    position: 'absolute',
    left: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
