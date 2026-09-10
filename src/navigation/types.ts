import { NavigatorScreenParams } from '@react-navigation/native';
import { GameCategoryId } from '../data/models';

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
  GameCategory: { categoryId?: GameCategoryId };
  GameDetail: { gameId: string };
};
