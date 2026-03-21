import { Feather } from "@expo/vector-icons";
import { ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MicButton } from "@/components/MicButton";
import { WaveformBars } from "@/components/WaveformBars";
import Colors from "@/constants/colors";
import { type AssistantMode, useVoice } from "@/hooks/use-voice";

const MODES: { key: AssistantMode; label: string }[] = [
  { key: "executive", label: "Executive" },
  { key: "creative", label: "Creative" },
  { key: "motivational", label: "Motivational" },
];

const VIDEO_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}/background.mp4`;

function StatusLabel({ state }: { state: string }) {
  const dot1 = useRef(new Animated.Value(1)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (state === "listening" || state === "thinking") {
      const animate = (d: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(d, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          ])
        ).start();
      animate(dot1, 0);
      animate(dot2, 250);
      animate(dot3, 500);
    } else {
      dot1.stopAnimation();
      dot2.stopAnimation();
      dot3.stopAnimation();
      dot1.setValue(1);
      dot2.setValue(1);
      dot3.setValue(1);
    }
  }, [state]);

  const baseLabel =
    state === "idle"
      ? "Tap to speak"
      : state === "listening"
      ? "Listening"
      : state === "thinking"
      ? "Processing"
      : state === "speaking"
      ? "Tap to stop"
      : "Something went wrong";

  const showDots = state === "listening" || state === "thinking";

  return (
    <View style={styles.statusRow}>
      <Text style={styles.statusText}>{baseLabel}</Text>
      {showDots && (
        <View style={styles.dotRow}>
          {[dot1, dot2, dot3].map((d, i) => (
            <Animated.Text key={i} style={[styles.statusDot, { opacity: d }]}>
              ·
            </Animated.Text>
          ))}
        </View>
      )}
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { state, mode, setMode, transcript, reply, errorMessage, toggle } =
    useVoice();

  const videoRef = useRef<Video>(null);

  // Text fade animations
  const transcriptOpacity = useRef(new Animated.Value(0)).current;
  const replyOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (transcript) {
      Animated.timing(transcriptOpacity, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    } else {
      transcriptOpacity.setValue(0);
    }
  }, [transcript]);

  useEffect(() => {
    if (reply) {
      replyOpacity.setValue(0);
      Animated.timing(replyOpacity, {
        toValue: 1,
        duration: 700,
        delay: 200,
        useNativeDriver: true,
      }).start();
    } else {
      replyOpacity.setValue(0);
    }
  }, [reply]);

  const handleModeChange = (m: AssistantMode) => {
    if (m === mode) return;
    Haptics.selectionAsync();
    setMode(m);
  };

  return (
    <View style={styles.root}>
      {/* Background video */}
      <Video
        ref={videoRef}
        source={{ uri: VIDEO_URL }}
        style={StyleSheet.absoluteFillObject}
        resizeMode={ResizeMode.COVER}
        isLooping
        isMuted
        shouldPlay
        onLoad={async (status: any) => {
          if (status.durationMillis && videoRef.current) {
            const randomMs = Math.random() * status.durationMillis * 0.7;
            await videoRef.current.setPositionAsync(randomMs);
          }
        }}
      />

      {/* Cinematic scrim — heavy at bottom */}
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.15)",
          "rgba(0,0,0,0.25)",
          "rgba(0,0,0,0.55)",
          "rgba(0,0,0,0.88)",
        ]}
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Full height content container */}
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 20,
            paddingBottom: Math.max(insets.bottom, 20) + 16,
          },
        ]}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.brand}>Mo.</Text>
          <Text style={styles.tagline}>Private Intelligence</Text>
        </View>

        {/* ── Mode Switcher ── */}
        <View style={styles.modeRow}>
          {MODES.map(({ key, label }) => {
            const isActive = mode === key;
            return (
              <Pressable
                key={key}
                onPress={() => handleModeChange(key)}
                style={({ pressed }) => [
                  styles.modeButton,
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Text
                  style={[
                    styles.modeText,
                    isActive && styles.modeTextActive,
                  ]}
                >
                  {label}
                </Text>
                {isActive && <View style={styles.modeUnderline} />}
              </Pressable>
            );
          })}
        </View>

        {/* ── Centre Text Area ── */}
        <View style={styles.textArea}>
          {state === "idle" && !transcript && !reply && (
            <Text style={styles.idlePrompt}>
              Ask anything. Mo listens.
            </Text>
          )}

          {state === "error" && (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={20} color={Colors.gold} />
              <Text style={styles.errorText}>
                {errorMessage || "Something went wrong. Please try again."}
              </Text>
            </View>
          )}

          {transcript ? (
            <Animated.View
              style={[styles.transcriptBlock, { opacity: transcriptOpacity }]}
            >
              <Text style={styles.transcriptLabel}>You said</Text>
              <Text style={styles.transcriptText}>{transcript}</Text>
            </Animated.View>
          ) : null}

          {reply ? (
            <Animated.Text
              style={[styles.replyText, { opacity: replyOpacity }]}
            >
              {reply}
            </Animated.Text>
          ) : null}
        </View>

        {/* ── Bottom Controls ── */}
        <View style={styles.bottom}>
          {/* Waveform when speaking */}
          <View style={styles.waveformContainer}>
            <WaveformBars active={state === "speaking"} />
          </View>

          {/* Mic button */}
          <MicButton state={state} onPress={toggle} />

          {/* Status label */}
          <StatusLabel state={state} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 28,
  },
  brand: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 42,
    color: Colors.gold,
    letterSpacing: 3,
    lineHeight: 50,
  },
  tagline: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
    letterSpacing: 4,
    textTransform: "uppercase",
    marginTop: 2,
  },

  // Mode switcher
  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 28,
    marginBottom: 20,
  },
  modeButton: {
    alignItems: "center",
    paddingVertical: 4,
  },
  modeText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.mutedWhite,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  modeTextActive: {
    color: Colors.gold,
  },
  modeUnderline: {
    marginTop: 4,
    height: 1,
    width: "100%",
    backgroundColor: Colors.gold,
  },

  // Text area
  textArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    gap: 28,
  },
  idlePrompt: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 26,
    color: "rgba(255,255,255,0.18)",
    textAlign: "center",
    lineHeight: 36,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(201,168,76,0.08)",
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.2)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.gold,
    flex: 1,
    lineHeight: 20,
  },
  transcriptBlock: {
    gap: 6,
    alignItems: "center",
  },
  transcriptLabel: {
    fontFamily: "DMSans_300Light",
    fontSize: 10,
    color: Colors.mutedWhite,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  transcriptText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    lineHeight: 22,
    fontStyle: "italic",
  },
  replyText: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 30,
    color: Colors.offWhite,
    textAlign: "center",
    lineHeight: 42,
    paddingHorizontal: 4,
  },

  // Bottom controls
  bottom: {
    alignItems: "center",
    gap: 12,
    marginTop: 20,
  },
  waveformContainer: {
    height: 36,
    justifyContent: "center",
  },

  // Status label
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 20,
  },
  statusText: {
    fontFamily: "DMSans_300Light",
    fontSize: 12,
    color: Colors.mutedWhite,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  dotRow: {
    flexDirection: "row",
    marginLeft: 2,
  },
  statusDot: {
    fontFamily: "DMSans_400Regular",
    fontSize: 20,
    color: Colors.gold,
    lineHeight: 20,
    marginTop: -4,
  },
});
