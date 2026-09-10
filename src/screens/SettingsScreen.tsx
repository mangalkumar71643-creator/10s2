import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import ScreenContainer from '../components/ScreenContainer';
import SectionHeader from '../components/SectionHeader';
import { IconName } from '../data/models';
import { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';
import { useAuth } from '../state/AuthContext';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { phone, uid, logout } = useAuth();
  const [sound, setSound] = useState(true);
  const [music, setMusic] = useState(true);
  const [vibration, setVibration] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  function handleLogout() {
    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to log out?')) logout();
      return;
    }
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <ScreenContainer>
      <AppHeader showBack title="Settings" showCoins={false} showNotifications={false} showProfile={false} />

      <SectionHeader title="Preferences" />
      <View style={styles.card}>
        <ToggleRow icon="volume-high" label="Sound Effects" value={sound} onChange={setSound} />
        <ToggleRow icon="music-note-outline" label="Music" value={music} onChange={setMusic} />
        <ToggleRow icon="vibrate" label="Vibration" value={vibration} onChange={setVibration} />
        <ToggleRow icon="bell-ring-outline" label="Notifications" value={notificationsEnabled} onChange={setNotificationsEnabled} last />
      </View>

      <SectionHeader title="Display" />
      <View style={styles.card}>
        <InfoRow icon="translate" label="Language" value="English" />
        <InfoRow icon="theme-light-dark" label="Theme" value="Dark" last />
      </View>

      <SectionHeader title="Account" />
      <View style={styles.card}>
        {uid ? <InfoRow icon="identifier" label="User ID" value={uid} /> : null}
        {phone ? <InfoRow icon="cellphone" label="Mobile Number" value={`+91 ${phone}`} /> : null}
        <NavRow icon="account-circle-outline" label="Account" onPress={() => navigation.navigate('Profile')} />
        <NavRow icon="shield-lock-outline" label="Privacy" onPress={() => Alert.alert('Privacy', 'Privacy policy coming soon.')} />
        <NavRow
          icon="file-document-outline"
          label="Terms of Service"
          onPress={() => Alert.alert('Terms of Service', 'Terms of service coming soon.')}
        />
        <NavRow icon="help-circle-outline" label="Help" onPress={() => navigation.navigate('Help')} last />
      </View>

      <Pressable onPress={handleLogout} style={styles.logoutButton}>
        <MaterialCommunityIcons name="logout" size={18} color={colors.negative} />
        <Text style={styles.logoutText}>Log Out</Text>
      </Pressable>

      <Text style={styles.footerNote}>
        NovaPlay is a virtual entertainment app. All coins are for in-app use only and hold no real-world monetary value.
      </Text>
      <Text style={styles.version}>Version 1.0.0</Text>
    </ScreenContainer>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  onChange,
  last,
}: {
  icon: IconName;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.gold} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceAlt, true: colors.goldDark }}
        thumbColor={value ? colors.gold : colors.textMuted}
        style={styles.switch}
      />
    </View>
  );
}

function InfoRow({ icon, label, value, last }: { icon: IconName; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.gold} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function NavRow({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.row, last && styles.rowLast]}>
      <MaterialCommunityIcons name={icon} size={19} color={colors.gold} />
      <Text style={styles.rowLabel}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} style={styles.chevron} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { color: colors.textPrimary, fontSize: typography.sm, fontWeight: '600', marginLeft: spacing.md, flex: 1 },
  rowValue: { color: colors.textMuted, fontSize: typography.sm },
  switch: { marginLeft: spacing.sm },
  chevron: { marginLeft: 'auto' },
  footerNote: {
    color: colors.textMuted,
    fontSize: typography.xs,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    marginTop: spacing.xl,
    lineHeight: 16,
  },
  version: { color: colors.textMuted, fontSize: typography.xs, textAlign: 'center', marginTop: spacing.sm },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.negative,
  },
  logoutText: { color: colors.negative, fontWeight: '700', fontSize: typography.sm, marginLeft: spacing.sm },
});
