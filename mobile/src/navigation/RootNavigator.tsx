import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import BottomTabs from './BottomTabs';
import { AuthStackParamList, RootStackParamList } from './types';
import AviatorScreen from '../screens/AviatorScreen';
import BalanceRecordsScreen from '../screens/BalanceRecordsScreen';
import ColorPredictScreen from '../screens/ColorPredictScreen';
import CompleteProfileScreen from '../screens/CompleteProfileScreen';
import DepositScreen from '../screens/DepositScreen';
import HelpScreen from '../screens/HelpScreen';
import HistoryScreen from '../screens/HistoryScreen';
import LoginScreen from '../screens/LoginScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OtpScreen from '../screens/OtpScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SettingsScreen from '../screens/SettingsScreen';
import WithdrawScreen from '../screens/WithdrawScreen';
import LoadingState from '../components/LoadingState';
import ScreenContainer from '../components/ScreenContainer';
import { colors } from '../theme';
import { useAuth } from '../state/AuthContext';

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.background,
    text: colors.textPrimary,
    border: colors.border,
    primary: colors.gold,
  },
};

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Otp" component={OtpScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="MainTabs" component={BottomTabs} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Help" component={HelpScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="BalanceRecords" component={BalanceRecordsScreen} />
      <Stack.Screen name="History" component={HistoryScreen} />
      <Stack.Screen name="Deposit" component={DepositScreen} />
      <Stack.Screen name="Withdraw" component={WithdrawScreen} />
      <Stack.Screen name="ColorPredict" component={ColorPredictScreen} />
      <Stack.Screen name="Aviator" component={AviatorScreen} />
    </Stack.Navigator>
  );
}

export default function RootNavigator() {
  const { loading, isAuthenticated, needsProfile } = useAuth();

  return (
    <NavigationContainer theme={navigationTheme}>
      {loading ? (
        <ScreenContainer scroll={false}>
          <LoadingState />
        </ScreenContainer>
      ) : needsProfile ? (
        <CompleteProfileScreen />
      ) : isAuthenticated ? (
        <MainNavigator />
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
