---
name: Animated WebP backgrounds
description: How animated WebP backgrounds work in Mo app — encoding, rendering, and the active-only loading pattern.
---

## Rule
Use `expo-image` (not React Native's built-in `<Image>`) for animated WebP. Use active-only loading to prevent freeze-on-scroll.

**Why:** RN `<Image>` on Android decodes only the first frame of animated WebP (Fresco doesn't enable animation playback by default). expo-image has its own pipeline that animates correctly. expo-image also pauses ALL animated images when a ScrollView scrolls — loading animated WebP only on the active page prevents all three from freezing simultaneously.

## Encoding command
```bash
ffmpeg -y -i source.mp4 \
  -vf "fps=24,scale=540:-2" \
  -quality 80 -compression_level 3 \
  -loop 0 \          # ← REQUIRED: 0 = infinite loop; default is 1 (play once)
  output.webp
```
- **24fps, 15s** → ~9–10MB per file. Safe: Fresco buffers ~3 frames, not all 360.
- **-loop 0** is the critical flag. Without it the WebP plays once and stops.
- Verify: `node -e "const d=require('fs').readFileSync('f.webp'); const i=d.indexOf(Buffer.from('ANIM')); console.log(d.readUInt16LE(i+12));"` — must read 0.

## Active-only loading pattern (prevents freeze-on-scroll)
```tsx
<Image
  key={isActive ? "anim" : "still"}   // forces remount on tab switch
  source={isActive
    ? require("@/assets/videos/daily-bg.webp")
    : require("@/assets/images/daily-still.jpg")}
  style={StyleSheet.absoluteFillObject}
  contentFit="cover"
/>
```
- Inactive screens show a static JPEG first-frame (~25–30KB each).
- `key` swap forces expo-image to remount and restart the loop from frame 1 when the user swipes back.
- expo-image uses `contentFit` not `resizeMode`.

## File locations
- Animated WebPs: `assets/videos/daily-bg.webp`, `executive-bg.webp`, `luxury-bg.webp`
- Static stills: `assets/images/daily-still.jpg`, `executive-still.jpg`, `luxury-still.jpg`
