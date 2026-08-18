/**
 * EXECUTIVE MODE — Professional productivity workspace
 * Dark graphite, glassmorphism, silver. Fixed bottom input + Command Library.
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

import { Feather } from "@expo/vector-icons";
import { CommandCenter, type CommandCenterColors } from "@/components/CommandCenter";
import { ListeningPulse } from "@/components/ListeningPulse";
import { PaywallModal } from "@/components/PaywallModal";
import { WaveformBars } from "@/components/WaveformBars";
import { EXECUTIVE_PROMPTS } from "@/constants/prompts";
import { ExecutiveTheme as T } from "@/constants/themes";
import { useApp } from "@/context/AppContext";
import { useSubscription } from "@/lib/revenuecat";
import { usePromptHistory } from "@/hooks/use-prompt-history";
import type { ChatState } from "@/hooks/use-text-chat";
import type { AssistantState, DayPlan, PlanBlock } from "@/hooks/use-voice";

// ── Icons ─────────────────────────────────────────────────────────────────────

function SettingsIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path stroke={T.textSub} strokeWidth={1.5} strokeLinecap="round"
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </Svg>
  );
}

function MemoryIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={T.textSub} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 2v6h6" stroke={T.textSub} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="13" x2="8" y2="13" stroke={T.textSub} strokeWidth={1.5} strokeLinecap="round" />
      <Line x1="16" y1="17" x2="8" y2="17" stroke={T.textSub} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}

function MicIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" fill={color} />
      <Path d="M19 11v1a7 7 0 0 1-14 0v-1" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 18v3M9 21h6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function StopIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x="5" y="5" width="14" height="14" rx="2" fill={color} />
    </Svg>
  );
}

function SendIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatExecHeader(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  }).toUpperCase();
}

// ── Command Center colours ─────────────────────────────────────────────────────

const CC_COLORS: CommandCenterColors = {
  handleBg:      "rgba(255,255,255,0.05)",
  handleBorder:  T.cardBorder,
  handleText:    T.textSub,
  handleChevron: T.accent,
  panelBg:       "rgba(14,17,32,0.97)",
  panelBorder:   T.cardBorder,
  catText:       T.text,
  catIconColor:  T.accent,
  catActiveBg:   T.accentSoft,
  catBorder:     T.divider,
  promptText:    T.textSub,
  promptBg:      "rgba(255,255,255,0.04)",
  promptBorder:  T.cardBorder,
  promptArrow:   T.accent,
};

// ── Day Plan Card ─────────────────────────────────────────────────────────────

function DayPlanCard({ plan }: { plan: DayPlan }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const TIMEFRAME: Record<DayPlan["timeframe"], string> = {
    morning: "Morning", afternoon: "Afternoon", evening: "Evening", full_day: "Full Day",
  };
  return (
    <View style={s.planCard}>
      <Pressable onPress={() => setCollapsed(c => !c)} style={s.planHeader}>
        <View style={s.planHeaderLeft}>
          <Text style={s.planLabel}>DAY PLAN</Text>
          <Text style={s.planTitle}>{plan.title}</Text>
          <Text style={s.planTimeframe}>{TIMEFRAME[plan.timeframe]}</Text>
        </View>
        <Feather name={collapsed ? "chevron-down" : "chevron-up"} size={15} color={T.textSub} />
      </Pressable>
      {!collapsed && (
        <View style={s.planBlocks}>
          {plan.blocks.map((block: PlanBlock, i: number) => (
            <View key={i} style={[s.planBlock, i < plan.blocks.length - 1 && s.planBlockBorder]}>
              {block.time ? <Text style={s.blockTime}>{block.time}</Text> : null}
              <View style={s.blockContent}>
                <Text style={s.blockTitle}>{block.title}</Text>
                {block.description ? <Text style={s.blockDesc}>{block.description}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ExecutiveScreenProps {
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
  dayPlan?: import("@/hooks/use-voice").DayPlan | null;
  width: number;
  height: number;
  isActive?: boolean;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function ExecutiveScreen({
  voiceState, transcript, liveTranscript = "", reply, errorMessage, micLevel, onToggle,
  chatState, chatReply, chatError, onSubmitText, onRetry, dayPlan,
  width, height, isActive = false,
}: ExecutiveScreenProps) {
  const insets = useSafeAreaInsets();
  const { preferences } = useApp();
  const { hasExecutive, isConfigured } = useSubscription();
  const { recentPrompts, addPrompt } = usePromptHistory("executive");

  const [inputText, setInputText] = useState("");
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Show paywall when this screen becomes active and user lacks the entitlement.
  useEffect(() => {
    if (isActive && isConfigured && !hasExecutive) {
      setPaywallVisible(true);
    }
  }, [isActive, isConfigured, hasExecutive]);

  // Fade-in the WebP background only on activation — not on every loop frame.
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

  const replyFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (chatReply || reply) {
      replyFade.setValue(0);
      Animated.timing(replyFade, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }
  }, [chatReply, reply]);

  const suggestedPrompts = EXECUTIVE_PROMPTS[0].prompts.slice(0, 3);

  const handleSubmit = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    Keyboard.dismiss();
    addPrompt(text, "executive");
    onSubmitText(text);
    setInputText("");
  }, [inputText, onSubmitText, addPrompt]);

  const handleSelectPrompt = useCallback((text: string) => {
    addPrompt(text, "executive");
    onSubmitText(text);
  }, [onSubmitText, addPrompt]);

  const voiceStatusLabel =
    voiceState === "listening" ? "Voice input active…"
    : voiceState === "thinking" ? "Processing request…"
    : voiceState === "speaking" ? "Tap to interrupt"
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
        source={require("@/assets/images/executive-still.jpg")}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
      {/* Animated WebP fades in on activation, hiding the decode-startup flash. */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: bgOpacity }]}>
        <Image
          key={isActive ? "anim" : "still"}
          source={isActive
            ? require("@/assets/videos/executive-bg.webp")
            : require("@/assets/images/executive-still.jpg")}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      </Animated.View>
      {/* Scrim so UI stays legible */}
      <LinearGradient
        colors={["rgba(10,12,24,0.18)", "rgba(14,17,32,0.26)", "rgba(8,10,20,0.32)"]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <View style={s.headerLeft}>
          <Text style={s.brandName}>Mo.</Text>
          <Text style={s.brandMode}>EXECUTIVE</Text>
        </View>
        <View style={s.headerCenter}>
          <Text style={s.headerDate}>{formatExecHeader()}</Text>
          {preferences.name ? (
            <Text style={s.headerGreet}>
              {new Date().getHours() < 12 ? "Good morning" : "Good afternoon"},{" "}
              {preferences.name.split(" ")[0]}
            </Text>
          ) : null}
        </View>
        <View style={s.headerRight}>
          <Pressable onPress={() => { Haptics.selectionAsync(); router.push("/notes"); }} style={s.iconBtn}>
            <MemoryIcon />
          </Pressable>
          <Pressable onPress={() => { Haptics.selectionAsync(); router.push("/settings"); }} style={s.iconBtn}>
            <SettingsIcon />
          </Pressable>
        </View>
      </View>

      <View style={s.divider} />

      {/* ── Scrollable content ── */}
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Response card ── */}
        {hasResponse && (
          <View style={s.responseCard}>
            {shownTranscript ? (
              <View style={s.transcriptBlock}>
                <Text style={s.transcriptLabel}>INPUT</Text>
                <Text style={s.transcriptText}>"{shownTranscript}"</Text>
              </View>
            ) : null}

            {(reply || chatReply) ? (
              <Animated.View style={{ opacity: replyFade }}>
                <Text style={s.aiLabel}>RESPONSE</Text>
                <Text style={s.aiReply}>{reply || chatReply}</Text>
              </Animated.View>
            ) : chatState === "loading" ? (
              <Text style={s.thinkingText}>Processing request…</Text>
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

            {(chatState === "done" || voiceState === "idle") && (chatReply || reply) ? (
              <View style={s.followUpRow}>
                <Text style={s.followUpLabel}>CONTINUE WITH</Text>
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

        {/* ── Day Plan (persists independently of response card) ── */}
        {dayPlan ? <DayPlanCard plan={dayPlan} /> : null}

        {/* ── Idle discovery state ── */}
        {!hasResponse && (
          <>
            {/* 3 suggested prompts */}
            <View style={s.suggestionsSection}>
              <Text style={s.sectionLabel}>SUGGESTED FOR TODAY</Text>
              {suggestedPrompts.map((p, i) => (
                <Pressable key={i} style={s.suggestedRow} onPress={() => handleSelectPrompt(p)}>
                  <Text style={s.suggestedIndex}>{String(i + 1).padStart(2, "0")}</Text>
                  <Text style={s.suggestedText}>{p}</Text>
                  <Text style={s.suggestedArrow}>→</Text>
                </Pressable>
              ))}
            </View>

            {/* Recently used */}
            {recentPrompts.length > 0 && (
              <View style={s.suggestionsSection}>
                <Text style={s.sectionLabel}>RECENTLY USED</Text>
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

      {/* ── Fixed bottom: Command Library + Input ── */}
      <CommandCenter
        categories={EXECUTIVE_PROMPTS}
        colors={CC_COLORS}
        label="Command Library"
        onSelectPrompt={handleSelectPrompt}
        maxHeight={288}
      />

      <View style={[s.inputBar, { marginBottom: insets.bottom + 10 }]}>
        {isVoiceActive ? (
          <View style={s.voiceInputState}>
            {voiceState === "listening" ? (
              <WaveformBars active level={micLevel} color={T.accent} />
            ) : (
              <View style={s.voiceActiveDot} />
            )}
            {voiceState === "listening" && !liveTranscript && Platform.OS === "android" ? (
              <ListeningPulse color={T.accent} />
            ) : (
              <Text style={s.voiceStateText} numberOfLines={1}>
                {voiceState === "listening" && liveTranscript ? liveTranscript : voiceStatusLabel}
              </Text>
            )}
          </View>
        ) : (
          <TextInput
            style={s.textInput}
            placeholder="Enter command or question…"
            placeholderTextColor={T.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
            editable={chatState !== "loading"}
          />
        )}
        {inputText.length > 0 && !isVoiceActive ? (
          <Pressable onPress={handleSubmit} style={[s.inputAction, { backgroundColor: T.accentMedium }]}>
            <SendIcon color={T.text} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onToggle(); }}
            style={[
              s.inputAction,
              isVoiceActive ? { backgroundColor: T.accent } : { backgroundColor: T.accentSoft },
            ]}
          >
            {isVoiceActive ? <StopIcon color={T.bg} /> : <MicIcon color={T.accent} />}
          </Pressable>
        )}
      </View>
      <PaywallModal
        visible={paywallVisible}
        mode="executive"
        onDismiss={() => setPaywallVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: 22, paddingBottom: 12,
  },
  headerLeft: { gap: 1 },
  brandName: {
    fontFamily: "CormorantGaramond_500Medium", fontSize: 30, color: T.text,
    letterSpacing: 2, lineHeight: 34,
  },
  brandMode: { fontFamily: "DMSans_500Medium", fontSize: 8, color: T.textSub, letterSpacing: 4 },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  headerDate: { fontFamily: "DMSans_500Medium", fontSize: 10, color: T.textSub, letterSpacing: 2 },
  headerGreet: { fontFamily: "DMSans_400Regular", fontSize: 10, color: T.textMuted, letterSpacing: 0.5 },
  headerRight: { flexDirection: "row", gap: 2 },
  iconBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },

  divider: { height: 1, backgroundColor: T.divider, marginHorizontal: 22, marginBottom: 14 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 0, gap: 4 },

  // Suggestions
  suggestionsSection: { gap: 8, marginBottom: 4 },
  sectionLabel: {
    fontFamily: "DMSans_500Medium", fontSize: 9, color: T.textMuted,
    letterSpacing: 3.5, textTransform: "uppercase", marginLeft: 2,
  },
  suggestedRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10,
    borderWidth: 1, borderColor: T.divider, padding: 14, gap: 12,
  },
  suggestedIndex: { fontFamily: "DMSans_400Regular", fontSize: 11, color: T.textMuted, letterSpacing: 1, width: 24 },
  suggestedText: { fontFamily: "DMSans_400Regular", fontSize: 14, color: T.textSub, flex: 1 },
  suggestedArrow: { fontFamily: "DMSans_400Regular", fontSize: 14, color: T.textMuted },

  chipsScroll: { marginHorizontal: -16 },
  chipsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  chip: {
    backgroundColor: T.accentSoft, borderRadius: 6, paddingHorizontal: 12,
    paddingVertical: 7, maxWidth: 220, borderWidth: 1, borderColor: T.accentMedium,
  },
  chipText: { fontFamily: "DMSans_400Regular", fontSize: 12, color: T.text },

  // Response card
  responseCard: {
    backgroundColor: "rgba(255,255,255,0.045)", borderRadius: 12,
    borderWidth: 1, borderColor: T.cardBorder, padding: 18, marginBottom: 4, gap: 12,
  },
  transcriptBlock: { gap: 3 },
  transcriptLabel: { fontFamily: "DMSans_500Medium", fontSize: 9, color: T.textMuted, letterSpacing: 3 },
  transcriptText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: T.textSub, fontStyle: "italic" },
  aiLabel: { fontFamily: "DMSans_500Medium", fontSize: 9, color: T.accent, letterSpacing: 3, marginBottom: 4 },
  aiReply: { fontFamily: "DMSans_400Regular", fontSize: 15, color: T.text, lineHeight: 24 },
  thinkingText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: T.textSub, fontStyle: "italic" },
  errorText: { fontFamily: "DMSans_400Regular", fontSize: 13, color: T.danger, lineHeight: 19 },
  errorBlock: { gap: 8 },
  retryBtn: {
    alignSelf: "flex-start" as const, paddingHorizontal: 16, paddingVertical: 7,
    borderRadius: 6, borderWidth: 1, borderColor: T.danger,
    backgroundColor: "rgba(248,113,113,0.08)",
  },
  retryText: { fontFamily: "DMSans_500Medium", fontSize: 13, color: T.danger },
  // Day Plan card
  planCard: {
    backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 12,
    borderWidth: 1, borderColor: T.divider, overflow: "hidden" as const, marginBottom: 4,
  },
  planHeader: {
    flexDirection: "row" as const, alignItems: "flex-start" as const,
    justifyContent: "space-between" as const, padding: 16, gap: 12,
  },
  planHeaderLeft: { flex: 1, gap: 3 },
  planLabel: { fontFamily: "DMSans_500Medium", fontSize: 9, color: T.accent, letterSpacing: 3.5 },
  planTitle: { fontFamily: "CormorantGaramond_500Medium", fontSize: 19, color: T.text, lineHeight: 24 },
  planTimeframe: { fontFamily: "DMSans_300Light", fontSize: 11, color: T.textSub },
  planBlocks: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: T.divider },
  planBlock: { flexDirection: "row" as const, padding: 14, paddingHorizontal: 16, gap: 12, alignItems: "flex-start" as const },
  planBlockBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.divider },
  blockTime: { fontFamily: "DMSans_400Regular", fontSize: 10, color: T.accent, width: 76, paddingTop: 2, flexShrink: 0 },
  blockContent: { flex: 1, gap: 2 },
  blockTitle: { fontFamily: "DMSans_500Medium", fontSize: 13, color: T.text, lineHeight: 19 },
  blockDesc: { fontFamily: "DMSans_300Light", fontSize: 12, color: T.textSub, lineHeight: 17 },
  followUpRow: { gap: 8, marginTop: 4 },
  followUpLabel: { fontFamily: "DMSans_500Medium", fontSize: 9, color: T.textMuted, letterSpacing: 3 },
  followUpChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Fixed bottom input bar
  inputBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14, borderWidth: 1, borderColor: T.cardBorder,
    paddingHorizontal: 14, paddingVertical: 4, gap: 8,
  },
  textInput: {
    flex: 1, height: 44, fontFamily: "DMSans_400Regular", fontSize: 14, color: T.text,
  },
  inputAction: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  voiceInputState: {
    flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: 10,
  },
  voiceActiveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: T.accent },
  voiceStateText: {
    flex: 1,
    fontFamily: "DMSans_400Regular", fontSize: 13, color: T.textSub, fontStyle: "italic",
  },
});
