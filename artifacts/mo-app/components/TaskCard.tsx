import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { UtilityTheme } from "@/constants/themes";
import type { Task } from "@/context/AppContext";

const CATEGORY_COLORS: Record<string, string> = {
  work: "#7EB8C4",
  personal: "#C9A84C",
  health: "#7EC48C",
  finance: "#A08CE8",
  other: "#888",
};

function formatDueDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const todayStr = now.toDateString();
    const dStr = d.toDateString();
    const tomorrowStr = new Date(now.getTime() + 86400_000).toDateString();

    if (dStr === todayStr) return "Today";
    if (dStr === tomorrowStr) return "Tomorrow";

    return d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
}

function isOverdue(iso: string, status: Task["status"]): boolean {
  if (status === "completed") return false;
  try {
    return new Date(iso) < new Date();
  } catch {
    return false;
  }
}

export function TaskCard({
  task,
  onComplete,
  onDelete,
}: {
  task: Task;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const isCompleted = task.status === "completed";
  const categoryColor = CATEGORY_COLORS[task.category ?? "other"] ?? CATEGORY_COLORS.other;
  const overdue = task.dueDate ? isOverdue(task.dueDate, task.status) : false;

  const handleComplete = () => {
    if (isCompleted) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onComplete(task.id));
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.94, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 60, useNativeDriver: true }),
    ]).start(() => onDelete(task.id));
  };

  return (
    <Animated.View
      style={[
        styles.card,
        isCompleted && styles.cardCompleted,
        { transform: [{ scale }] },
      ]}
    >
      {/* Check button */}
      <Pressable
        onPress={handleComplete}
        hitSlop={8}
        style={({ pressed }) => [
          styles.checkBox,
          isCompleted && styles.checkBoxDone,
          { opacity: pressed ? 0.6 : 1 },
        ]}
      >
        {isCompleted && <Feather name="check" size={11} color={Colors.black} />}
      </Pressable>

      {/* Content */}
      <View style={styles.body}>
        <Text
          style={[styles.title, isCompleted && styles.titleCompleted]}
          numberOfLines={2}
        >
          {task.title}
        </Text>
        <View style={styles.meta}>
          {task.category && (
            <View style={[styles.categoryPill, { backgroundColor: `${categoryColor}18`, borderColor: `${categoryColor}30` }]}>
              <Text style={[styles.categoryText, { color: categoryColor }]}>
                {task.category}
              </Text>
            </View>
          )}
          {task.dueDate && (
            <Text style={[styles.dueDate, overdue && styles.dueDateOverdue]}>
              {overdue && !isCompleted && (
                <Feather name="alert-circle" size={10} color="#E87C7C" />
              )}
              {" "}
              {formatDueDate(task.dueDate)}
            </Text>
          )}
          {isCompleted && task.completedAt && (
            <Text style={styles.completedAt}>
              Done {formatDueDate(new Date(task.completedAt).toISOString())}
            </Text>
          )}
        </View>
      </View>

      {/* Delete */}
      <Pressable
        onPress={handleDelete}
        hitSlop={12}
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 0.45 }]}
      >
        <Feather name="x" size={13} color={Colors.mutedWhite} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UtilityTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UtilityTheme.cardBorder,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
  },
  cardCompleted: {
    opacity: 0.45,
    borderColor: UtilityTheme.divider,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(201,168,76,0.4)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  checkBoxDone: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  body: {
    flex: 1,
    gap: 5,
  },
  title: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.white,
    lineHeight: 20,
  },
  titleCompleted: {
    textDecorationLine: "line-through",
    color: Colors.mutedWhite,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  categoryPill: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryText: {
    fontFamily: "DMSans_300Light",
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "capitalize",
  },
  dueDate: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
  },
  dueDateOverdue: {
    color: "#E87C7C",
  },
  completedAt: {
    fontFamily: "DMSans_300Light",
    fontSize: 10,
    color: "rgba(255,255,255,0.25)",
  },
  deleteBtn: {
    padding: 4,
  },
});
