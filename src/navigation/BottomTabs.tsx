import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import AnimatedTabBar from '../components/AnimatedTabBar';
import HomeScreen from '../screens/HomeScreen';
import RankingScreen from '../screens/RankingScreen';
import RewardsScreen from '../screens/RewardsScreen';
import VipScreen from '../screens/VipScreen';
import WalletScreen from '../screens/WalletScreen';
import { BottomTabParamList } from './types';

const Tab = createBottomTabNavigator<BottomTabParamList>();

export default function BottomTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AnimatedTabBar {...props} />}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Ranking" component={RankingScreen} options={{ title: 'Rank' }} />
      <Tab.Screen name="Rewards" component={RewardsScreen} options={{ title: 'Rewards' }} />
      <Tab.Screen name="Wallet" component={WalletScreen} options={{ title: 'Wallet' }} />
      <Tab.Screen name="Vip" component={VipScreen} options={{ title: 'VIP' }} />
    </Tab.Navigator>
  );
}
