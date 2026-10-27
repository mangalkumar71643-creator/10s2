import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';
import { ChatProvider } from './src/state/ChatContext';
import { SettingsProvider } from './src/state/SettingsContext';

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <ChatProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </ChatProvider>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
