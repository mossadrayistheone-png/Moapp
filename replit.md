# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### `apps/web` (`@workspace/web`) — Frontend Web App
- Vite + React + TypeScript, output to `apps/web/dist/`
- Connected to `@workspace/api-client-react` via workspace reference
- API URL configured via `VITE_API_URL` environment variable (no secrets in client code)
- Dev: `PORT=3000 pnpm run dev` | Build: `pnpm run build` | Preview: `pnpm run preview`
- **Render Static Site settings**: Build Command `pnpm --filter @workspace/web build`, Publish Directory `apps/web/dist`, Environment variable `VITE_API_URL=<your-api-server-url>`
- Key files: `src/App.tsx`, `src/main.tsx`, `src/index.css`, `vite.config.ts`

### `artifacts/mo` (`@workspace/mo`) — Mo: AI Voice Assistant (Web)
- React + Vite web app, served at `/`
- Full voice flow: browser Web Speech API → OpenAI GPT-4o-mini → ElevenLabs TTS
- Three personality modes: Executive, Creative, Motivational
- Black and gold luxury design, background video
- Key files: `src/pages/Home.tsx`, `src/components/MicButton.tsx`, `src/hooks/use-voice-assistant.ts`

### `artifacts/mo-app` (`@workspace/mo-app`) — Mo: AI Voice Assistant (Native)
- Expo React Native app, scanned via Expo Go QR code
- **APK v16** (versionCode 16) — **66 MB** (32 MB video now bundled in APK, not streamed); EAS Build ID: `d743f302-9473-4b55-8c7b-fc267a861b22`
  - APK file: `artifacts/api-server/public/mo-app-v16.apk` (66 MB)
  - Download: `/api/download/mo-app-v16.apk`
- **APK v15** (versionCode 15) — **34 MB**; EAS Build ID: `8d1e3427-bd30-4869-b2f1-0e3bff747ca1`
  - APK file: `artifacts/api-server/public/mo-app-v15.apk` (34 MB)
  - EAS build URL: https://expo.dev/accounts/moexec/projects/moexec/builds/8d1e3427-bd30-4869-b2f1-0e3bff747ca1
  - **Size optimizations applied:**
    1. Background video removed from APK bundle → streams from API server as `background.mp4` (27 MB compressed from 129 MB, saved ~130 MB)
    2. `reactNativeArchitectures=arm64-v8a` only (was: armeabi-v7a, arm64-v8a, x86, x86_64) — saved ~60 MB of native libs
    3. R8 minification enabled (`android.enableMinifyInReleaseBuilds=true`) — saved ~5-10 MB
    4. Shrink resources enabled (`android.enableShrinkResourcesInReleaseBuilds=true`)
    5. `.easignore` excludes `assets/videos/background.mp4` from EAS project upload
  - Video URL: `https://EXPO_PUBLIC_DOMAIN/api/download/background.mp4` (set at build time via eas.json env)
  - Filler phrases: 10 pre-generated MP3s in Mo's STS voice (`assets/fillers/filler-01..10.mp3`) play instantly while API processes
- **APK v14** (versionCode 14) — Filler phrase system + ElevenLabs STS pipeline; EAS Build ID: `5789b05c-4246-4d69-90bd-b53d23f319db`
  - EAS build URL: https://expo.dev/accounts/moexec/projects/moexec/builds/5789b05c-4246-4d69-90bd-b53d23f319db
  - Filler phrases: 10 pre-generated MP3s in Mo's STS voice (`assets/fillers/filler-01..10.mp3`) play instantly while API processes
  - ElevenLabs STS pipeline: OpenAI TTS (alloy) → ElevenLabs `/v1/speech-to-speech/{id}/stream` (`eleven_english_sts_v2`)
  - Bundled 1,592 Metro modules (10 more than v13 for filler audio assets)
- **APK v12** (versionCode 12) — Realtime voice pipeline (OpenAI Realtime API); EAS Build ID: `87d52ffb-a24e-4780-838f-4001affac57d`
  - APK file: `artifacts/api-server/public/mo-app-v12.apk`
- **APK v11** (versionCode 11) — restored 129 MB cinematic video, random start position; EAS Build ID: `af4392ce-f2fe-4e95-bc79-7472d80e1ba0`
  - APK file: `artifacts/api-server/public/mo-app-v11.apk` (222 MB)
  - EAS project ID: `1c83b5bc-7a55-49ff-91e4-9a6c5c1984be`, slug: `moexec`
  - Keystore: debug keystore (`androiddebugkey`, password `android`)
- **Voice pipeline (active, HTTP)**: expo-av recording → base64 → Whisper (whisper-1) → GPT-4o-mini+tools → ElevenLabs Turbo TTS (`eleven_turbo_v2_5`, `ELEVENLABS_API_KEY`, `/v1/text-to-speech/{voice_id}`) → mp3_22050_32 → base64 JSON; filler phrase (pre-generated bundled MP3) plays immediately via `Promise.all([playFillerAsync(), apiPromise])` — answer starts only after BOTH filler ends AND API responds (zero overlap)
- **Voice pipeline (v12+, realtime)**: Realtime WebSocket (`/api/mo/realtime`) → expo-av M4A recording → base64 JSON via WebSocket → server: ffmpeg M4A→PCM16 24kHz → OpenAI Realtime API (`gpt-4o-realtime-preview-2024-12-17`, `shimmer` voice) → PCM16→WAV → base64 WAV to mobile → expo-av playback. Falls back to HTTP pipeline (`useVoice`) if WebSocket unavailable.
- Four personality modes: Executive, Creative, Motivational, Planner
- Conversation continuity: last 10 turns sent with every request
- Notes: full CRUD via voice — save with optional title + category pill, delete by keyword; notes injected into system prompt for context; NoteCard shows title, color-coded category pill, mic/pen source icon
- Planning: `plan_day` GPT tool generates structured daily plans (4–8 time blocks) from tasks/reminders/notes/memory context; PlanCard renders inline with animated block rows, priority accents, type icons, dismiss button
- Reminders: local push notifications via expo-notifications, parsed by GPT
- Settings: name, location, timezone, auto-play, response length, background video toggle
- Fonts: Cormorant Garamond (display) + DM Sans (body)
- Key files:
  - `app/(tabs)/index.tsx` — main screen
  - `app/settings.tsx` — settings screen
  - `app/notes.tsx` — notes + reminders screen
  - `context/AppContext.tsx` — preferences + conversation history
  - `hooks/use-realtime-voice.ts` — **new** realtime WebSocket voice hook (default, falls back to use-voice)
  - `hooks/use-voice.ts` — classic HTTP voice pipeline hook (fallback)
  - `hooks/use-notes.ts` — notes management
  - `hooks/use-reminders.ts` — reminders + expo-notifications

### API Routes (in `artifacts/api-server`)
- `POST /api/mo/chat` — text chat with conversation history support, function calling
- `POST /api/mo/speak` — TTS via ElevenLabs, returns audio/mpeg
- `POST /api/mo/voice` — classic pipeline: base64 audio → Whisper → GPT+tools → ElevenLabs → JSON response
- `WS  /api/mo/realtime` — **new** realtime pipeline: WebSocket; receives `{type:"voice", audio:base64m4a, ...context}`, responds with `{type:"audio", data:base64wav}` + tool result events; proxies to OpenAI Realtime API (`gpt-4o-realtime-preview-2024-12-17`, voice `shimmer`)
- Route files: `artifacts/api-server/src/routes/mo.ts`, `artifacts/api-server/src/routes/realtime.ts`
- Server: `artifacts/api-server/src/index.ts` — creates `http.Server` + `WebSocketServer` (ws package) on same port
- Services:
  - `src/services/weather.ts` — weather via wttr.in (no API key)
  - `src/services/search.ts` — web search via Serper.dev (SERPER_API_KEY) or DuckDuckGo (free fallback)

### OpenAI Function Calling Tools
The voice/chat pipeline uses GPT-4o-mini function calling to support:
- `get_weather(location)` — wttr.in, no API key
- `get_datetime(timezone)` — server-side JS Date, no API key
- `web_search(query)` — Serper.dev or DuckDuckGo
- `set_reminder(title, content, datetime)` — parsed by GPT, scheduled by client
- `save_note(content)` — captured by GPT, saved by client to AsyncStorage

### Required Secrets
- `OPENAI_API_KEY` — OpenAI API key (Whisper + GPT-4o-mini)
- `ELEVENLABS_API_KEY` — ElevenLabs API key
- `ELEVENLABS_VOICE_ID` — ElevenLabs voice ID
- `SERPER_API_KEY` *(optional)* — Serper.dev for Google-quality web search. Without it, falls back to DuckDuckGo + GPT knowledge.

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── mo/                 # React+Vite web app
│   ├── mo-app/             # Expo React Native app
│   │   ├── app/            # Expo Router screens
│   │   │   ├── (tabs)/     # Tab group (single tab, no tab bar)
│   │   │   ├── settings.tsx
│   │   │   └── notes.tsx
│   │   ├── context/        # React contexts (AppContext)
│   │   ├── hooks/          # Custom hooks
│   │   ├── components/     # Reusable UI components
│   │   └── constants/      # Colors, etc.
│   └── api-server/         # Express API server
│       └── src/
│           ├── routes/     # mo.ts — all Mo routes
│           └── services/   # weather.ts, search.ts
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/
└── pnpm-workspace.yaml
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck`
- **`emitDeclarationOnly`** — only `.d.ts` files emitted; bundling by esbuild/vite/metro
- **Project references** — A depends on B → A's tsconfig must list B in references

## Root Scripts

- `pnpm run build` — typecheck, then recursively build all packages
- `pnpm run typecheck` — `tsc --build --emitDeclarationOnly`

## Packages

### `artifacts/api-server` (`@workspace/api-server`)
Express 5 API server. All Mo routes in `src/routes/mo.ts`.
- `pnpm --filter @workspace/api-server run dev`
- `pnpm --filter @workspace/api-server run build`

### `lib/api-spec` (`@workspace/api-spec`)
OpenAPI 3.1 spec (`openapi.yaml`) + Orval config. Run codegen:
```
pnpm --filter @workspace/api-spec run codegen
```

### `lib/db` (`@workspace/db`)
Drizzle ORM + PostgreSQL. In development: `pnpm --filter @workspace/db run push`.
