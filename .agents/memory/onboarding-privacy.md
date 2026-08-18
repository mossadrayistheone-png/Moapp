---
name: Onboarding and Privacy Policy
description: How first-launch onboarding works and where the privacy policy is served from
---

## Onboarding

- Component lives at `artifacts/mo-app/components/OnboardingScreen.tsx` (NOT `app/onboarding.tsx` — Expo Router would register it as a route and it would conflict).
- `_layout.tsx` checks `AsyncStorage.getItem("@mo/onboarding_complete")` on mount. If null → `showOnboarding = true`, rendered as `StyleSheet.absoluteFillObject` overlay on top of the Stack.
- On complete, saves `@mo/onboarding_complete = "1"` and optionally `@mo/user_name`.
- Steps: Welcome → Modes → Microphone → Personalize → Ready.
- Microphone permission: use `requestRecordingPermissionsAsync()` from `expo-audio` (top-level import). The `AudioRecorder` object does NOT have a `requestPermissionsAsync` method.

**Why:** Keeping the component out of `app/` prevents Expo Router from treating it as a navigable route. An AsyncStorage flag is simpler than navigation-based routing for a one-time flow.

## Privacy Policy

- Served as static HTML from `artifacts/api-server/public/privacy-policy.html`.
- URL pattern: `https://${process.env.EXPO_PUBLIC_DOMAIN}/privacy-policy.html`
- Settings screen opens it via `Linking.openURL()` in the Privacy section.
- The api-server already mounts `express.static(path.resolve('public'))` at root, so no additional route needed.
