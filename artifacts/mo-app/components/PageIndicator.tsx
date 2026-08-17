import React from "react";
import { Animated, StyleSheet, View } from "react-native";

interface PageIndicatorProps {
  scrollX: Animated.Value;
  screenWidth: number;
}

// Page order: 0 = Executive, 1 = Daily, 2 = Luxury
const DOT_COLORS = ["#8B96CC", "#3B7BF8", "#C9A84C"];

export function PageIndicator({ scrollX, screenWidth }: PageIndicatorProps) {
  return (
    <View style={styles.row}>
      {DOT_COLORS.map((color, i) => {
        const inputRange = [
          (i - 1) * screenWidth,
          i * screenWidth,
          (i + 1) * screenWidth,
        ];

        const scale = scrollX.interpolate({
          inputRange,
          outputRange: [0.8, 1.5, 0.8],
          extrapolate: "clamp",
        });

        const opacity = scrollX.interpolate({
          inputRange,
          outputRange: [0.28, 1, 0.28],
          extrapolate: "clamp",
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: color,
                transform: [{ scale }],
                opacity,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
