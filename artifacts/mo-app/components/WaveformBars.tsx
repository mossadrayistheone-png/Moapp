import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";

const BAR_COUNT = 5;
const BAR_HEIGHTS = [12, 20, 28, 20, 12];
const DELAYS = [0, 150, 80, 220, 100];

export function WaveformBars({ active }: { active: boolean }) {
  const animations = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.3))
  ).current;

  useEffect(() => {
    if (active) {
      const loops = animations.map((anim, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(DELAYS[i]),
            Animated.timing(anim, {
              toValue: 1,
              duration: 400 + i * 60,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.2,
              duration: 400 + i * 60,
              useNativeDriver: true,
            }),
          ])
        )
      );
      loops.forEach((l) => l.start());
      return () => loops.forEach((l) => l.stop());
    } else {
      animations.forEach((a) =>
        Animated.timing(a, {
          toValue: 0.3,
          duration: 300,
          useNativeDriver: true,
        }).start()
      );
    }
  }, [active]);

  return (
    <View style={styles.container}>
      {animations.map((anim, i) => (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              height: BAR_HEIGHTS[i],
              opacity: anim,
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
    backgroundColor: Colors.gold,
  },
});
