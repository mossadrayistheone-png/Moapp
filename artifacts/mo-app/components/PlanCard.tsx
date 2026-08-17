import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import type { DayPlan, PlanBlock } from "@/hooks/use-voice";

// ── Type → icon + color ───────────────────────────────────────────────────────

const BLOCK_CONFIG: Record<
  PlanBlock["type"],
  { icon: keyof typeof Feather.glyphMap; color: string }
> = {
  task:     { icon: "check-square", color: "#C9A84C" },
  reminder: { icon: "bell",         color: "#B87C4C" },
  focus:    { icon: "zap",          color: "#7CB8C9" },
  break:    { icon: "coffee",       color: "#8CB87C" },
  routine:  { icon: "sun",          color: "#C9C94C" },
};

const PRIORITY_COLOR: Record<NonNullable<PlanBlock["priority"]>, string> = {
  high:   "#C9A84C",
  medium: "rgba(201,168,76,0.4)",
  low:    "rgba(255,255,255,0.12)",
};

const TIMEFRAME_LABELS: Record<DayPlan["timeframe"], string> = {
  morning:  "Morning",
  afternoon: "Afternoon",
  evening:  "Evening",
  full_day: "Full Day",
};

// ── Block row ─────────────────────────────────────────────────────────────────

function BlockRow({ block, index }: { block: PlanBlock; index: number }) {
  const slideIn = useRef(new Animated.Value(24)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideIn, {
        toValue: 0,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 350,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const cfg = BLOCK_CONFIG[block.type] ?? BLOCK_CONFIG.focus;
  const priorityColor = block.priority ? PRIORITY_COLOR[block.priority] : PRIORITY_COLOR.low;

  return (
    <Animated.View
      style={[
        styles.block,
        { transform: [{ translateY: slideIn }], opacity },
      ]}
    >
      {/* Priority accent line */}
      <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: `${cfg.color}18` }]}>
        <Feather name={cfg.icon} size={13} color={cfg.color} />
      </View>

      {/* Content */}
      <View style={styles.blockContent}>
        {block.time && (
          <Text style={styles.blockTime}>{block.time}</Text>
        )}
        <Text style={styles.blockTitle} numberOfLines={2}>
          {block.title}
        </Text>
        {block.description && (
          <Text style={styles.blockDesc} numberOfLines={2}>
            {block.description}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

// ── PlanCard ──────────────────────────────────────────────────────────────────

export function PlanCard({
  plan,
  onDismiss,
}: {
  plan: DayPlan;
  onDismiss: () => void;
}) {
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleDismiss = () => {
    Haptics.selectionAsync();
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(slideUp, { toValue: 16, duration: 250, useNativeDriver: true }),
    ]).start(onDismiss);
  };

  return (
    <Animated.View
      style={[
        styles.card,
        { opacity: fadeIn, transform: [{ translateY: slideUp }] },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.timeframePill}>
            <Text style={styles.timeframeText}>
              {TIMEFRAME_LABELS[plan.timeframe] ?? plan.timeframe}
            </Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {plan.title}
          </Text>
        </View>
        <Pressable
          onPress={handleDismiss}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.7 })}
        >
          <Feather name="x" size={16} color={Colors.mutedWhite} />
        </Pressable>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Blocks */}
      <ScrollView
        style={styles.scrollArea}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {plan.blocks.map((block, i) => (
          <BlockRow key={i} block={block} index={i} />
        ))}

        {/* Footer */}
        <Text style={styles.footer}>
          {plan.blocks.length} {plan.blocks.length === 1 ? "block" : "blocks"} ·{" "}
          {new Date(plan.generatedAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </ScrollView>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: "rgba(10,10,10,0.85)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.18)",
    overflow: "hidden",
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 12,
  },
  headerLeft: { flex: 1, gap: 6 },
  timeframePill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.30)",
    backgroundColor: "rgba(201,168,76,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  timeframeText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 9,
    color: Colors.gold,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 22,
    color: Colors.white,
    lineHeight: 28,
    letterSpacing: 0.2,
  },

  divider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginHorizontal: 18,
  },

  scrollArea: {
    flex: 1,
    paddingTop: 10,
  },

  block: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingVertical: 11,
    gap: 12,
  },
  priorityBar: {
    width: 2,
    borderRadius: 1,
    minHeight: 36,
    alignSelf: "stretch",
    marginTop: 2,
  },
  iconCircle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  blockContent: { flex: 1, gap: 2 },
  blockTime: {
    fontFamily: "DMSans_300Light",
    fontSize: 10,
    color: Colors.gold,
    letterSpacing: 0.5,
    opacity: 0.8,
  },
  blockTitle: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.white,
    lineHeight: 20,
  },
  blockDesc: {
    fontFamily: "DMSans_300Light",
    fontSize: 12,
    color: "rgba(255,255,255,0.45)",
    lineHeight: 17,
    marginTop: 1,
  },

  footer: {
    fontFamily: "DMSans_300Light",
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
    letterSpacing: 0.8,
    textAlign: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
});
