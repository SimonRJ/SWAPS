# SWAPS (Synced Soccer Subs)

A brand-new cloud-synced rebuild of Soccer-Subs using **React + Vite + Tailwind + Firestore** with real-time updates, offline caching, and team-code/passcode onboarding.

## 1) Analysis of the original app

The original Soccer-Subs app is a mobile-friendly React/Tailwind app with localStorage persistence and these core flows:

- Team setup/login
- Player management
- Game-day setup
- Live substitutions and timer flow
- Season stats

This new app keeps those same core features, but replaces localStorage with Firestore so multiple devices stay in sync in real-time.

## 2) New architecture proposal

### Frontend

- React + Vite SPA
- React Router for route-based screens:
  - `/onboarding`
  - `/team`
  - `/game`
  - `/stats`
- Team context provider wraps Firestore subscriptions
- TailwindCSS for UI

### Data layer

- Firebase SDK v9+ modular APIs
- Firestore listeners via `onSnapshot`
- Offline persistence enabled with `persistentLocalCache + persistentMultipleTabManager`
- Local storage keeps active `teamId` so users auto-reconnect

### Security model (no accounts)

- Team join is gated by `teamId + passcode`
- Passcode is hashed client-side (`SHA-256`) before storage
- Firestore Rules and app checks are in `firestore.rules` (see note in docs about no-auth tradeoffs)

## 3) Firestore schema

Detailed schema and rules rationale: **`/docs/firestore-schema.md`**

Collections:

- `teams/{teamId}`
  - metadata + hashed passcode
- `teams/{teamId}/players/{playerId}`
- `teams/{teamId}/games/{gameId}`
- `teams/{teamId}/games/{gameId}/substitutions/{substitutionId}`
- `teams/{teamId}/stats/{playerId}`

## 4) Project structure

```text
.
├─ docs/
│  └─ firestore-schema.md
├─ public/
│  ├─ manifest.webmanifest
│  └─ icons/
├─ src/
│  ├─ components/
│  ├─ context/
│  ├─ firebase/
│  ├─ hooks/
│  ├─ lib/
│  ├─ screens/
│  └─ services/
├─ firestore.rules
└─ ...vite/tailwind config files
```

## 5) Setup guide

1. Install deps

```bash
npm install
```

2. Create `.env` with Firebase config:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

3. Run app

```bash
npm run dev
```

4. Build production bundle

```bash
npm run build
```

## 6) PWA support

Implemented via `vite-plugin-pwa` in `vite.config.js`.

Included:

- `public/manifest.webmanifest`
- auto-updating service worker registration (`virtual:pwa-register`)
- icon set in `/public/icons`

## 7) Capacitor preparation (iOS/Android)

1. Build web assets: `npm run build`
2. Initialize Capacitor in this project
3. Set Capacitor `webDir` to `dist`
4. Add iOS and Android platforms
5. Run `npx cap sync`

Firestore in WebView notes:

- keep HTTPS-capable Firebase config
- offline cache works in Capacitor WebView, but test multi-tab assumptions per platform
- use the same passcode/team onboarding flow for all platforms

## 8) Migration guide (old local app → new synced app)

1. In the old app, capture team/player/game stats snapshot.
2. In SWAPS, create a new team (gets team code + passcode).
3. Recreate team players in Team screen.
4. Start a game and continue live substitutions in synced mode.
5. Share team code + passcode with other devices to join same dataset.

## 9) Current implementation status

Implemented now:

- Team creation and join by team code/passcode
- Player management
- Game creation
- Live substitution logging
- Stats document model and rendering
- Real-time Firestore subscriptions
- Offline persistence
- PWA configuration

