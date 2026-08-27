/**
 * ListeningPulse — three staggered pulsing dots shown on iOS and Android
 * while voiceState is "listening" but the live transcript hasn't arrived yet
 * (the first ~1.2 s before the first ADTS partial upload completes).
 *
 * Props:
 *   color — dot fill color (should match the mode's accent)
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

interface ListeningPulseProps {
  color: string;
}

const DOT_SIZE = 6;
const DURATION = 600;
const STAGGER = 180;

function PulseDot({ color, delay }: { color: string; delay: number }) {
  const opacity = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, {
          toValue: 1,
          duration: DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.25,
          duration: DURATION,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, delay]);

  return (
    <Animated.View
      style={[
        s.dot,
        { backgroundColor: color, opacity },
      ]}
    />
  );
}

export function ListeningPulse({ color }: ListeningPulseProps) {
  return (
    <View style={s.row}>
      <PulseDot color={color} delay={0} />
      <PulseDot color={color} delay={STAGGER} />
      <PulseDot color={color} delay={STAGGER * 2} />
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 2,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
