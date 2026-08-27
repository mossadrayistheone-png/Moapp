/**
 * DAILY MODE — Everyday personal assistant
 * Bright blue. Fixed bottom input + Command Center. Greeting + 3 suggestions at top.
 */

import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Line, Path, Rect } from "react-native-svg";

import { CommandCenter, type CommandCenterColors } from "@/components/CommandCenter";
import { ListeningPulse } from "@/components/ListeningPulse";
import { WaveformBars } from "@/components/WaveformBars";
import { DAILY_PROMPTS } from "@/constants/prompts";
import { DailyTheme as T } from "@/constants/themes";
import { useApp } from "@/context/AppContext";
import { usePromptHistory } from "@/hooks/use-prompt-history";
import { useReminders } from "@/hooks/use-reminders";
import type { ChatState } from "@/hooks/use-text-chat";
import type { AssistantState } from "@/hooks/use-voice";

// ── Icons ─────────────────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path stroke={T.textSub} strokeWidth={1.7} strokeLinecap="round"
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
      <Path stroke={T.textSub} strokeWidth={1.7} strokeLinecap="round"
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </Svg>
  );
}

function NotesIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={T.textSub} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 2v6h6" stroke={T.textSub} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="13" x2="8" y2="13" stroke={T.textSub} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1="16" y1="17" x2="8" y2="17" stroke={T.textSub} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

function MicIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" fill={color} />
      <Path d="M19 11v1a7 7 0 0 1-14 0v-1" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Path d="M12 18v3M9 21h6" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function StopIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="5" width="14" height="14" rx="3" fill={color} />
    </Svg>
  );
}

function SendIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGreeting(name?: string): string {
  const h = new Date().getHours();
  const time = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  return name ? `Good ${time}, ${name.split(" ")[0]}.` : `Good ${time}.`;
}

// ── Command Center colours ─────────────────────────────────────────────────────

const CC_COLORS: CommandCenterColors = {
  handleBg:      "#FFFFFF",
  handleBorder:  T.accentMedium,
  handleText:    T.textSub,
  handleChevron: T.accent,
  panelBg:       "#FFFFFF",
  panelBorder:   T.accentMedium,
  catText:       T.text,
  catIconColor:  T.accent,
  catActiveBg:   T.accentSoft,
  catBorder:     "rgba(59,123,248,0.08)",
  promptText:    T.text,
  promptBg:      T.accentSoft,
  promptBorder:  T.accentMedium,
  promptArrow:   T.accent,
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DailyScreenProps {
  voiceState: AssistantState;
  transcript: string;
  liveTranscript?: string;
  reply: string;
  errorMessage: string;
  micLevel?: number;
  onToggle: () => void;
  chatState: ChatState;
  chatReply: string;
  chatError: string;
  onSubmitText: (text: string) => void;
  onRetry?: () => void;
  width: number;
  height: number;
  isActive?: boolean;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function DailyScreen({
  voiceState, transcript, liveTranscript = "", reply, errorMessage, micLevel, onToggle,
  chatState, chatReply, chatError, onSubmitText, onRetry,
  width, height, isActive = false,
}: DailyScreenProps) {
  const insets = useSafeAreaInsets();
  const { preferences } = useApp();
  const { upcomingReminders } = useReminders();
  const { recentPrompts, addPrompt } = usePromptHistory("daily");

  const [inputText, setInputText] = useState("");
  const inputRef = useRef<TextInput>(null);

  // Fade-in the WebP background only on activation — not on every loop frame.
  // When isActive flips true, opacity animates 0→1 in 400 ms, hiding the
  // black first-frame decode flash. When leaving, reset instantly so the
  // next arrival starts from 0.
  const bgOpacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;
  const bgAnim = useRef<ReturnType<typeof Animated.timing> | null>(null);
  useEffect(() => {
    bgAnim.current?.stop();
    if (isActive) {
      bgOpacity.setValue(0);
      bgAnim.current = Animated.timing(bgOpacity, { toValue: 1, duration: 400, useNativeDriver: true });
    } else {
      bgAnim.current = Animated.timing(bgOpacity, { toValue: 0, duration: 300, useNativeDriver: true });
    }
    bgAnim.current.start();
  }, [isActive]);

  const isVoiceActive = voiceState !== "idle" && voiceState !== "error";
  const isChatActive  = chatState === "loading" || chatState === "done";
  const hasResponse   = isChatActive || isVoiceActive || chatState === "error"
                        || voiceState === "error" || !!reply || !!chatReply;

  // Fade-in for AI reply
  const replyFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (chatReply || reply) {
      replyFade.setValue(0);
      Animated.timing(replyFade, { toValue: 1, duration: 450, useNativeDriver: true }).start();
    }
  }, [chatReply, reply]);

  // Time-based suggested prompts
  const hour = new Date().getHours();
  const suggestedCategory = hour < 12 ? DAILY_PROMPTS[0] : hour < 17 ? DAILY_PROMPTS[3] : DAILY_PROMPTS[1];
  const suggestedPrompts  = suggestedCategory.prompts.slice(0, 3);

  const handleSubmit = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    Keyboard.dismiss();
    addPrompt(text, "daily");
    onSubmitText(text);
    setInputText("");
  }, [inputText, onSubmitText, addPrompt]);

  const handleSelectPrompt = useCallback((text: string) => {
    addPrompt(text, "daily");
    onSubmitText(text);
  }, [onSubmitText, addPrompt]);

  const voiceStatusLabel =
    voiceState === "listening" ? "Listening…"
    : voiceState === "thinking" ? "Thinking…"
    : voiceState === "speaking" ? "Tap to stop"
    : "";

  // Final transcript wins; while it's empty (listening/thinking) show the
  // live rolling one. Hidden entirely when live transcription is unavailable.
  const shownTranscript = transcript || liveTranscript;

  return (
    <KeyboardAvoidingView
      style={{ width, height, backgroundColor: T.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Static still always underneath — never black during transition */}
      <Image
        source={require("@/assets/images/daily-still.jpg")}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
      {/* Animated WebP fades in on activation, hiding the decode-startup flash.
          key swap forces expo-image to remount and restart the loop on return. */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: bgOpacity }]}>
        <Image
          key={isActive ? "anim" : "still"}
          source={isActive
            ? require("@/assets/videos/daily-bg.webp")
            : require("@/assets/images/daily-still.jpg")}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      </Animated.View>
      {/* Scrim so UI stays legible */}
      <LinearGradient
        colors={["rgba(255,255,255,0.28)", "rgba(235,242,255,0.40)", "rgba(220,233,255,0.52)"]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }} end={{ x: 0.3, y: 1 }}
      />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => { Haptics.selectionAsync(); router.push("/notes"); }} style={s.iconBtn}>
          <NotesIcon />
          {upcomingReminders.length > 0 && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{Math.min(upcomingReminders.length, 9)}</Text>
            </View>
          )}
        </Pressable>
        <View style={s.brandArea}>
          <Text style={s.brandName}>Mo.</Text>
          <Text style={s.brandSub}>Daily</Text>
        </View>
        <Pressable onPress={() => { Haptics.selectionAsync(); router.push("/settings"); }} style={s.iconBtn}>
          <SettingsIcon />
        </Pressable>
      </View>

      {/* ── Scrollable content ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Greeting */}
        <View style={s.greetingRow}>
          <Text style={s.greeting}>{getGreeting(preferences.name)}</Text>
          <Text style={s.greetingSub}>What can I help you with today?</Text>
        </View>

        {/* ── Response card (active conversation) ── */}
        {hasResponse && (
          <View style={s.responseCard}>
            {shownTranscript ? (
              <View style={s.transcriptBlock}>
                <Text style={s.transcriptLabel}>YOU SAID</Text>
                <Text style={s.transcriptText}>"{shownTranscript}"</Text>
              </View>
            ) : null}

            {(reply || chatReply) ? (
              <Animated.View style={{ opacity: replyFade }}>
                <Text style={s.aiLabel}>MO</Text>
                <Text style={s.aiReply}>{reply || chatReply}</Text>
              </Animated.View>
            ) : chatState === "loading" ? (
              <Text style={s.thinkingText}>Thinking…</Text>
            ) : voiceState === "thinking" ? (
              <Text style={s.thinkingText}>Processing…</Text>
            ) : null}

            {(errorMessage || chatError) ? (
              <View style={s.errorBlock}>
                <Text style={s.errorText}>{errorMessage || chatError}</Text>
                {onRetry ? (
                  <Pressable onPress={onRetry} style={s.retryBtn}>
                    <Text style={s.retryText}>Try Again</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Follow-up suggestions */}
            {(chatState === "done" || voiceState === "idle") && (chatReply || reply) ? (
              <View style={s.followUpRow}>
                <Text style={s.followUpLabel}>FOLLOW UP</Text>
                <View style={s.followUpChips}>
                  {suggestedPrompts.slice(0, 2).map((p, i) => (
                    <Pressable key={i} style={s.chip} onPress={() => handleSelectPrompt(p)}>
                      <Text style={s.chipText} numberOfLines={1}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Idle discovery state ── */}
        {!hasResponse && (
          <>
            {/* 3 suggested prompts */}
            <View style={s.suggestionsSection}>
              <Text style={s.sectionLabel}>SUGGESTED FOR YOU</Text>
              {suggestedPrompts.map((p, i) => (
                <Pressable key={i} style={s.suggestedCard} onPress={() => handleSelectPrompt(p)}>
                  <Text style={s.suggestedText}>{p}</Text>
                  <Text style={s.suggestedArrow}>→</Text>
                </Pressable>
              ))}
            </View>

            {/* Recently asked chips */}
            {recentPrompts.length > 0 && (
              <View style={s.suggestionsSection}>
                <Text style={s.sectionLabel}>RECENTLY ASKED</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chipsScroll}>
                  <View style={s.chipsRow}>
                    {recentPrompts.map((p, i) => (
                      <Pressable key={i} style={s.chip} onPress={() => handleSelectPrompt(p)}>
                        <Text style={s.chipText} numberOfLines={1}>{p}</Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* ── Fixed bottom: Command Center + Input Bar ── */}
      <CommandCenter
        categories={DAILY_PROMPTS}
        colors={CC_COLORS}
        label="Command Center"
        onSelectPrompt={handleSelectPrompt}
        maxHeight={288}
      />

      <View style={[s.inputBar, { marginBottom: insets.bottom + 10 }]}>
        {isVoiceActive ? (
          <View style={s.voiceInputState}>
            {voiceState === "listening" ? (
              <WaveformBars active level={micLevel} color={T.accent} />
            ) : (
              <View style={s.voicePulse} />
            )}
            {voiceState === "listening" && !liveTranscript ? (
              <ListeningPulse color={T.accent} />
            ) : (
              <Text style={s.voiceStateText} numberOfLines={1}>
                {voiceState === "listening" && liveTranscript ? liveTranscript : voiceStatusLabel}
              </Text>
            )}
          </View>
        ) : (
          <TextInput
            ref={inputRef}
            style={s.textInput}
            placeholder="Ask Mo anything…"
            placeholderTextColor={T.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
            editable={chatState !== "loading"}
          />
        )}
        {inputText.length > 0 && !isVoiceActive ? (
          <Pressable onPress={handleSubmit} style={[s.inputAction, { backgroundColor: T.accent }]}>
            <SendIcon color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onToggle(); }}
            style={[
              s.inputAction,
              isVoiceActive ? { backgroundColor: "#EF4444" } : { backgroundColor: T.accentSoft },
            ]}
          >
            {isVoiceActive ? <StopIcon color="#fff" /> : <MicIcon color={T.accent} />}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 4,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute", top: 4, right: 4, width: 14, height: 14, borderRadius: 7,
    backgroundColor: T.accent, alignItems: "center", justifyContent: "center",
  },
  badgeText: { fontSize: 8, color: "#fff", fontFamily: "DMSans_500Medium" },
  brandArea: { alignItems: "center" },
  brandName: { fontFamily: "DMSans_500Medium", fontSize: 22, color: T.accent, letterSpacing: 1 },
  brandSub: {
    fontFamily: "DMSans_400Regular", fontSize: 9, color: T.textSub,
    letterSpacing: 2.5, textTransform: "uppercase", marginTop: -2,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, gap: 4 },

  greetingRow: { paddingBottom: 12, gap: 2 },
  greeting: { fontFamily: "DMSans_500Medium", fontSize: 24, color: T.text, letterSpacing: -0.3 },
  greetingSub: { fontFamily: "DMSans_400Regular", fontSize: 13, color: T.textSub },

  // Suggestions
  suggestionsSection: { gap: 8, marginBottom: 4 },
  sectionLabel: {
    fontFamily: "DMSans_500Medium", fontSize: 9, color: T.textSub,
    letterSpacing: 2.5, textTransform: "uppercase", marginLeft: 2,
  },
  suggestedCard: {
    backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1,
    borderColor: T.cardBorder, padding: 14, flexDirection: "row",
    alignItems: "center", justifyContent: "space-between",
    shadowColor: T.accent, shadowOpacity: 0.05, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  suggestedText: { fontFamily: "DMSans_400Regular", fontSize: 14, color: T.text, flex: 1 },
  suggestedArrow: { fontFamily: "DMSans_400Regular", fontSize: 14, color: T.accent, marginLeft: 8 },

  // Recently asked chips
  chipsScroll: { marginHorizontal: -16 },
  chipsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  chip: {
    backgroundColor: T.accentSoft, borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: 8, maxWidth: 200, borderWidth: 1, borderColor: T.accentMedium,
  },
  chipText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: T.accent },

  // Response card
  responseCard: {
    backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1.5,
    borderColor: T.accentMedium, padding: 18, marginBottom: 4, gap: 12,
    shadowColor: T.accent, shadowOpacity: 0.08, shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  transcriptBlock: { gap: 3 },
  transcriptLabel: { fontFamily: "DMSans_500Medium", fontSize: 9, color: T.accent, letterSpacing: 2.5 },
  transcriptText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: T.textSub, fontStyle: "italic" },
  aiLabel: { fontFamily: "DMSans_500Medium", fontSize: 9, color: T.accent, letterSpacing: 2.5, marginBottom: 4 },
  aiReply: { fontFamily: "DMSans_400Regular", fontSize: 16, color: T.text, lineHeight: 25 },
  thinkingText: { fontFamily: "DMSans_400Regular", fontSize: 14, color: T.textSub, fontStyle: "italic" },
  errorText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: T.danger, lineHeight: 19 },
  errorBlock: { gap: 8 },
  retryBtn: {
    alignSelf: "flex-start" as const, paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 8, borderWidth: 1, borderColor: T.danger,
    backgroundColor: "rgba(239,68,68,0.07)",
  },
  retryText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: T.danger },
  followUpRow: { gap: 8, marginTop: 4 },
  followUpLabel: { fontFamily: "DMSans_500Medium", fontSize: 9, color: T.textMuted, letterSpacing: 2.5 },
  followUpChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Fixed bottom input bar
  inputBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16, borderWidth: 1.5, borderColor: T.accentMedium,
    paddingHorizontal: 14, paddingVertical: 4, gap: 8,
    shadowColor: T.accent, shadowOpacity: 0.10, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 3,
  },
  textInput: {
    flex: 1, height: 44, fontFamily: "DMSans_400Regular", fontSize: 15, color: T.text,
  },
  inputAction: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  voiceInputState: {
    flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: 10,
  },
  voicePulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" },
  voiceStateText: {
    flex: 1,
    fontFamily: "DMSans_400Regular", fontSize: 15, color: T.textSub, fontStyle: "italic",
  },
});
