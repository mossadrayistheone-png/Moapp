/**
 * First-launch onboarding — luxury multi-step flow.
 * Steps: Welcome → Modes → Microphone → Personalize → Ready
 */

import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requestRecordingPermissionsAsync } from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:          "#000000",
  surface:     "rgba(255,255,255,0.04)",
  border:      "rgba(255,255,255,0.10)",
  gold:        "#C9A84C",
  goldSoft:    "rgba(201,168,76,0.12)",
  goldBorder:  "rgba(201,168,76,0.30)",
  text:        "#F0EDE8",
  textSub:     "rgba(240,237,232,0.55)",
  textMuted:   "rgba(240,237,232,0.30)",
  dot:         "rgba(255,255,255,0.20)",
  exec:        "#8B96CC",
  execBg:      "rgba(139,150,204,0.10)",
  execBorder:  "rgba(139,150,204,0.25)",
  luxury:      "#C9A84C",
  luxuryBg:    "rgba(201,168,76,0.10)",
  luxuryBorder:"rgba(201,168,76,0.25)",
};

const TOTAL_STEPS = 5;

// ── Types ─────────────────────────────────────────────────────────────────────

interface OnboardingProps {
  onComplete: (name?: string) => void;
  onSkip: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function OnboardingScreen({ onComplete, onSkip }: OnboardingProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [micGranted, setMicGranted] = useState<boolean | null>(null);
  const [inputFocused, setInputFocused] = useState(false);

  // Slide animation
  const slideX = useRef(new Animated.Value(0)).current;
  const SLIDE_OFFSET = 340;

  const goToStep = useCallback((next: number) => {
    const dir = next > step ? 1 : -1;
    Haptics.selectionAsync();
    // Slide out current step
    Animated.timing(slideX, {
      toValue: -dir * SLIDE_OFFSET,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setStep(next);
      // Slide in next step from opposite side
      slideX.setValue(dir * SLIDE_OFFSET);
      Animated.timing(slideX, {
        toValue: 0,
        duration: 240,
        useNativeDriver: true,
      }).start();
    });
  }, [step, slideX]);

  const handleNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) goToStep(step + 1);
  }, [step, goToStep]);

  const handleBack = useCallback(() => {
    if (step > 0) goToStep(step - 1);
  }, [step, goToStep]);

  const handleRequestMic = useCallback(async () => {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      setMicGranted(granted);
      if (granted) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => goToStep(step + 1), 600);
      }
    } catch {
      setMicGranted(false);
    }
  }, [step, goToStep]);

  const handleComplete = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete(name.trim() || undefined);
  }, [name, onComplete]);

  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  return (
    <KeyboardAvoidingView
      style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Top bar: back + dots + skip */}
      <View style={s.topBar}>
        {step > 0 ? (
          <Pressable onPress={handleBack} style={s.backBtn} hitSlop={12}>
            <Feather name="chevron-left" size={22} color={C.textSub} />
          </Pressable>
        ) : (
          <View style={s.backBtn} />
        )}

        <View style={s.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[s.dot, i === step && s.dotActive]}
            />
          ))}
        </View>

        {step === 0 ? (
          <Pressable onPress={handleSkip} style={s.skipBtn} hitSlop={12}>
            <Text style={s.skipText}>Skip</Text>
          </Pressable>
        ) : (
          <View style={s.skipBtn} />
        )}
      </View>

      {/* Content */}
      <Animated.View style={[s.content, { transform: [{ translateX: slideX }] }]}>
        {step === 0 && <StepWelcome />}
        {step === 1 && <StepModes />}
        {step === 2 && (
          <StepMicrophone
            micGranted={micGranted}
            onRequest={handleRequestMic}
          />
        )}
        {step === 3 && (
          <StepPersonalize
            name={name}
            onChangeName={setName}
            focused={inputFocused}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
          />
        )}
        {step === 4 && <StepReady name={name} />}
      </Animated.View>

      {/* Bottom CTA */}
      <View style={s.bottomBar}>
        {step === 2 && micGranted !== true ? (
          <View style={s.ctaStack}>
            <Pressable
              onPress={handleRequestMic}
              style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPressed]}
            >
              <Text style={s.ctaPrimaryText}>Allow Microphone</Text>
            </Pressable>
            <Pressable onPress={handleNext} style={s.ctaGhost}>
              <Text style={s.ctaGhostText}>Skip for now</Text>
            </Pressable>
          </View>
        ) : step === 3 ? (
          <View style={s.ctaStack}>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                if (name.trim()) {
                  AsyncStorage.setItem("@mo/user_name", name.trim()).catch(() => {});
                }
                handleNext();
              }}
              style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPressed]}
            >
              <Text style={s.ctaPrimaryText}>
                {name.trim() ? `Continue as ${name.trim().split(" ")[0]}` : "Continue"}
              </Text>
            </Pressable>
            {!name.trim() && (
              <Pressable onPress={handleNext} style={s.ctaGhost}>
                <Text style={s.ctaGhostText}>Skip</Text>
              </Pressable>
            )}
          </View>
        ) : step === 4 ? (
          <Pressable
            onPress={handleComplete}
            style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPressed]}
          >
            <Text style={s.ctaPrimaryText}>Begin</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [s.ctaPrimary, pressed && s.ctaPressed]}
          >
            <Text style={s.ctaPrimaryText}>Continue</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Step components ───────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <View style={s.step}>
      <Text style={s.wordmark}>Mo.</Text>
      <Text style={s.tagline}>Your luxury AI companion</Text>
      <Text style={s.body}>
        Speak naturally to plan your day, manage tasks, and access a personal
        concierge — all through your voice.
      </Text>
      <View style={s.divider} />
      <Text style={s.footnote}>No login required. Your content stays on your device.</Text>
    </View>
  );
}

function StepModes() {
  return (
    <View style={s.step}>
      <Text style={s.stepTitle}>Three Ways to Work</Text>
      <Text style={s.stepSubtitle}>Swipe between modes at any time.</Text>

      <View style={s.modeCards}>
        <View style={[s.modeCard, s.modeCardFree]}>
          <Text style={s.modeCardLabel}>Daily</Text>
          <Text style={s.modeCardDesc}>Your everyday assistant. Notes, tasks, reminders, and natural conversation.</Text>
          <Text style={s.modeCardPrice}>Free</Text>
        </View>
        <View style={[s.modeCard, s.modeCardExec]}>
          <Text style={[s.modeCardLabel, { color: C.exec }]}>Executive</Text>
          <Text style={s.modeCardDesc}>Professional advisor. Structured, precise, and always composed.</Text>
          <Text style={[s.modeCardPrice, { color: C.exec }]}>$49.99 / mo</Text>
        </View>
        <View style={[s.modeCard, s.modeCardLuxury]}>
          <Text style={[s.modeCardLabel, { color: C.luxury }]}>Luxury</Text>
          <Text style={s.modeCardDesc}>Elite concierge. Travel, dining, and lifestyle — impeccably arranged.</Text>
          <Text style={[s.modeCardPrice, { color: C.luxury }]}>$99.99 / mo</Text>
        </View>
      </View>
    </View>
  );
}

function StepMicrophone({
  micGranted,
  onRequest,
}: {
  micGranted: boolean | null;
  onRequest: () => void;
}) {
  return (
    <View style={s.step}>
      <Text style={s.stepTitle}>Mo Listens</Text>
      <Text style={s.stepSubtitle}>For voice input, Mo needs microphone access.</Text>

      <View style={s.micCard}>
        <View style={[s.micIcon, micGranted === true && s.micIconGranted]}>
          <Feather
            name={micGranted === true ? "check" : "mic"}
            size={28}
            color={micGranted === true ? C.bg : C.gold}
          />
        </View>
        <Text style={s.micCardText}>
          {micGranted === true
            ? "Microphone access granted."
            : "Your audio is processed securely to generate responses and is never stored on our servers."}
        </Text>
      </View>

      {micGranted === false && (
        <Text style={s.micDenied}>
          Permission denied. You can enable microphone access later in your device Settings.
        </Text>
      )}
      {micGranted === null && (
        <Text style={s.footnote}>Text input is always available as an alternative.</Text>
      )}
    </View>
  );
}

function StepPersonalize({
  name, onChangeName, focused, onFocus, onBlur,
}: {
  name: string;
  onChangeName: (t: string) => void;
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
}) {
  return (
    <View style={s.step}>
      <Text style={s.stepTitle}>What should{"\n"}Mo call you?</Text>
      <Text style={s.stepSubtitle}>Mo will use your name when greeting you.</Text>

      <View style={[s.nameInputWrap, focused && s.nameInputFocused]}>
        <TextInput
          style={s.nameInput}
          value={name}
          onChangeText={onChangeName}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Your name"
          placeholderTextColor={C.textMuted}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          maxLength={40}
        />
      </View>
    </View>
  );
}

function StepReady({ name }: { name: string }) {
  const first = name.trim() ? name.trim().split(" ")[0] : null;
  return (
    <View style={s.step}>
      <Text style={s.wordmark}>Ready.</Text>
      <Text style={s.tagline}>
        {first ? `Welcome, ${first}.` : "Your assistant is ready."}
      </Text>
      <Text style={s.body}>
        Swipe between Daily, Executive, and Luxury modes at any time. Tap the
        microphone to speak, or type in the input bar.
      </Text>
      <View style={s.divider} />
      <Text style={s.footnote}>Everything you create stays private on your device.</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  skipBtn: { width: 48, alignItems: "flex-end", justifyContent: "center", paddingVertical: 10 },
  skipText: { fontFamily: "DMSans_300Light", fontSize: 14, color: C.textMuted },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: C.dot },
  dotActive: { backgroundColor: C.gold, width: 18 },

  content: { flex: 1 },

  step: {
    flex: 1,
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 16,
  },

  // Welcome / Ready
  wordmark: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 72,
    color: C.gold,
    lineHeight: 80,
    letterSpacing: 2,
  },
  tagline: {
    fontFamily: "CormorantGaramond_400Regular",
    fontSize: 22,
    color: C.text,
    marginTop: 4,
    lineHeight: 30,
  },
  body: {
    fontFamily: "DMSans_300Light",
    fontSize: 16,
    color: C.textSub,
    lineHeight: 26,
    marginTop: 20,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: 24,
  },
  footnote: {
    fontFamily: "DMSans_300Light",
    fontSize: 13,
    color: C.textMuted,
    lineHeight: 20,
  },

  // Step headers
  stepTitle: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 34,
    color: C.text,
    lineHeight: 42,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontFamily: "DMSans_300Light",
    fontSize: 15,
    color: C.textSub,
    lineHeight: 22,
    marginBottom: 32,
  },

  // Mode cards
  modeCards: { gap: 10 },
  modeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    padding: 16,
    gap: 4,
  },
  modeCardFree: {},
  modeCardExec: {
    borderColor: C.execBorder,
    backgroundColor: C.execBg,
  },
  modeCardLuxury: {
    borderColor: C.luxuryBorder,
    backgroundColor: C.luxuryBg,
  },
  modeCardLabel: {
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: C.text,
  },
  modeCardDesc: {
    fontFamily: "DMSans_300Light",
    fontSize: 13,
    color: C.textSub,
    lineHeight: 19,
  },
  modeCardPrice: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: C.textMuted,
    marginTop: 4,
  },

  // Mic step
  micCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.goldBorder,
    backgroundColor: C.goldSoft,
    padding: 20,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  micIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: C.goldBorder,
    backgroundColor: "rgba(201,168,76,0.08)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  micIconGranted: {
    backgroundColor: C.gold,
    borderColor: C.gold,
  },
  micCardText: {
    flex: 1,
    fontFamily: "DMSans_300Light",
    fontSize: 14,
    color: C.textSub,
    lineHeight: 21,
  },
  micDenied: {
    fontFamily: "DMSans_300Light",
    fontSize: 13,
    color: "rgba(239,68,68,0.7)",
    marginTop: 14,
    lineHeight: 19,
  },

  // Personalize
  nameInputWrap: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 10,
    marginTop: 8,
  },
  nameInputFocused: {
    borderBottomColor: C.gold,
  },
  nameInput: {
    fontFamily: "CormorantGaramond_400Regular",
    fontSize: 32,
    color: C.text,
    padding: 0,
  },

  // Bottom CTA
  bottomBar: {
    paddingHorizontal: 28,
    paddingBottom: 16,
    paddingTop: 8,
  },
  ctaStack: { gap: 12 },
  ctaPrimary: {
    backgroundColor: C.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaPressed: { opacity: 0.85 },
  ctaPrimaryText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    color: "#000000",
    letterSpacing: 0.5,
  },
  ctaGhost: {
    alignItems: "center",
    paddingVertical: 10,
  },
  ctaGhostText: {
    fontFamily: "DMSans_300Light",
    fontSize: 14,
    color: C.textMuted,
  },
});
