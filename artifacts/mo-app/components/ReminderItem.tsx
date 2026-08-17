import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { UtilityTheme } from "@/constants/themes";
import type { Reminder } from "@/hooks/use-reminders";

// ── Time formatting ───────────────────────────────────────────────────────────

function formatAbsoluteDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function formatCountdown(iso: string): string | null {
  try {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return null;

    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (mins < 60) return `In ${mins} ${mins === 1 ? "minute" : "minutes"}`;
    if (hours < 24) return `In ${hours} ${hours === 1 ? "hour" : "hours"}`;
    if (days === 1) return "Tomorrow";
    if (days < 7) return `In ${days} days`;
    return null;
  } catch {
    return null;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReminderItem({
  reminder,
  onDelete,
  onComplete,
}: {
  reminder: Reminder;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const isPast = new Date(reminder.datetime) < new Date();
  const countdown = formatCountdown(reminder.datetime);
  const isOverdue = isPast && !reminder.completed;

  const handleComplete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onComplete(reminder.id));
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 60, useNativeDriver: true }),
    ]).start(() => onDelete(reminder.id));
  };

  return (
    <Animated.View
      style={[
        styles.card,
        isOverdue && styles.cardOverdue,
        reminder.completed && styles.cardCompleted,
        { transform: [{ scale }] },
      ]}
    >
      {/* Left accent bar */}
      <View
        style={[
          styles.accentBar,
          isOverdue
            ? { backgroundColor: "#E87C7C" }
            : reminder.completed
            ? { backgroundColor: "rgba(255,255,255,0.1)" }
            : { backgroundColor: Colors.gold },
        ]}
      />

      {/* Check button */}
      <Pressable
        onPress={handleComplete}
        hitSlop={8}
        style={({ pressed }) => [styles.check, reminder.completed && styles.checkDone, { opacity: pressed ? 0.6 : 1 }]}
      >
        {reminder.completed && <Feather name="check" size={10} color={Colors.black} />}
      </Pressable>

      {/* Body */}
      <View style={styles.body}>
        <Text
          style={[styles.title, reminder.completed && styles.titleDone]}
          numberOfLines={2}
        >
          {reminder.title}
        </Text>

        <View style={styles.timeBlock}>
          <View style={styles.timeRow}>
            <Feather
              name="clock"
              size={10}
              color={isOverdue ? "#E87C7C" : Colors.mutedWhite}
            />
            <Text style={[styles.timeText, isOverdue && styles.timeOverdue]}>
              {formatAbsoluteDate(reminder.datetime)}
            </Text>
          </View>
          {countdown && !reminder.completed && (
            <View style={styles.countdownPill}>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
          )}
          {isOverdue && (
            <View style={[styles.countdownPill, styles.overduePill]}>
              <Text style={[styles.countdownText, styles.overdueText]}>Overdue</Text>
            </View>
          )}
        </View>

        {reminder.content !== reminder.title && (
          <Text style={styles.content} numberOfLines={2}>
            {reminder.content}
          </Text>
        )}
      </View>

      {/* Delete */}
      <Pressable
        onPress={handleDelete}
        hitSlop={12}
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.4 : 0.5 }]}
      >
        <Feather name="x" size={14} color={Colors.mutedWhite} />
      </Pressable>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UtilityTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UtilityTheme.cardBorder,
    paddingVertical: 13,
    paddingRight: 14,
    paddingLeft: 0,
    gap: 12,
    marginBottom: 8,
    overflow: "hidden",
  },
  cardOverdue: {
    borderColor: "rgba(232,124,124,0.2)",
    backgroundColor: "rgba(232,124,124,0.04)",
  },
  cardCompleted: {
    opacity: 0.4,
    borderColor: UtilityTheme.divider,
  },
  accentBar: {
    width: 3,
    alignSelf: "stretch",
    borderRadius: 2,
    marginLeft: 0,
    flexShrink: 0,
    marginRight: 2,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(201,168,76,0.4)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkDone: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  body: {
    flex: 1,
    gap: 5,
  },
  title: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.white,
    lineHeight: 19,
  },
  titleDone: {
    textDecorationLine: "line-through",
    color: Colors.mutedWhite,
  },
  timeBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  timeText: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
  },
  timeOverdue: { color: "#E87C7C" },
  countdownPill: {
    backgroundColor: "rgba(201,168,76,0.12)",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  countdownText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 10,
    color: Colors.gold,
  },
  overduePill: { backgroundColor: "rgba(232,124,124,0.12)" },
  overdueText: { color: "#E87C7C" },
  content: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    lineHeight: 17,
    fontStyle: "italic",
  },
  deleteBtn: { padding: 4 },
});
