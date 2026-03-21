import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import type { Note, NoteCategory } from "@/hooks/use-notes";

// ── Time formatting ───────────────────────────────────────────────────────────

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
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ── Category colors ────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  idea: "#B8956A",
  meeting: "#6A8CB8",
  personal: "#8CB86A",
  work: "#B8B86A",
  other: "#8A8A8A",
};

const CATEGORY_LABELS: Record<string, string> = {
  idea: "Idea",
  meeting: "Meeting",
  personal: "Personal",
  work: "Work",
  other: "Other",
};

// ── Component ─────────────────────────────────────────────────────────────────

export function NoteCard({
  note,
  onDelete,
}: {
  note: Note;
  onDelete: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const categoryColor = note.category ? (CATEGORY_COLORS[note.category] ?? CATEGORY_COLORS.other) : null;
  const categoryLabel = note.category ? (CATEGORY_LABELS[note.category] ?? note.category) : null;

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 100, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start(() => onDelete(note.id));
  };

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      {/* Top row: meta + delete */}
      <View style={styles.header}>
        <View style={styles.metaRow}>
          <Feather
            name={note.source === "voice" ? "mic" : "edit-2"}
            size={10}
            color={Colors.gold}
          />
          <Text style={styles.timestamp}>{formatTimestamp(note.timestamp)}</Text>
          {categoryLabel && categoryColor && (
            <View style={[styles.categoryPill, { backgroundColor: `${categoryColor}20`, borderColor: `${categoryColor}40` }]}>
              <Text style={[styles.categoryText, { color: categoryColor }]}>{categoryLabel}</Text>
            </View>
          )}
        </View>
        <Pressable
          onPress={handleDelete}
          hitSlop={12}
          style={({ pressed }) => ({ opacity: pressed ? 0.4 : 0.55 })}
        >
          <Feather name="trash-2" size={13} color={Colors.mutedWhite} />
        </Pressable>
      </View>

      {/* Title (if available) */}
      {note.title && (
        <Text style={styles.title} numberOfLines={2}>
          {note.title}
        </Text>
      )}

      {/* Content body */}
      <Text
        style={[styles.content, note.title && styles.contentWithTitle]}
        numberOfLines={note.title ? 3 : 6}
      >
        {note.content}
      </Text>
    </Animated.View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 16,
    gap: 8,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  timestamp: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
    letterSpacing: 0.3,
  },
  categoryPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 17,
    color: Colors.white,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  content: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.offWhite,
    lineHeight: 21,
  },
  contentWithTitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    lineHeight: 19,
  },
});
