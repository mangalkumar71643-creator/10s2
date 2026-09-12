# NovaPlay mobile

Expo (React Native + TypeScript) app consuming the `backend` API.

## Setup

```bash
npm install
```

Edit `src/api/client.ts` and set `API_BASE_URL` to your backend's address
(use your machine's LAN IP, not `localhost`, when testing on a physical
device or the Android emulator — `http://10.0.2.2:4000` for the Android
emulator).

```bash
npm start        # opens Expo dev tools; scan the QR code with Expo Go
npm run android  # or npm run ios / npm run web
```

## Screens

- **Login / Register** — register enforces an 18+ age gate on the entered
  date of birth (also re-checked server-side).
- **Home** — sports tabs, upcoming events with live odds.
- **Event** — markets, selections, bet slip with stake input and potential
  payout.
- **Wallet** — balance, deposit/withdraw (sandbox payment provider — see
  root README for going live with a real processor).
- **Profile** — KYC submission, deposit limits, self-exclusion, logout.

## Next step: web

Once this is stable, the same backend API can serve a React web app
(consider `react-native-web` to reuse these screens directly, or a
separate React app under `/web` calling the same endpoints).
