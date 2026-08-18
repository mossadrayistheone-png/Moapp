/**
 * LUXURY MODE — Private concierge & lifestyle assistant
 * Black, gold, Cormorant Garamond. Fixed bottom input + Concierge Services panel.
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
import { PaywallModal } from "@/components/PaywallModal";
import { WaveformBars } from "@/components/WaveformBars";
import { LUXURY_PROMPTS } from "@/constants/prompts";
import { LuxuryTheme as T } from "@/constants/themes";
import { useApp } from "@/context/AppContext";
import { useSubscription } from "@/lib/revenuecat";
import { usePromptHistory } from "@/hooks/use-prompt-history";
import type { ChatState } from "@/hooks/use-text-chat";
import type { AssistantState } from "@/hooks/use-voice";

// ── Icons ─────────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path stroke={T.textSub} strokeWidth={1.4} strokeLinecap="round"
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      />
    </Svg>
  );
}

function NotesIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
        stroke={T.textSub} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14 2v6h6" stroke={T.textSub} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="13" x2="8" y2="13" stroke={T.textSub} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1="16" y1="17" x2="8" y2="17" stroke={T.textSub} strokeWidth={1.4} strokeLinecap="round" />
    </Svg>
  );
}

function MicIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V6a4 4 0 0 0-4-4z" fill={color} />
      <Path d="M19 11v1a7 7 0 0 1-14 0v-1" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M12 18v3M9 21h6" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function StopIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
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

function getTimeOfDay(): string {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

// ── Command Center colours ─────────────────────────────────────────────────────

const CC_COLORS: CommandCenterColors = {
  handleBg:      "rgba(201,168,76,0.04)",
  handleBorder:  T.cardBorder,
  handleText:    T.textSub,
  handleChevron: T.accent,
  panelBg:       "#050505",
  panelBorder:   T.cardBorder,
  catText:       T.text,
  catIconColor:  T.accent,
  catActiveBg:   T.accentSoft,
  catBorder:     T.divider,
  promptText:    T.textSub,
  promptBg:      "transparent",
  promptBorder:  T.divider,
  promptArrow:   T.accent,
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LuxuryScreenProps {
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

export function LuxuryScreen({
  voiceState, transcript, liveTranscript = "", reply, errorMessage, micLevel, onToggle,
  chatState, chatReply, chatError, onSubmitText, onRetry,
  width, height, isActive = false,
}: LuxuryScreenProps) {
  const insets = useSafeAreaInsets();
  const { preferences } = useApp();
  const { hasLuxury, isConfigured } = useSubscription();
  const { recentPrompts, addPrompt } = usePromptHistory("luxury");

  const [inputText, setInputText] = useState("");
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Show paywall when this screen becomes active and user lacks the entitlement.
  useEffect(() => {
    if (isActive && isConfigured && !hasLuxury) {
      setPaywallVisible(true);
    }
  }, [isActive, isConfigured, hasLuxury]);

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

  const replyFade  = useRef(new Animated.Value(0)).current;
  const replySlide = useRef(new Animated.Value(12)).current;
  useEffect(() => {
    if (chatReply || reply) {
      replyFade.setValue(0);
      replySlide.setValue(12);
      Animated.parallel([
        Animated.timing(replyFade,  { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(replySlide, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [chatReply, reply]);

  const firstName     = preferences.name ? preferences.name.split(" ")[0] : null;
  const suggestedPrompts = LUXURY_PROMPTS[0].prompts.slice(0, 3);

  const handleSubmit = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;
    Keyboard.dismiss();
    addPrompt(text, "luxury");
    onSubmitText(text);
    setInputText("");
  }, [inputText, onSubmitText, addPrompt]);

  const handleSelectPrompt = useCallback((text: string) => {
    addPrompt(text, "luxury");
    onSubmitText(text);
  }, [onSubmitText, addPrompt]);

  // Final transcript wins; while it's empty (listening/thinking) show the
  // live rolling one. Hidden entirely when live transcription is unavailable.
  const shownTranscript = transcript || liveTranscript;

  const voiceStatusLabel =
    voiceState === "listening" ? "Listening…"
    : voiceState === "thinking" ? "A moment, please…"
    : voiceState === "speaking" ? "End"
    : "";

  return (
    <KeyboardAvoidingView
      style={{ width, height, backgroundColor: T.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Static still always underneath — never black during transition */}
      <Image
        source={require("@/assets/images/luxury-still.jpg")}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
      {/* Animated WebP fades in on activation, hiding the decode-startup flash. */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: bgOpacity }]}>
        <Image
          key={isActive ? "anim" : "still"}
          source={isActive
            ? require("@/assets/videos/luxury-bg.webp")
            : require("@/assets/images/luxury-still.jpg")}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      </Animated.View>
      {/* Scrim so UI stays legible */}
      <LinearGradient
        colors={["rgba(5,4,2,0.18)", "rgba(10,8,4,0.24)", "rgba(5,4,2,0.30)"]}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      />

      {/* ── Header ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => { Haptics.selectionAsync(); router.push("/notes"); }} style={s.iconBtn}>
          <NotesIcon />
        </Pressable>
        <View style={s.brand}>
          <Text style={s.brandName}>Mo.</Text>
          <Text style={s.brandSub}>Private Concierge</Text>
        </View>
        <Pressable onPress={() => { Haptics.selectionAsync(); router.push("/settings"); }} style={s.iconBtn}>
          <GearIcon />
        </Pressable>
      </View>

      {/* ── Greeting ── */}
      <View style={s.greetingArea}>
        <Text style={s.greetingText}>
          {firstName ? `Good ${getTimeOfDay()}, ${firstName}.` : `Good ${getTimeOfDay()}.`}
        </Text>
        <Text style={s.greetingSub}>How may I assist you today?</Text>
      </View>

      {/* ── Gold divider ── */}
      <View style={s.goldDivider}>
        <View style={s.goldLine} />
        <View style={s.goldDot} />
        <View style={s.goldLine} />
      </View>

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
                <Text style={s.transcriptLabel}>You said</Text>
                <Text style={s.transcriptText}>"{shownTranscript}"</Text>
              </View>
            ) : null}

            {(reply || chatReply) ? (
              <Animated.View style={{ opacity: replyFade, transform: [{ translateY: replySlide }] }}>
                <Text style={s.aiReply}>{reply || chatReply}</Text>
              </Animated.View>
            ) : chatState === "loading" ? (
              <Text style={s.thinkingText}>A moment, please…</Text>
            ) : voiceState === "thinking" ? (
              <Text style={s.thinkingText}>A moment, please…</Text>
            ) : null}

            {(errorMessage || chatError) ? (
              <View style={s.errorBlock}>
                <Text style={s.errorText}>{errorMessage || chatError}</Text>
                {onRetry ? (
                  <Pressable onPress={onRetry} style={s.retryBtn} hitSlop={8}>
                    <Text style={s.retryText}>Try Again</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {(chatState === "done" || voiceState === "idle") && (chatReply || reply) ? (
              <View style={s.followUpRow}>
                <View style={s.followUpDivider} />
                <Text style={s.followUpLabel}>You might also ask</Text>
                <View style={s.followUpChips}>
                  {suggestedPrompts.slice(0, 2).map((p, i) => (
                    <Pressable key={i} style={s.chip} onPress={() => handleSelectPrompt(p)}>
                      <Text style={s.chipText} numberOfLines={2}>{p}</Text>
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
            {/* 3 curated suggestions */}
            <View style={s.suggestionsSection}>
              <Text style={s.sectionLabel}>Curated For You</Text>
              {suggestedPrompts.map((p, i) => (
                <Pressable key={i} style={s.suggestedRow} onPress={() => handleSelectPrompt(p)}>
                  <Text style={s.suggestedGlyph}>◆</Text>
                  <Text style={s.suggestedText}>{p}</Text>
                  <Text style={s.suggestedArrow}>→</Text>
                </Pressable>
              ))}
            </View>

            {/* Recently requested */}
            {recentPrompts.length > 0 && (
              <View style={s.suggestionsSection}>
                <Text style={s.sectionLabel}>Recently Requested</Text>
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

      {/* ── Fixed bottom: Concierge Services + Input ── */}
      <CommandCenter
        categories={LUXURY_PROMPTS}
        colors={CC_COLORS}
        label="Concierge Services"
        onSelectPrompt={handleSelectPrompt}
        categoryFontFamily="CormorantGaramond_500Medium"
        promptFontFamily="DMSans_300Light"
        maxHeight={288}
      />

      <View style={[s.inputBar, { marginBottom: insets.bottom + 10 }]}>
        {isVoiceActive ? (
          <View style={s.voiceInputState}>
            {voiceState === "listening" ? (
              <WaveformBars active level={micLevel} color={T.accent} />
            ) : (
              <Text style={s.voiceInputGold}>◆</Text>
            )}
            <Text style={s.voiceStateText} numberOfLines={1}>
              {voiceState === "listening" && liveTranscript ? liveTranscript : voiceStatusLabel}
            </Text>
          </View>
        ) : (
          <TextInput
            style={s.textInput}
            placeholder="What would you like to arrange?"
            placeholderTextColor={T.textMuted}
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
            editable={chatState !== "loading"}
          />
        )}
        {inputText.length > 0 && !isVoiceActive ? (
          <Pressable onPress={handleSubmit} style={[s.inputAction, { borderColor: T.accent }]}>
            <SendIcon color={T.accent} />
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onToggle(); }}
            style={[
              s.inputAction,
              isVoiceActive
                ? { borderColor: T.accent, backgroundColor: T.accentSoft }
                : { borderColor: T.cardBorder },
            ]}
          >
            {isVoiceActive ? <StopIcon color={T.accent} /> : <MicIcon color={T.accent} />}
          </Pressable>
        )}
      </View>
      <PaywallModal
        visible={paywallVisible}
        mode="luxury"
        onDismiss={() => setPaywallVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 24, paddingBottom: 6,
  },
  iconBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  brand: { alignItems: "center", gap: 2 },
  brandName: {
    fontFamily: "CormorantGaramond_500Medium", fontSize: 34, color: T.accent,
    letterSpacing: 3, lineHeight: 38,
  },
  brandSub: {
    fontFamily: "DMSans_300Light", fontSize: 9, color: T.textSub,
    letterSpacing: 4, textTransform: "uppercase",
  },

  greetingArea: { paddingHorizontal: 24, paddingBottom: 10, gap: 3, alignItems: "center" },
  greetingText: {
    fontFamily: "CormorantGaramond_400Regular_Italic", fontSize: 24,
    color: T.text, textAlign: "center",
  },
  greetingSub: {
    fontFamily: "DMSans_300Light", fontSize: 12, color: T.textSub,
    letterSpacing: 0.5, textAlign: "center",
  },

  goldDivider: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 40,
    marginBottom: 12, gap: 10,
  },
  goldLine: { flex: 1, height: 0.5, backgroundColor: T.accent, opacity: 0.3 },
  goldDot:  { width: 4, height: 4, borderRadius: 2, backgroundColor: T.accent, opacity: 0.55 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 0, gap: 4 },

  // Suggestions
  suggestionsSection: { gap: 10, marginBottom: 4 },
  sectionLabel: {
    fontFamily: "DMSans_300Light", fontSize: 9, color: T.textSub,
    letterSpacing: 4, textTransform: "uppercase",
  },
  suggestedRow: {
    flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: T.divider,
    paddingVertical: 14, gap: 14,
  },
  suggestedGlyph: { fontSize: 10, color: T.accent, width: 16, textAlign: "center" },
  suggestedText:  { fontFamily: "DMSans_300Light", fontSize: 14, color: T.text, flex: 1 },
  suggestedArrow: { fontFamily: "DMSans_300Light", fontSize: 14, color: T.textSub },

  chipsScroll: { marginHorizontal: -20 },
  chipsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20 },
  chip: {
    borderWidth: 1, borderColor: T.cardBorder, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 9, maxWidth: 230,
  },
  chipText: { fontFamily: "DMSans_300Light", fontSize: 13, color: T.textSub },

  // Response card
  responseCard: {
    borderWidth: 1, borderColor: T.cardBorder, borderRadius: 14,
    padding: 20, marginBottom: 4, gap: 14,
    backgroundColor: "rgba(201,168,76,0.03)",
  },
  transcriptBlock: { gap: 4 },
  transcriptLabel: {
    fontFamily: "DMSans_300Light", fontSize: 9, color: T.textSub,
    letterSpacing: 3.5, textTransform: "uppercase",
  },
  transcriptText: { fontFamily: "DMSans_300Light", fontSize: 13, color: T.textSub, fontStyle: "italic" },
  aiReply: {
    fontFamily: "CormorantGaramond_400Regular_Italic", fontSize: 24,
    color: T.text, lineHeight: 34,
  },
  thinkingText: {
    fontFamily: "CormorantGaramond_400Regular_Italic", fontSize: 18,
    color: T.textSub, textAlign: "center",
  },
  errorText: { fontFamily: "DMSans_300Light", fontSize: 13, color: T.textSub, textAlign: "center" as const },
  errorBlock: { gap: 10, alignItems: "center" as const },
  retryBtn: {
    alignSelf: "center" as const, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 2,
    borderWidth: 1, borderColor: "rgba(201,168,76,0.35)", backgroundColor: "rgba(201,168,76,0.05)",
  },
  retryText: { fontFamily: "DMSans_300Light", fontSize: 12, color: "rgba(201,168,76,0.7)", letterSpacing: 2 },
  followUpRow: { gap: 10 },
  followUpDivider: { height: 0.5, backgroundColor: T.cardBorder },
  followUpLabel: { fontFamily: "DMSans_300Light", fontSize: 11, color: T.textSub, letterSpacing: 1 },
  followUpChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },

  // Fixed bottom input bar
  inputBar: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 12,
    borderWidth: 1, borderColor: T.cardBorder, borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.02)",
    paddingHorizontal: 16, paddingVertical: 4, gap: 10,
  },
  textInput: {
    flex: 1, height: 48, fontFamily: "DMSans_300Light", fontSize: 15, color: T.text,
  },
  inputAction: {
    width: 38, height: 38, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  voiceInputState: {
    flex: 1, height: 48, flexDirection: "row", alignItems: "center", gap: 12,
  },
  voiceInputGold: { fontSize: 10, color: T.accent },
  voiceStateText: {
    flex: 1,
    fontFamily: "CormorantGaramond_400Regular_Italic", fontSize: 16, color: T.textSub,
  },
});
