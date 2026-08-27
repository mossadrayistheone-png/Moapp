/**
 * Root screen — Three-mode horizontal carousel
 *
 * Page order: [Executive (0)] ← [Daily (1)] → [Luxury (2)]
 * Default launch: Daily (centre, index 1)
 *
 * One useVoice + one useTextChat instance is shared across all modes.
 * When the user swipes to a different mode the AI personality updates.
 * Conversations, memory, and tasks are preserved in AppContext.
 */

import * as Haptics from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageIndicator } from "@/components/PageIndicator";
import { DailyScreen } from "@/components/modes/DailyScreen";
import { ExecutiveScreen } from "@/components/modes/ExecutiveScreen";
import { LuxuryScreen } from "@/components/modes/LuxuryScreen";
import { useApp } from "@/context/AppContext";
import { useNotes } from "@/hooks/use-notes";
import { useReminders } from "@/hooks/use-reminders";
import { guardTextSubmit, guardVoiceToggle } from "@/hooks/use-reply-masking-guard";
import { useTextChat } from "@/hooks/use-text-chat";
import {
  useVoice,
  type AssistantMode,
  type DayPlan,
  type MemoryActionPayload,
  type NoteActionPayload,
  type NotePayload,
  type ReminderActionPayload,
  type TaskActionPayload,
} from "@/hooks/use-voice";


// ── Constants ─────────────────────────────────────────────────────────────────

const { width: W, height: H } = Dimensions.get("window");

// Page order: Executive = 0, Daily = 1, Luxury = 2
const PAGES = ["executive", "daily", "luxury"] as const;
const DEFAULT_PAGE = 1; // Daily

// Map carousel index → AI personality mode
const PAGE_MODE: AssistantMode[] = ["executive", "daily", "luxury"];

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<any>(null);
  const scrollX = useRef(new Animated.Value(DEFAULT_PAGE * W)).current;
  const [activePage, setActivePage] = useState(DEFAULT_PAGE);

  // ── Day plan state (Executive mode) ──
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null);

  // ── App state ──
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

  // ── Shared tool-result callbacks (used by both voice and text chat) ──
  const handleNote = useCallback(
    (note: NotePayload) =>
      addNote({ content: note.content, title: note.title, category: note.category, source: "voice" }),
    [addNote]
  );
  const handleNoteAction = useCallback(
    (action: NoteActionPayload) => {
      if (action.action === "delete" && action.keyword) deleteNoteByKeyword(action.keyword);
    },
    [deleteNoteByKeyword]
  );
  const handleReminder = useCallback(
    (params: { title: string; content: string; datetime: string }) => addReminder(params),
    [addReminder]
  );
  const handleMemoryAction = useCallback(
    (action: MemoryActionPayload) => {
      if (action.action === "save" && action.category && action.key && action.value) {
        saveMemory({ category: action.category as any, key: action.key, value: action.value });
      } else if (action.action === "delete" && action.key) {
        deleteMemoryByKey(action.key);
      }
    },
    [saveMemory, deleteMemoryByKey]
  );
  const handleReminderAction = useCallback(
    (action: ReminderActionPayload) => {
      if ((action.action === "delete" || action.action === "dismiss") && action.title) {
        deleteReminderByTitle(action.title);
      }
    },
    [deleteReminderByTitle]
  );
  const handleTaskAction = useCallback(
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
  );

  // ── Voice callbacks ──
  const voiceCallbacks = {
    onNote:           handleNote,
    onNoteAction:     handleNoteAction,
    onReminder:       handleReminder,
    onMemoryAction:   handleMemoryAction,
    onReminderAction: handleReminderAction,
    onTaskAction:     handleTaskAction,
    onPlan: useCallback((plan: DayPlan) => {
      setDayPlan(plan);
    }, []),
    onTurnComplete: useCallback(
      (transcript: string, reply: string) => addToHistory(transcript, reply),
      [addToHistory]
    ),
  };

  // ── Single shared voice instance ──
  const { state, mode, setMode, transcript, liveTranscript, reply, errorMessage, micLevel, toggle, cancelVoice, resetReply, speakAnswer } = useVoice({
    conversationHistory,
    memories,
    tasks,
    reminders,
    notes,
    preferences: {
      name:           preferences.name || undefined,
      location:       preferences.location || undefined,
      timezone:       preferences.timezone || undefined,
      responseLength: preferences.responseLength,
    },
    autoplay:  preferences.autoplay,
    callbacks: voiceCallbacks,
  });

  // ── Text chat callbacks ──
  const onChatComplete = useCallback(
    (userText: string, reply: string, tools: any, audio: { audioBase64?: string; audioUrl?: string }) => {
      // Add to conversation history
      addToHistory(userText, reply);
      // Fire any tool results
      if (tools?.note)           handleNote(tools.note);
      if (tools?.noteAction)     handleNoteAction(tools.noteAction);
      if (tools?.reminder)       handleReminder(tools.reminder);
      if (tools?.reminderAction) handleReminderAction(tools.reminderAction);
      if (tools?.memoryAction)   handleMemoryAction(tools.memoryAction);
      if (tools?.taskAction)     handleTaskAction(tools.taskAction);
      if (tools?.plan)           setDayPlan({ ...(tools.plan as DayPlan), generatedAt: Date.now() });
      // Mo speaks a typed reply the same way he speaks a voice reply. No-ops
      // if autoplay is off or the server's TTS failed (text-only fallback).
      speakAnswer(audio?.audioBase64, audio?.audioUrl);
    },
    [addToHistory, handleNote, handleNoteAction, handleReminder, handleReminderAction, handleMemoryAction, handleTaskAction, speakAnswer]
  );

  // ── Single shared text chat instance ──
  const { chatState, chatReply, chatError, submitText, resetChat } = useTextChat({
    onComplete: onChatComplete,
  });

  // ── Retry: re-initiate voice for voice errors, clear chat for chat errors ──
  const handleRetry = useCallback(() => {
    if (chatState === "error") {
      resetChat();
    } else {
      toggle();
    }
  }, [chatState, resetChat, toggle]);

  // ── Refs for context (avoid stale closures in submitText) ──
  const ctxRef = useRef({
    conversationHistory, memories, tasks, reminders, notes, preferences,
  });
  useEffect(() => {
    ctxRef.current = { conversationHistory, memories, tasks, reminders, notes, preferences };
  });

  // ── Voice toggle wrapper: clear a stale chat reply when a fresh voice
  //    turn starts, so it can't mask the new voice answer once it lands ──
  const handleToggle = useCallback(() => {
    guardVoiceToggle({ voiceState: state, resetChat, toggle });
  }, [state, resetChat, toggle]);

  // ── Per-mode submit handlers ──
  const makeSubmitHandler = useCallback(
    (pageMode: AssistantMode) => (text: string) => {
      const ctx = ctxRef.current;
      // guardTextSubmit cancels any in-flight voice turn and clears any
      // leftover voice transcript/reply first — otherwise the
      // `reply || chatReply` / `transcript || liveTranscript` fallbacks in
      // each screen keep showing the old voice turn's content (either
      // already-displayed, or arriving late once its API call resolves),
      // making a fresh text submission look like it did nothing.
      guardTextSubmit({
        cancelVoice,
        resetReply,
        submitText: () =>
          submitText(text, {
            mode: pageMode,
            messages: ctx.conversationHistory,
            memories: ctx.memories,
            tasks: ctx.tasks,
            reminders: ctx.reminders,
            notes: ctx.notes,
            preferences: {
              name:           ctx.preferences.name || undefined,
              location:       ctx.preferences.location || undefined,
              timezone:       ctx.preferences.timezone || undefined,
              responseLength: ctx.preferences.responseLength,
            },
          }),
      });
    },
    [submitText, resetReply, cancelVoice]
  );

  const submitDaily     = useCallback(makeSubmitHandler("daily"),     [makeSubmitHandler]);
  const submitExecutive = useCallback(makeSubmitHandler("executive"), [makeSubmitHandler]);
  const submitLuxury    = useCallback(makeSubmitHandler("luxury"),    [makeSubmitHandler]);

  // ── Scroll to Daily on mount (no animation) ──
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ x: W * DEFAULT_PAGE, animated: false });
  }, []);

  // ── Sync AI personality with active carousel page ──
  useEffect(() => {
    const targetMode = PAGE_MODE[activePage];
    if (mode !== targetMode) {
      // A voice turn started under the OLD persona (mid-recording, thinking,
      // or speaking) must never be allowed to land and answer as the NEW
      // persona once the user has swiped away. Cancel it cleanly first so
      // the mode hand-off is unambiguous — no duplicate/late listeners.
      if (state !== "idle") {
        console.log("[Mo] mode switch while voice active — cancelling in-flight turn", { from: mode, to: targetMode, state });
        cancelVoice();
      }
      setMode(targetMode);
    }
    // Reset text chat when mode changes so stale replies don't bleed across modes
    resetChat();
  }, [activePage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle page swipe completion ──
  const handleScrollEnd = useCallback(
    (e: any) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / W);
      if (page !== activePage) {
        setActivePage(page);
        Haptics.selectionAsync();
      }
    },
    [activePage]
  );

  // ── Shared voice props ──
  const voiceProps = {
    voiceState:    state,
    transcript,
    liveTranscript,
    reply,
    errorMessage,
    micLevel,
    onToggle:      handleToggle,
    onRetry:       handleRetry,
    chatState,
    chatReply,
    chatError,
    width:  W,
    height: H,
  };

  // Status bar: light text on Executive/Luxury (dark bg), dark text on Daily (light bg)
  const statusBarStyle = activePage === 1 ? "dark" : "light";

  return (
    <View style={styles.root}>
      <StatusBar style={statusBarStyle} />

      {/* ── Horizontal carousel ── */}
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={handleScrollEnd}
        style={styles.scrollView}
      >
        {/* Page 0 — Executive */}
        <ExecutiveScreen {...voiceProps} onSubmitText={submitExecutive} isActive={activePage === 0} dayPlan={dayPlan} />

        {/* Page 1 — Daily (default) */}
        <DailyScreen {...voiceProps} onSubmitText={submitDaily} isActive={activePage === 1} />

        {/* Page 2 — Luxury */}
        <LuxuryScreen {...voiceProps} onSubmitText={submitLuxury} isActive={activePage === 2} />
      </Animated.ScrollView>

      {/* ── Page indicators (floating, above all content) ── */}
      <View
        style={[
          styles.indicatorWrap,
          { bottom: insets.bottom + 6 },
        ]}
        pointerEvents="none"
      >
        <PageIndicator scrollX={scrollX} screenWidth={W} />
      </View>

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  scrollView: {
    flex: 1,
  },
  indicatorWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 50,
  },
});
