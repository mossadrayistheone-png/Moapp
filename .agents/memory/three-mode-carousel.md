---
name: Three-mode carousel architecture
description: How the Daily/Executive/Luxury mode system is structured in the mo-app.
---

# Three-mode carousel

## Page layout
- Index 0: Executive (swipe left from Daily)
- Index 1: Daily (default launch page)
- Index 2: Luxury (swipe right from Daily)
- Carousel is a horizontal `Animated.ScrollView` with `pagingEnabled`
- `useLayoutEffect` scrolls to index 1 (Daily) on mount with no animation

## File locations
- `app/(tabs)/index.tsx` — carousel container, holds single `useVoice` instance
- `components/modes/DailyScreen.tsx` — bright blue, rounded cards
- `components/modes/ExecutiveScreen.tsx` — dark graphite, glassmorphism
- `components/modes/LuxuryScreen.tsx` — black, gold, Cormorant Garamond serif
- `components/PageIndicator.tsx` — 3-dot animated indicator, silver/blue/gold per mode
- `constants/themes.ts` — DailyTheme / ExecutiveTheme / LuxuryTheme objects

## AI personality mapping
- Daily → `AssistantMode = "daily"` (friendly, organised everyday assistant)
- Executive → `AssistantMode = "executive"` (professional, strategic)
- Luxury → `AssistantMode = "luxury"` (private concierge, elegance)
- Mode prompts live in `artifacts/api-server/src/routes/mo.ts` → `MODE_PROMPTS`

## State sharing
- Single `useVoice` in index.tsx; voice state passed as props to each screen
- `useApp()` called directly inside each screen for tasks/memories/conversations
- `setMode()` called in `useEffect` when `activePage` changes

## StatusBar
- Daily (page 1): `style="dark"` (light background needs dark icons)
- Executive/Luxury (pages 0, 2): `style="light"`

## Subscription locking
- Architecture supports future gating: wrap screen components in subscription check before rendering
- Each screen is independent; can show "upgrade" overlay without changing the carousel

**Why:** The user requested three completely distinct product experiences with horizontal swipe navigation, all sharing one AI brain (single voice instance + shared AppContext).
