import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
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
import { MemoryCategorySection } from "@/components/MemoryCard";
import Colors from "@/constants/colors";
import { useApp, type MemoryCategory } from "@/context/AppContext";
import { useNotes } from "@/hooks/use-notes";
import { useReminders } from "@/hooks/use-reminders";

type Tab = "notes" | "reminders" | "memory";

const CATEGORY_ORDER: MemoryCategory[] = ["personal", "preferences", "schedule", "goals"];

export default function NotesScreen() {
  const insets = useSafeAreaInsets();
  const { notes, deleteNote } = useNotes();
  const { reminders, deleteReminder, markCompleted } = useReminders();
  const { memories, deleteMemoryById } = useApp();
  const [activeTab, setActiveTab] = useState<Tab>("notes");

  const handleTabChange = (t: Tab) => {
    Haptics.selectionAsync();
    setActiveTab(t);
  };

  // Group memories by category in a fixed display order
  const memoriesByCategory = useMemo(() => {
    return CATEGORY_ORDER.reduce<Record<MemoryCategory, typeof memories>>(
      (acc, cat) => {
        acc[cat] = memories.filter((m) => m.category === cat);
        return acc;
      },
      { personal: [], preferences: [], schedule: [], goals: [] }
    );
  }, [memories]);

  const TABS: { key: Tab; icon: string; label: string; count?: number }[] = [
    {
      key: "notes",
      icon: "file-text",
      label: "Notes",
      count: notes.length > 0 ? notes.length : undefined,
    },
    {
      key: "reminders",
      icon: "bell",
      label: "Reminders",
      count:
        reminders.filter((r) => !r.completed).length > 0
          ? reminders.filter((r) => !r.completed).length
          : undefined,
    },
    {
      key: "memory",
      icon: "cpu",
      label: "Memory",
      count: memories.length > 0 ? memories.length : undefined,
    },
  ];

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color={Colors.gold} />
        </Pressable>
        <Text style={styles.title}>Captured</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab switcher */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {TABS.map(({ key, icon, label, count }) => (
          <Pressable
            key={key}
            onPress={() => handleTabChange(key)}
            style={[styles.tab, activeTab === key && styles.tabActive]}
          >
            <Feather
              name={icon as any}
              size={13}
              color={activeTab === key ? Colors.gold : Colors.mutedWhite}
            />
            <Text style={[styles.tabText, activeTab === key && styles.tabTextActive]}>
              {label}
              {count != null ? ` (${count})` : ""}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Notes ── */}
        {activeTab === "notes" && (
          notes.length === 0 ? (
            <EmptyState
              icon="mic"
              title="No notes yet"
              subtitle={'Say "take a note" or "write this down" and Mo will capture it instantly.'}
            />
          ) : (
            notes.map((note) => (
              <NoteCard key={note.id} note={note} onDelete={deleteNote} />
            ))
          )
        )}

        {/* ── Reminders ── */}
        {activeTab === "reminders" && (
          reminders.length === 0 ? (
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
          )
        )}

        {/* ── Memory ── */}
        {activeTab === "memory" && (
          memories.length === 0 ? (
            <MemoryEmptyState />
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const items = memoriesByCategory[cat];
              if (!items.length) return null;
              return (
                <MemoryCategorySection
                  key={cat}
                  category={cat}
                  items={items}
                  onDelete={deleteMemoryById}
                />
              );
            })
          )
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

function MemoryEmptyState() {
  return (
    <View style={empty.container}>
      <View style={empty.iconBox}>
        <Feather name="cpu" size={24} color={Colors.gold} />
      </View>
      <Text style={empty.title}>Nothing remembered yet</Text>
      <Text style={empty.subtitle}>
        Tell Mo things to keep in mind and it will remember them across conversations.
      </Text>
      <View style={empty.examples}>
        {[
          '"Remember that I wake up at 7 AM"',
          '"Remember that I prefer short responses"',
          '"Remember my goal is to launch by Q1"',
          '"What do you remember about me?"',
          '"Forget that I wake up at 7 AM"',
        ].map((ex) => (
          <View key={ex} style={empty.exampleRow}>
            <Feather name="mic" size={10} color={Colors.gold} style={{ opacity: 0.6 }} />
            <Text style={empty.exampleText}>{ex}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const empty = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingTop: 48,
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
  examples: {
    marginTop: 16,
    gap: 8,
    width: "100%",
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  exampleText: {
    fontFamily: "DMSans_300Light",
    fontSize: 12,
    color: "rgba(201,168,76,0.55)",
    fontStyle: "italic",
    lineHeight: 18,
    flex: 1,
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
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 10,
    flexDirection: "row",
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
