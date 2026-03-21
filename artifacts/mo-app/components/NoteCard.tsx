import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import type { Note } from "@/hooks/use-notes";

function formatTimestamp(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

export function NoteCard({
  note,
  onDelete,
}: {
  note: Note;
  onDelete: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 100, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => onDelete(note.id));
  };

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      <View style={styles.header}>
        <View style={styles.meta}>
          <Feather
            name={note.source === "voice" ? "mic" : "edit-2"}
            size={11}
            color={Colors.gold}
          />
          <Text style={styles.timestamp}>{formatTimestamp(note.timestamp)}</Text>
        </View>
        <Pressable
          onPress={handleDelete}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.5 : 0.7 })}
        >
          <Feather name="trash-2" size={14} color={Colors.mutedWhite} />
        </Pressable>
      </View>
      <Text style={styles.content}>{note.content}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
    gap: 10,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  timestamp: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
    letterSpacing: 0.5,
  },
  content: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.offWhite,
    lineHeight: 22,
  },
});
