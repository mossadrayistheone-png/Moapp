/**
 * WaveformBars — animated audio-level indicator used in the listening state.
 *
 * Two modes:
 *  • Level-driven (native): when `level` prop is provided (0–1), each bar's
 *    opacity springs to `level × multiplier[i]`, giving real-time mic feedback.
 *  • Loop fallback (web / metering unavailable): when `level` is undefined, bars
 *    animate in a continuous looping pattern — the original behaviour.
 *
 * Uses `useNativeDriver: false` throughout so both opacity and future transforms
 * can be driven from JS without mixing driver types on the same Animated.Value.
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

const BAR_COUNT = 5;
// Max height of each bar in pixels — centre bar tallest.
const BAR_MAX_HEIGHTS = [14, 22, 30, 22, 14];
// Per-bar level multipliers — gives a natural waveform silhouette.
const MULTIPLIERS    = [0.65, 0.82, 1.0, 0.82, 0.65];
// Stagger delays for the loop animation fallback.
const LOOP_DELAYS    = [0, 150, 80, 220, 100];

export interface WaveformBarsProps {
  /** Whether the indicator should be active (visible and animated). */
  active: boolean;
  /**
   * Normalised mic level from useVoice (0–1).
   * When provided, each bar's opacity tracks this value in real time.
   * When omitted, a looping animation is used as a fallback (e.g. web).
   */
  level?: number;
  /** Accent colour for the bars. Defaults to Colors.gold. */
  color?: string;
}

export function WaveformBars({ active, level, color = Colors.gold }: WaveformBarsProps) {
  // One Animated.Value per bar, shared across both modes.
  const anims = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.15))
  ).current;

  // Track running loops so we can stop them when mode or active state changes.
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);

  const levelMode = level !== undefined;

  // ── Loop animation (fallback when level is not available) ─────────────────
  useEffect(() => {
    // Stop any existing loops before potentially starting new ones.
    loopsRef.current.forEach((l) => l.stop());
    loopsRef.current = [];

    if (active && !levelMode) {
      // Looping staggered pulse — the original WaveformBars behaviour.
      const loops = anims.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(LOOP_DELAYS[i]),
            Animated.timing(anim, {
              toValue: 1,
              duration: 400 + i * 60,
              useNativeDriver: false,
            }),
            Animated.timing(anim, {
              toValue: 0.2,
              duration: 400 + i * 60,
              useNativeDriver: false,
            }),
          ])
        )
      );
      loops.forEach((l) => l.start());
      loopsRef.current = loops;
    } else if (!active) {
      // Fade bars back to a subtle resting state.
      anims.forEach((a) =>
        Animated.timing(a, {
          toValue: 0.15,
          duration: 300,
          useNativeDriver: false,
        }).start()
      );
    }
    // When switching TO level mode while active, the loop effect stops loops
    // above and the level effect below takes over. No gap because both effects
    // run synchronously after the same dependency change.
  }, [active, levelMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Level-driven animation ────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !levelMode) return;

    const l = level ?? 0;
    anims.forEach((anim, i) => {
      // Each bar springs to its share of the current level.
      // Minimum 0.15 so bars remain subtly visible even at silence.
      const target = Math.max(0.15, Math.min(1.0, l * MULTIPLIERS[i]));
      Animated.spring(anim, {
        toValue: target,
        useNativeDriver: false,
        tension: 140,
        friction: 8,
      }).start();
    });
  }, [level, active, levelMode]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.container}>
      {anims.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: BAR_MAX_HEIGHTS[i],
              opacity: anim,
              backgroundColor: color,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
  },
  bar: {
    width: 3,
    borderRadius: 2,
  },
});
