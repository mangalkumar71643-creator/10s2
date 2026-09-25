import { NavigatorScreenParams } from '@react-navigation/native';

export type BottomTabParamList = {
  Home: undefined;
  Ranking: undefined;
  Rewards: undefined;
  Wallet: undefined;
  Vip: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Otp: { phone: string };
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<BottomTabParamList>;
  Profile: undefined;
  Settings: undefined;
  Help: undefined;
  Notifications: undefined;
  BalanceRecords: undefined;
  History: undefined;
  Deposit: undefined;
  Withdraw: undefined;
  ColorPredict: undefined;
  Aviator: undefined;
  ChickenRoad: undefined;
  Mines: undefined;
  SevenUpDown: undefined;
  Plinko: undefined;
  DragonTiger: undefined;
  Vortex: undefined;
  AndarBahar: undefined;
  TeenPatti: undefined;
  CricketX: undefined;
};
