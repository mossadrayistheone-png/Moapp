import { ResizeMode, Video } from "expo-av";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Circle, Line } from "react-native-svg";

import { MicButton } from "@/components/MicButton";
import { PlanCard } from "@/components/PlanCard";
import { WaveformBars } from "@/components/WaveformBars";
import Colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import { useNotes } from "@/hooks/use-notes";
import { useReminders } from "@/hooks/use-reminders";
import { useVoice, type AssistantMode, type DayPlan, type MemoryActionPayload, type NoteActionPayload, type NotePayload, type ReminderActionPayload, type TaskActionPayload } from "@/hooks/use-voice";

// ── Header SVG icons (no icon fonts — font loading is unreliable in Expo Go) ──

function GearIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </Svg>
  );
}

function NotesIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Document outline with folded corner */}
      <Path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Folded corner crease */}
      <Path
        d="M14 2v6h6"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Text lines */}
      <Line x1="16" y1="13" x2="8" y2="13" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1="16" y1="17" x2="8" y2="17" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1="10" y1="9"  x2="8" y2="9"  stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}

function AlertCircleIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 8v4" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 16h.01" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODES: { key: AssistantMode; label: string }[] = [
  { key: "executive", label: "Executive" },
  { key: "creative", label: "Creative" },
  { key: "motivational", label: "Motivational" },
  { key: "planner", label: "Planner" },
];

// Background video is bundled into the APK as a local asset.
// No network download required — Metro packages the .mp4 alongside the JS bundle.
const BG_VIDEO = require("@/assets/videos/background.mp4");

// ── Status label with animated dots ──────────────────────────────────────────

function StatusLabel({ state }: { state: string }) {
  const dots = [
    useRef(new Animated.Value(1)).current,
    useRef(new Animated.Value(0.3)).current,
    useRef(new Animated.Value(0.3)).current,
  ];

  useEffect(() => {
    const animated = state === "listening" || state === "thinking";
    if (animated) {
      const loops = dots.map((d, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(i * 250),
            Animated.timing(d, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(d, { toValue: 0.3, duration: 350, useNativeDriver: true }),
          ])
        )
      );
      loops.forEach((l) => l.start());
      return () => loops.forEach((l) => l.stop());
    } else {
      dots.forEach((d) => d.setValue(1));
    }
  }, [state]);

  const label =
    state === "idle"
      ? "Tap to speak"
      : state === "listening"
      ? "Listening"
      : state === "thinking"
      ? "Processing"
      : state === "speaking"
      ? "Tap to stop"
      : "Try again";

  const showDots = state === "listening" || state === "thinking";

  return (
    <View style={status.row}>
      <Text style={status.text}>{label}</Text>
      {showDots && (
        <View style={status.dotRow}>
          {dots.map((d, i) => (
            <Animated.Text key={i} style={[status.dot, { opacity: d }]}>
              ·
            </Animated.Text>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [activePlan, setActivePlan] = useState<DayPlan | null>(null);

  // ── Video: bundled local asset — no network required ─────────────────────
  // background.mp4 is packaged inside the APK at build time via Metro.
  // BG_VIDEO is a require() reference resolved at bundle time.
  // ─────────────────────────────────────────────────────────────────────────

  const {
    preferences,
    conversationHistory,
    addToHistory,
    memories,
    saveMemory,
    deleteMemoryByKey,
    tasks,
    addTask,
    completeTaskByTitle,
    deleteTaskByTitle,
  } = useApp();
  const { notes, addNote, deleteNoteByKeyword } = useNotes();
  const { addReminder, deleteReminderByTitle, upcomingReminders, reminders } = useReminders();

  const voiceCallbacks = {
    onNote: useCallback(
      (note: NotePayload) =>
        addNote({ content: note.content, title: note.title, category: note.category, source: "voice" }),
      [addNote]
    ),
    onNoteAction: useCallback(
      (action: NoteActionPayload) => {
        if (action.action === "delete" && action.keyword) {
          deleteNoteByKeyword(action.keyword);
        }
      },
      [deleteNoteByKeyword]
    ),
    onReminder: useCallback(
      (params: { title: string; content: string; datetime: string }) =>
        addReminder(params),
      [addReminder]
    ),
    onMemoryAction: useCallback(
      (action: MemoryActionPayload) => {
        if (action.action === "save" && action.category && action.key && action.value) {
          saveMemory({
            category: action.category as any,
            key: action.key,
            value: action.value,
          });
        } else if (action.action === "delete" && action.key) {
          deleteMemoryByKey(action.key);
        }
      },
      [saveMemory, deleteMemoryByKey]
    ),
    onReminderAction: useCallback(
      (action: ReminderActionPayload) => {
        if ((action.action === "delete" || action.action === "dismiss") && action.title) {
          deleteReminderByTitle(action.title);
        }
      },
      [deleteReminderByTitle]
    ),
    onTaskAction: useCallback(
      (action: TaskActionPayload) => {
        if (action.action === "add" && action.title) {
          addTask({ title: action.title, dueDate: action.dueDate, category: action.category });
        } else if (action.action === "complete" && action.title) {
          completeTaskByTitle(action.title);
        } else if (action.action === "delete" && action.title) {
          deleteTaskByTitle(action.title);
        }
      },
      [addTask, completeTaskByTitle, deleteTaskByTitle]
    ),
    onPlan: useCallback(
      (plan: DayPlan) => setActivePlan(plan),
      []
    ),
    onTurnComplete: useCallback(
      (transcript: string, reply: string) => addToHistory(transcript, reply),
      [addToHistory]
    ),
  };

  const { state, mode, setMode, transcript, reply, errorMessage, toggle } =
    useVoice({
      conversationHistory,
      memories,
      tasks,
      reminders,
      notes,
      preferences: {
        name: preferences.name || undefined,
        location: preferences.location || undefined,
        timezone: preferences.timezone || undefined,
        responseLength: preferences.responseLength,
      },
      autoplay: preferences.autoplay,
      callbacks: voiceCallbacks,
    });

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

  const hasConversation = conversationHistory.length > 0;
  const memoryCount = memories.length;
  const pendingTaskCount = tasks.filter((t) => t.status === "pending").length;

  return (
    <View style={styles.root}>
      {/* Background video — bundled asset, plays instantly with no download */}
      {preferences.backgroundEnabled && (
        <Video
          ref={videoRef}
          source={BG_VIDEO}
          style={StyleSheet.absoluteFillObject}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted
          shouldPlay
        />
      )}

      {/* Scrim */}
      <LinearGradient
        colors={[
          "rgba(0,0,0,0.12)",
          "rgba(0,0,0,0.22)",
          "rgba(0,0,0,0.55)",
          "rgba(0,0,0,0.90)",
        ]}
        locations={[0, 0.3, 0.65, 1]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Content */}
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 16,
            paddingBottom: Math.max(insets.bottom, 20) + 12,
          },
        ]}
      >
        {/* ── Header row ── */}
        <View style={styles.headerRow}>
          {/* Notes / Memory button */}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/notes");
            }}
            style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <NotesIcon size={18} color={Colors.mutedWhite} />
            {/* Reminder badge */}
            {upcomingReminders.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {upcomingReminders.length > 9 ? "9+" : upcomingReminders.length}
                </Text>
              </View>
            )}
          </Pressable>

          {/* Brand */}
          <View style={styles.brand}>
            <Text style={styles.brandName}>Mo.</Text>
            <Text style={styles.brandTagline}>Executive Assistant</Text>
            {(pendingTaskCount > 0 || memoryCount > 0) && (
              <Text style={styles.memoryHint}>
                {[
                  pendingTaskCount > 0 ? `${pendingTaskCount} ${pendingTaskCount === 1 ? "task" : "tasks"}` : null,
                  memoryCount > 0 ? `${memoryCount} ${memoryCount === 1 ? "memory" : "memories"}` : null,
                ].filter(Boolean).join(" · ")}
              </Text>
            )}
          </View>

          {/* Settings button */}
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/settings");
            }}
            style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.6 : 1 }]}
          >
            <GearIcon size={18} color={Colors.mutedWhite} />
          </Pressable>
        </View>

        {/* ── Mode switcher ── */}
        <View style={styles.modeRow}>
          {MODES.map(({ key, label }) => {
            const active = mode === key;
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
                  style={[styles.modeText, active && styles.modeTextActive]}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {active && <View style={styles.modeUnderline} />}
              </Pressable>
            );
          })}
        </View>

        {/* ── Text area ── */}
        <View style={styles.textArea}>
          {/* Active plan card — takes priority over idle/transcript/reply */}
          {activePlan ? (
            <PlanCard plan={activePlan} onDismiss={() => setActivePlan(null)} />
          ) : (
            <>
              {state === "idle" && !transcript && !reply && (
                <View style={styles.idleBlock}>
                  <Text style={styles.idlePrompt}>
                    {preferences.name
                      ? `Good to hear you, ${preferences.name.split(" ")[0]}.`
                      : "Ask anything. Mo listens."}
                  </Text>
                  {hasConversation && (
                    <Text style={styles.continuityHint}>
                      Conversation continues from last session
                    </Text>
                  )}
                </View>
              )}

              {state === "error" && (
                <View style={styles.errorCard}>
                  <AlertCircleIcon size={18} color={Colors.gold} />
                  <Text style={styles.errorText} numberOfLines={3}>
                    {errorMessage || "Something went wrong. Please try again."}
                  </Text>
                </View>
              )}

              {transcript ? (
                <Animated.View
                  style={[styles.transcriptBlock, { opacity: transcriptOpacity }]}
                >
                  <Text style={styles.transcriptLabel}>You said</Text>
                  <Text style={styles.transcriptText}>"{transcript}"</Text>
                </Animated.View>
              ) : null}

              {reply ? (
                <Animated.Text style={[styles.replyText, { opacity: replyOpacity }]}>
                  {reply}
                </Animated.Text>
              ) : null}
            </>
          )}
        </View>

        {/* ── Bottom controls ── */}
        <View style={styles.bottom}>
          <View style={styles.waveformBox}>
            <WaveformBars active={state === "speaking"} />
          </View>
          <MicButton state={state} onPress={toggle} />
          <StatusLabel state={state} />
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.black },
  content: { flex: 1, paddingHorizontal: 24 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 2,
    right: 2,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  badgeText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 8,
    color: Colors.black,
  },
  brand: { alignItems: "center", gap: 1 },
  brandName: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 34,
    color: Colors.gold,
    letterSpacing: 3,
    lineHeight: 40,
  },
  brandTagline: {
    fontFamily: "DMSans_300Light",
    fontSize: 9,
    color: Colors.mutedWhite,
    letterSpacing: 3.5,
    textTransform: "uppercase",
  },
  memoryHint: {
    fontFamily: "DMSans_300Light",
    fontSize: 8,
    color: "rgba(201,168,76,0.40)",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },

  // Mode switcher
  modeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 18,
    marginBottom: 16,
  },
  modeButton: { alignItems: "center", paddingVertical: 4 },
  modeText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 11,
    color: Colors.mutedWhite,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  modeTextActive: { color: Colors.gold },
  modeUnderline: {
    marginTop: 3,
    height: 1,
    width: "100%",
    backgroundColor: Colors.gold,
  },

  // Text area
  textArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 24,
    paddingHorizontal: 8,
  },
  idleBlock: { alignItems: "center", gap: 8 },
  idlePrompt: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 24,
    color: "rgba(255,255,255,0.16)",
    textAlign: "center",
    lineHeight: 34,
  },
  continuityHint: {
    fontFamily: "DMSans_300Light",
    fontSize: 10,
    color: "rgba(201,168,76,0.35)",
    letterSpacing: 1,
    textTransform: "uppercase",
    textAlign: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(201,168,76,0.07)",
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.18)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "90%",
  },
  errorText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.gold,
    flex: 1,
    lineHeight: 20,
  },
  transcriptBlock: { alignItems: "center", gap: 6 },
  transcriptLabel: {
    fontFamily: "DMSans_300Light",
    fontSize: 9,
    color: Colors.mutedWhite,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  transcriptText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: "rgba(255,255,255,0.45)",
    textAlign: "center",
    lineHeight: 20,
    fontStyle: "italic",
  },
  replyText: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 28,
    color: Colors.offWhite,
    textAlign: "center",
    lineHeight: 40,
    paddingHorizontal: 4,
  },

  // Bottom
  bottom: { alignItems: "center", gap: 10, marginTop: 16 },
  waveformBox: { height: 36, justifyContent: "center" },
});

// Status label styles
const status = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", height: 20 },
  text: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  dotRow: { flexDirection: "row", marginLeft: 2 },
  dot: {
    fontFamily: "DMSans_400Regular",
    fontSize: 20,
    color: Colors.gold,
    lineHeight: 20,
    marginTop: -4,
  },
});
