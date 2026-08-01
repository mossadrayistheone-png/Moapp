---
name: expo-video vs expo-av Video on New Architecture
description: Why expo-av Video crashes on SDK 54 with newArchEnabled=true, and the correct replacement.
---

# expo-video vs expo-av Video (New Architecture)

## The rule
Never use `expo-av`'s `Video` component in this project. Use `expo-video`'s `VideoView` + `useVideoPlayer` instead.

**Why:** The project has `newArchEnabled=true` (Fabric/New Architecture) in both `app.json` and `android/gradle.properties`. `expo-av`'s `Video` view is built on the old architecture bridge and crashes the app 1–2 seconds after launch on Android when Fabric tries to mount it. `expo-video` was built for the New Architecture and is the official Expo replacement since SDK 52.

**How to apply:**
- Import: `import { useVideoPlayer, VideoView } from "expo-video";`
- Player: `const p = useVideoPlayer(require("..."), player => { player.loop = true; player.muted = true; });`
- Play/pause on active state: `useEffect(() => { if (isActive) p.play(); else p.pause(); }, [isActive, p]);`
- JSX: `<VideoView player={p} style={...} contentFit="cover" nativeControls={false} />`
- `allowsFullscreen` does NOT exist on `VideoViewProps` in this version — omit it.

`expo-av` is still fine for **audio** (Sound, Audio recording) — only the Video component is affected.
