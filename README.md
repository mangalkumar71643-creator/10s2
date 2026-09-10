# NovaPlay — Premium Virtual Gaming Hub

A virtual entertainment mobile app built with Expo (React Native + TypeScript). Uses an entirely
virtual, non-monetary "Coins" economy — no real-money betting, no payment gateways, no
withdrawals/deposits of any kind.

## Run it

```bash
npm install
npx expo start
```

Then scan the QR code with the **Expo Go** app on your Android/iOS phone, or press `a` / `i` to
open an Android/iOS emulator, or `w` for a web preview.

## What's included

- **Home** — hero banner, quick filters (All/Popular/New/Favorites), game categories, featured
  carousel, filtered game grid.
- **Wallet** — virtual coin balance, earn/history actions, transaction list.
- **Rewards** — My Rewards (achievements), Daily Missions + 7-day streak reward, Rules tab.
- **Ranking** — podium + full leaderboard, My Rank tab.
- **VIP** — progress toward next VIP level, current benefits, all VIP levels (0–6).
- **Profile** — stats, achievements, favorite games, settings/help/notifications menu.
- **Settings**, **Help Center** (FAQ), **Notifications**, **Game Category browser** (search +
  category sidebar), **Game Detail** (play → earn a randomized virtual coin reward).

All data is local mock data (`src/data/mockData.ts`) served through an async service layer
(`src/services/*`) that mirrors what a real backend integration would look like. Wallet balance,
transactions, missions, streak and favorites persist locally on-device via AsyncStorage.

## Project structure

```
src/
  theme/         design tokens (colors, gradients, spacing, typography)
  data/          TypeScript models + mock data
  services/      async "backend" layer (swap with real APIs later)
  state/         GameStateContext — global wallet/missions/favorites state
  components/    reusable UI building blocks
  navigation/    bottom tabs + root stack
  screens/       one file per screen
```

## Note on virtual coins

Coins are for in-app entertainment only: they can be earned through gameplay, missions and daily
rewards, and spent on cosmetic unlocks. They have no cash value and this app contains no
mechanism to buy, withdraw, or cash out coins.
