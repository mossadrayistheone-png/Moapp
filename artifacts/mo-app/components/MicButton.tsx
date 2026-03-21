import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import Colors from "@/constants/colors";
import type { AssistantState } from "@/hooks/use-voice";

interface MicButtonProps {
  state: AssistantState;
  onPress: () => void;
}

export function MicButton({ state, onPress }: MicButtonProps) {
  const isListening = state === "listening";
  const isThinking = state === "thinking";
  const isSpeaking = state === "speaking";
  const isIdle = state === "idle" || state === "error";

  // Breathing scale for idle
  const breathScale = useRef(new Animated.Value(1)).current;
  // Gold border opacity for thinking
  const thinkOpacity = useRef(new Animated.Value(0)).current;
  // Ring scale + opacity for listening
  const ring1Scale = useRef(new Animated.Value(1)).current;
  const ring1Opacity = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(1)).current;
  const ring2Opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    breathScale.stopAnimation();
    if (isIdle) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breathScale, { toValue: 1.04, duration: 2500, useNativeDriver: true }),
          Animated.timing(breathScale, { toValue: 1, duration: 2500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      Animated.timing(breathScale, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    }
  }, [isIdle]);

  useEffect(() => {
    thinkOpacity.stopAnimation();
    if (isThinking) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(thinkOpacity, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(thinkOpacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      Animated.timing(thinkOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isThinking]);

  useEffect(() => {
    ring1Scale.stopAnimation();
    ring1Opacity.stopAnimation();
    ring2Scale.stopAnimation();
    ring2Opacity.stopAnimation();

    if (isListening) {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ring1Scale, { toValue: 2.2, duration: 1800, useNativeDriver: true }),
            Animated.timing(ring1Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(ring1Opacity, { toValue: 0.6, duration: 200, useNativeDriver: true }),
            Animated.timing(ring1Opacity, { toValue: 0, duration: 1600, useNativeDriver: true }),
          ]),
        ])
      ).start();

      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.delay(900),
            Animated.timing(ring2Scale, { toValue: 2.5, duration: 1800, useNativeDriver: true }),
            Animated.timing(ring2Scale, { toValue: 1, duration: 0, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.delay(900),
            Animated.timing(ring2Opacity, { toValue: 0.4, duration: 200, useNativeDriver: true }),
            Animated.timing(ring2Opacity, { toValue: 0, duration: 1600, useNativeDriver: true }),
          ]),
        ])
      ).start();
    } else {
      ring1Scale.setValue(1);
      ring1Opacity.setValue(0);
      ring2Scale.setValue(1);
      ring2Opacity.setValue(0);
    }
  }, [isListening]);

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const buttonColor = isListening
    ? "rgba(201,168,76,0.15)"
    : isThinking
    ? "#111111"
    : isSpeaking
    ? "#111111"
    : "#111111";

  const borderColor = isListening
    ? Colors.gold
    : "rgba(255,255,255,0.08)";

  return (
    <View style={styles.container}>
      {/* Listening rings */}
      <Animated.View
        style={[
          styles.ring,
          {
            transform: [{ scale: ring1Scale }],
            opacity: ring1Opacity,
            borderColor: Colors.gold,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            transform: [{ scale: ring2Scale }],
            opacity: ring2Opacity,
            borderColor: Colors.gold,
          },
        ]}
      />

      {/* Thinking border */}
      <Animated.View
        style={[
          styles.thinkBorder,
          { opacity: thinkOpacity },
        ]}
      />

      {/* Main button */}
      <Animated.View style={{ transform: [{ scale: breathScale }] }}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: buttonColor,
              borderColor,
              opacity: pressed ? 0.85 : 1,
              transform: [{ scale: pressed ? 0.95 : 1 }],
            },
          ]}
        >
          {isThinking ? (
            <ThinkingDots />
          ) : (
            <Feather
              name="mic"
              size={28}
              color={isListening ? Colors.gold : isSpeaking ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)"}
            />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ThinkingDots() {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animate = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      ).start();

    animate(dot1, 0);
    animate(dot2, 300);
    animate(dot3, 600);
  }, []);

  return (
    <View style={styles.dotsContainer}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.dot, { opacity: dot }]}
        />
      ))}
    </View>
  );
}

const BUTTON_SIZE = 88;

const styles = StyleSheet.create({
  container: {
    width: BUTTON_SIZE + 60,
    height: BUTTON_SIZE + 60,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 1,
  },
  thinkBorder: {
    position: "absolute",
    width: BUTTON_SIZE + 2,
    height: BUTTON_SIZE + 2,
    borderRadius: (BUTTON_SIZE + 2) / 2,
    borderWidth: 1.5,
    borderColor: Colors.gold,
  },
  button: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsContainer: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.gold,
  },
});
