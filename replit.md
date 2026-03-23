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

### `artifacts/mo` (`@workspace/mo`) — Mo: AI Voice Assistant (Web)
- React + Vite web app, served at `/`
- Full voice flow: browser Web Speech API → OpenAI GPT-4o-mini → ElevenLabs TTS
- Three personality modes: Executive, Creative, Motivational
- Black and gold luxury design, background video
- Key files: `src/pages/Home.tsx`, `src/components/MicButton.tsx`, `src/hooks/use-voice-assistant.ts`

### `artifacts/mo-app` (`@workspace/mo-app`) — Mo: AI Voice Assistant (Native)
- Expo React Native app, scanned via Expo Go QR code
- **APK v9** (versionCode 9) built via EAS on 2026-03-23; EAS Build ID: `51b5ed68-748e-4804-8ed7-e1cdc767a86b`
  - Builder image: `ubuntu-24.04-jdk-17-ndk-r27b` (JDK 17 required by Gradle 8.14.3 + AGP 8.x)
  - APK file: `/home/runner/workspace/mo-app-v9.apk` (94 MB)
  - Download symlinks: `artifacts/mo/public/mo-app-v9.apk` and `artifacts/api-server/public/mo-app-v9.apk`
  - EAS project ID: `1c83b5bc-7a55-49ff-91e4-9a6c5c1984be`, slug: `moexec`
  - Fix: Hardcoded `EXPO_PUBLIC_DOMAIN` fallback in `app/(tabs)/index.tsx` so background video URL is always valid
  - Keystore: debug keystore (`androiddebugkey`, password `android`) — used for both debug and release builds per build.gradle
- **APK v8** (versionCode 8) built via EAS on 2026-03-22; EAS Build ID: `95a5feb4-2a2d-49d3-ab27-ba4ffab7fc83`
  - APK file: `/home/runner/workspace/mo-app-v8.apk` (94 MB) — broken video (EXPO_PUBLIC_DOMAIN not baked in)
- Full voice pipeline: expo-av recording → base64 → Whisper transcription → GPT-4o-mini → ElevenLabs TTS → base64 MP3 → expo-av playback
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
  - `hooks/use-voice.ts` — voice pipeline hook
  - `hooks/use-notes.ts` — notes management
  - `hooks/use-reminders.ts` — reminders + expo-notifications

### API Routes (in `artifacts/api-server`)
- `POST /api/mo/chat` — text chat with conversation history support, function calling
- `POST /api/mo/speak` — TTS via ElevenLabs, returns audio/mpeg
- `POST /api/mo/voice` — full pipeline: base64 audio → Whisper → GPT+tools → ElevenLabs → JSON response
- Route file: `artifacts/api-server/src/routes/mo.ts`
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
