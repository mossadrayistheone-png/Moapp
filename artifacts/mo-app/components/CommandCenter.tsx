/**
 * CommandCenter — expandable prompt-discovery panel
 *
 * Layout (column, bottom of screen):
 *   ┌──────────────────────────────────┐  ← panel (animated height, 0 when closed)
 *   │ ☀ Daily Life                     │
 *   │   "What's on my schedule today?" │  ← expanded category prompts
 *   │   "Help me plan my day."         │
 *   │ 🌿 Health & Wellness             │
 *   │ 🏠 Home                          │
 *   │ ✦ Creativity                    │
 *   └──────────────────────────────────┘
 *   ┌──────────────────────────────────┐  ← handle (always visible, toggles panel)
 *   │  COMMAND CENTER             ∧   │
 *   └──────────────────────────────────┘
 *
 * Tapping a prompt calls onSelectPrompt and collapses the panel.
 * Only one category is open at a time.
 */

import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import type { PromptCategory } from "@/constants/prompts";

// ── Public colour contract ────────────────────────────────────────────────────

export interface CommandCenterColors {
  // Handle (trigger row)
  handleBg: string;
  handleBorder: string;
  handleText: string;
  handleChevron: string;
  // Panel
  panelBg: string;
  panelBorder: string;
  // Categories
  catText: string;
  catIconColor: string;
  catActiveBg: string;
  catBorder: string;
  // Prompts
  promptText: string;
  promptBg: string;
  promptBorder: string;
  promptArrow: string;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface CommandCenterProps {
  categories: PromptCategory[];
  colors: CommandCenterColors;
  label?: string;
  onSelectPrompt: (text: string) => void;
  categoryFontFamily?: string;
  promptFontFamily?: string;
  /** Max expanded height in px (default 296) */
  maxHeight?: number;
  /** Extra bottom padding so the handle clears the input bar margin */
  bottomSpacing?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandCenter({
  categories,
  colors,
  label = "Command Center",
  onSelectPrompt,
  categoryFontFamily = "DMSans_500Medium",
  promptFontFamily   = "DMSans_400Regular",
  maxHeight          = 296,
  bottomSpacing      = 0,
}: CommandCenterProps) {
  const [isOpen, setIsOpen]     = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);

  const panelAnim   = useRef(new Animated.Value(0)).current;
  const chevronAnim = useRef(new Animated.Value(0)).current;

  const animateTo = useCallback((open: boolean) => {
    const dur = open ? 300 : 240;
    Animated.parallel([
      Animated.timing(panelAnim, {
        toValue: open ? 1 : 0,
        duration: dur,
        easing: open ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(chevronAnim, {
        toValue: open ? 1 : 0,
        duration: dur,
        useNativeDriver: true,
      }),
    ]).start();
    setIsOpen(open);
    if (!open) setActiveCat(null);
  }, [panelAnim, chevronAnim]);

  const togglePanel = () => {
    Haptics.selectionAsync();
    animateTo(!isOpen);
  };

  const toggleCat = (id: string) => {
    Haptics.selectionAsync();
    setActiveCat(prev => (prev === id ? null : id));
  };

  const handleSelect = useCallback((text: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelectPrompt(text);
    animateTo(false);
  }, [onSelectPrompt, animateTo]);

  const animatedPanelHeight = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, maxHeight],
  });

  const chevronRotate = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={[s.root, { paddingBottom: bottomSpacing }]}>

      {/* ── Expanded panel ── */}
      <Animated.View
        style={[
          s.panel,
          {
            height: animatedPanelHeight,
            backgroundColor: colors.panelBg,
            borderColor: colors.panelBorder,
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {categories.map((cat) => (
            <View key={cat.id}>
              {/* Category row */}
              <Pressable
                style={[
                  s.catRow,
                  {
                    backgroundColor:
                      activeCat === cat.id ? colors.catActiveBg : "transparent",
                    borderBottomColor: colors.catBorder,
                  },
                ]}
                onPress={() => toggleCat(cat.id)}
              >
                <Text style={[s.catIcon, { color: colors.catIconColor }]}>
                  {cat.icon}
                </Text>
                <Text
                  style={[
                    s.catText,
                    { color: colors.catText, fontFamily: categoryFontFamily },
                  ]}
                >
                  {cat.title}
                </Text>
                <Text style={[s.catToggle, { color: colors.handleChevron }]}>
                  {activeCat === cat.id ? "−" : "+"}
                </Text>
              </Pressable>

              {/* Prompt list (one category at a time) */}
              {activeCat === cat.id && (
                <View style={[s.promptBlock, { borderBottomColor: colors.catBorder }]}>
                  {[...cat.prompts, ...cat.morePrompts].slice(0, 6).map((p, i) => (
                    <Pressable
                      key={i}
                      style={[
                        s.promptRow,
                        {
                          backgroundColor: colors.promptBg,
                          borderColor: colors.promptBorder,
                        },
                      ]}
                      onPress={() => handleSelect(p)}
                    >
                      <Text
                        style={[
                          s.promptText,
                          { color: colors.promptText, fontFamily: promptFontFamily },
                        ]}
                        numberOfLines={2}
                      >
                        {p}
                      </Text>
                      <Text style={[s.promptArrow, { color: colors.promptArrow }]}>
                        →
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      {/* ── Handle row (always visible) ── */}
      <Pressable
        style={[
          s.handle,
          {
            backgroundColor: colors.handleBg,
            borderColor: colors.handleBorder,
            borderTopWidth: isOpen ? 0 : 1,
            borderTopLeftRadius: isOpen ? 0 : 14,
            borderTopRightRadius: isOpen ? 0 : 14,
          },
        ]}
        onPress={togglePanel}
      >
        <Text style={[s.handleLabel, { color: colors.handleText }]}>
          {label}
        </Text>
        <Animated.Text
          style={[
            s.handleChevron,
            { color: colors.handleChevron },
            { transform: [{ rotate: chevronRotate }] },
          ]}
        >
          ∧
        </Animated.Text>
      </Pressable>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    marginHorizontal: 12,
    marginBottom: 6,
  },

  // Expandable panel
  panel: {
    overflow: "hidden",
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  catIcon: {
    fontSize: 14,
    width: 22,
    textAlign: "center",
  },
  catText: {
    flex: 1,
    fontSize: 14,
    letterSpacing: 0.1,
  },
  catToggle: {
    fontSize: 20,
    lineHeight: 22,
    width: 22,
    textAlign: "center",
  },

  promptBlock: {
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 10,
    gap: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  promptRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    gap: 8,
  },
  promptText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  promptArrow: {
    fontSize: 13,
  },

  // Handle (trigger)
  handle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderWidth: 1,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  handleLabel: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "DMSans_500Medium",
  },
  handleChevron: {
    fontSize: 15,
    lineHeight: 18,
  },
});
