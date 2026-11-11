# Nova AI — apna ChatGPT jaisa AI app

Ek ChatGPT jaisa chat app (Android, iOS aur Web) aur uska backend server.
Abhi yeh **demo model** par chalta hai. Baad me aap OpenAI / Ollama / ya **apna khud ka trained
model** jod sakte hain — sirf server ki `.env` file badalni hogi, app me koi change nahi.

```
nova-ai/
  app/      Expo SDK 57 mobile + web app (React Native, TypeScript)
  server/   Node.js chat server (koi extra package nahi chahiye)
  TRAINING.md   Apna model train karke jodne ki guide
```

## App me kya hai

- ChatGPT jaisa chat screen — jawab word-by-word stream hota hai
- **Stop** button (jawab beech me rokne ke liye)
- Kai chats: naya chat, purane chats ki list, delete
- Chats phone me save rehti hain (AsyncStorage)
- Code blocks, `inline code` aur **bold** text ka formatting
- Settings: Server URL, API token, custom instructions, "Test connection"

## Kaise chalayein

Node.js 22 ya usse naya chahiye.

**1. Server chalu karein**

```bash
cd server
cp .env.example .env      # zaroorat ho to edit karein
npm start                 # http://localhost:8787
```

**2. App chalu karein** (doosre terminal me)

```bash
cd app
npm install
npx expo start
```

Phone par **Expo Go** app se QR code scan karein, ya `w` dabakar browser me kholein.

> **Asli phone par:** phone `localhost` tak nahi pahunch sakta. App ki **Settings → Server URL**
> me apne computer ka IP likhein (jaise `http://192.168.1.5:8787`), ya app start karte waqt:
> `EXPO_PUBLIC_API_URL=http://192.168.1.5:8787 npx expo start`.
> Android emulator ke liye default `http://10.0.2.2:8787` pehle se set hai.

## Asli AI model jodna

`server/.env` me:

| Kya chahiye | Setting |
|---|---|
| Demo (koi key nahi) | `PROVIDER=mock` |
| OpenAI | `PROVIDER=openai`, `OPENAI_API_KEY=sk-...`, `MODEL=gpt-4o-mini` |
| Free, apne computer par (Ollama) | `PROVIDER=openai`, `OPENAI_BASE_URL=http://localhost:11434/v1`, `MODEL=llama3.2` |
| Apna trained model (vLLM / LM Studio / llama.cpp) | `PROVIDER=openai`, `OPENAI_BASE_URL=http://<aapka-server>:8000/v1`, `MODEL=<model-name>` |

Koi bhi service jo OpenAI Chat Completions API bolti hai, seedhe jud jaati hai.
Apna model train karne ka tareeka: [TRAINING.md](TRAINING.md).

## Server API

- `GET /api/health` → `{ ok, provider, model }`
- `POST /api/chat` body `{ messages: [{role: "user"|"assistant", content}], systemPrompt? }`
  → Server-Sent Events: `{"type":"delta","text":"..."}`, phir `{"type":"done"}`
  (ya `{"type":"error","message":"..."}`)

Internet par server daalne se pehle `.env` me `API_TOKEN` zaroor set karein, aur wahi token app ki
Settings me daalein.

## Tests

```bash
cd server && npm test        # server tests
cd app && npm run typecheck  # app TypeScript check
```

## Doosre repo/app me daalna

- **Poora app:** `app/` aur `server/` folder copy kar lein — dono alag-alag chal sakte hain.
- **Kisi existing Expo app (jaise NovaPlay) me AI chat screen:** `app/src/` se `api/`, `state/`,
  `components/`, `screens/ChatScreen.tsx`, `types.ts` aur `theme.ts` copy karein, `App.tsx` ki tarah
  `SettingsProvider` + `ChatProvider` se wrap karein, aur `ChatScreen` ko navigator me ek screen
  bana dein.
