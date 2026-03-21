import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import type { Reminder } from "@/hooks/use-reminders";

function formatReminderDate(iso: string): string {
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

export function ReminderItem({
  reminder,
  onDelete,
  onComplete,
}: {
  reminder: Reminder;
  onDelete: (id: string) => void;
  onComplete: (id: string) => void;
}) {
  const isPast = new Date(reminder.datetime) < new Date();

  return (
    <View style={[styles.card, reminder.completed && styles.cardCompleted]}>
      <View style={styles.left}>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            onComplete(reminder.id);
          }}
          hitSlop={8}
        >
          <View
            style={[
              styles.check,
              reminder.completed && styles.checkDone,
            ]}
          >
            {reminder.completed && (
              <Feather name="check" size={10} color={Colors.black} />
            )}
          </View>
        </Pressable>
      </View>

      <View style={styles.body}>
        <Text
          style={[
            styles.title,
            reminder.completed && styles.titleDone,
          ]}
          numberOfLines={1}
        >
          {reminder.title}
        </Text>
        <View style={styles.timeRow}>
          <Feather
            name="clock"
            size={10}
            color={isPast && !reminder.completed ? "#e05252" : Colors.mutedWhite}
          />
          <Text
            style={[
              styles.time,
              isPast && !reminder.completed && styles.timeOverdue,
            ]}
          >
            {formatReminderDate(reminder.datetime)}
          </Text>
        </View>
        {reminder.content !== reminder.title && (
          <Text style={styles.content} numberOfLines={2}>
            {reminder.content}
          </Text>
        )}
      </View>

      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onDelete(reminder.id);
        }}
        hitSlop={10}
        style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.7 })}
      >
        <Feather name="x" size={16} color={Colors.mutedWhite} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 14,
    gap: 12,
    marginBottom: 10,
  },
  cardCompleted: {
    opacity: 0.45,
  },
  left: {
    paddingTop: 2,
  },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  checkDone: {
    backgroundColor: Colors.gold,
    borderColor: Colors.gold,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontFamily: "DMSans_500Medium",
    fontSize: 14,
    color: Colors.white,
  },
  titleDone: {
    textDecorationLine: "line-through",
    color: Colors.mutedWhite,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  time: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
  },
  timeOverdue: {
    color: "#e05252",
  },
  content: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "rgba(255,255,255,0.45)",
    lineHeight: 18,
  },
});
