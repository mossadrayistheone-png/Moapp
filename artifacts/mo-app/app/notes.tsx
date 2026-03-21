import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NoteCard } from "@/components/NoteCard";
import { ReminderItem } from "@/components/ReminderItem";
import Colors from "@/constants/colors";
import { useNotes } from "@/hooks/use-notes";
import { useReminders } from "@/hooks/use-reminders";

type Tab = "notes" | "reminders";

export default function NotesScreen() {
  const insets = useSafeAreaInsets();
  const { notes, deleteNote } = useNotes();
  const { reminders, deleteReminder, markCompleted } = useReminders();
  const [activeTab, setActiveTab] = useState<Tab>("notes");

  const handleTabChange = (t: Tab) => {
    Haptics.selectionAsync();
    setActiveTab(t);
  };

  return (
    <View style={styles.root}>
      {/* Header */}
      <View
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color={Colors.gold} />
        </Pressable>
        <Text style={styles.title}>Captured</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab switcher */}
      <View style={styles.tabRow}>
        {(["notes", "reminders"] as Tab[]).map((tab) => (
          <Pressable
            key={tab}
            onPress={() => handleTabChange(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Feather
              name={tab === "notes" ? "file-text" : "bell"}
              size={14}
              color={activeTab === tab ? Colors.gold : Colors.mutedWhite}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "notes" ? "Notes" : "Reminders"}
              {tab === "notes" && notes.length > 0
                ? ` (${notes.length})`
                : ""}
              {tab === "reminders" && reminders.filter((r) => !r.completed).length > 0
                ? ` (${reminders.filter((r) => !r.completed).length})`
                : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === "notes" ? (
          notes.length === 0 ? (
            <EmptyState
              icon="mic"
              title="No notes yet"
              subtitle={'Say "take a note" and Mo will capture it instantly.'}
            />
          ) : (
            notes.map((note) => (
              <NoteCard key={note.id} note={note} onDelete={deleteNote} />
            ))
          )
        ) : (
          <>
            {reminders.length === 0 ? (
              <EmptyState
                icon="bell"
                title="No reminders yet"
                subtitle={'Say "remind me to..." and Mo will schedule it for you.'}
              />
            ) : (
              reminders.map((reminder) => (
                <ReminderItem
                  key={reminder.id}
                  reminder={reminder}
                  onDelete={deleteReminder}
                  onComplete={markCompleted}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <View style={empty.container}>
      <View style={empty.iconBox}>
        <Feather name={icon as any} size={24} color={Colors.gold} />
      </View>
      <Text style={empty.title}>{title}</Text>
      <Text style={empty.subtitle}>{subtitle}</Text>
    </View>
  );
}

const empty = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
    paddingHorizontal: 32,
  },
  iconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.25)",
    backgroundColor: "rgba(201,168,76,0.06)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 22,
    color: Colors.white,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.mutedWhite,
    textAlign: "center",
    lineHeight: 20,
    fontStyle: "italic",
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 22,
    color: Colors.gold,
    letterSpacing: 1,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  tabActive: {
    borderColor: Colors.gold,
    backgroundColor: "rgba(201,168,76,0.08)",
  },
  tabText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.mutedWhite,
  },
  tabTextActive: {
    color: Colors.gold,
  },
  scroll: {
    padding: 20,
    paddingTop: 16,
  },
});
