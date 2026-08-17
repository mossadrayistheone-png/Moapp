/**
 * Theme-aware accordion for tappable prompt categories.
 * Used in all three mode screens with different visual styles.
 */

import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { PromptCategory } from "@/constants/prompts";

export interface AccordionColors {
  headerBg:       string;
  headerBorder:   string;
  headerText:     string;
  headerTextSub:  string;
  headerIcon:     string;
  itemBg:         string;
  itemBorder:     string;
  itemText:       string;
  showMoreText:   string;
  chevron:        string;
  divider:        string;
}

interface PromptAccordionProps {
  categories:        PromptCategory[];
  colors:            AccordionColors;
  expandedId:        string | null;
  onToggle:          (id: string) => void;
  onSelectPrompt:    (text: string) => void;
  categoryFontFamily?:string;
  promptFontFamily?: string;
  headerRadius?:     number;
}

// ── Single accordion item ─────────────────────────────────────────────────────

interface AccordionItemProps {
  category:          PromptCategory;
  isExpanded:        boolean;
  colors:            AccordionColors;
  onToggle:          () => void;
  onSelectPrompt:    (text: string) => void;
  categoryFontFamily:string;
  promptFontFamily:  string;
  headerRadius:      number;
}

function AccordionItem({
  category,
  isExpanded,
  colors,
  onToggle,
  onSelectPrompt,
  categoryFontFamily,
  promptFontFamily,
  headerRadius,
}: AccordionItemProps) {
  const [showMore, setShowMore] = useState(false);
  const heightAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  const handleToggle = useCallback(() => {
    Haptics.selectionAsync();
    Animated.timing(heightAnim, {
      toValue: isExpanded ? 0 : 1,
      duration: 260,
      useNativeDriver: false,
    }).start();
    onToggle();
    if (isExpanded) setShowMore(false); // collapse resets "show more"
  }, [isExpanded, heightAnim, onToggle]);

  const handlePromptPress = useCallback(
    (text: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onSelectPrompt(text);
    },
    [onSelectPrompt]
  );

  const visiblePrompts = showMore
    ? [...category.prompts, ...category.morePrompts]
    : category.prompts;

  const contentHeight = visiblePrompts.length * 52 +
    (category.morePrompts.length > 0 ? 44 : 0) + 12;

  const maxHeight = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, showMore ? contentHeight + 60 : contentHeight],
    extrapolate: "clamp",
  });

  const chevronRotation = heightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <View style={styles.item}>
      {/* Header */}
      <Pressable
        onPress={handleToggle}
        style={({ pressed }) => [
          styles.header,
          {
            backgroundColor: colors.headerBg,
            borderColor: colors.headerBorder,
            borderRadius: isExpanded ? headerRadius : headerRadius,
            borderBottomLeftRadius: isExpanded ? 0 : headerRadius,
            borderBottomRightRadius: isExpanded ? 0 : headerRadius,
            opacity: pressed ? 0.82 : 1,
          },
        ]}
      >
        <Text style={[styles.headerIcon, { color: colors.headerIcon }]}>
          {category.icon}
        </Text>
        <Text
          style={[
            styles.headerText,
            { color: colors.headerText, fontFamily: categoryFontFamily },
          ]}
        >
          {category.title}
        </Text>
        <Animated.Text
          style={[
            styles.chevron,
            { color: colors.chevron, transform: [{ rotate: chevronRotation }] },
          ]}
        >
          ▾
        </Animated.Text>
      </Pressable>

      {/* Content */}
      <Animated.View
        style={[
          styles.content,
          {
            maxHeight,
            backgroundColor: colors.itemBg,
            borderColor: colors.itemBorder,
            borderTopWidth: 0,
            borderRadius: headerRadius,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          },
        ]}
      >
        {visiblePrompts.map((prompt, i) => (
          <Pressable
            key={i}
            onPress={() => handlePromptPress(prompt)}
            style={({ pressed }) => [
              styles.promptRow,
              i > 0 && { borderTopWidth: 1, borderTopColor: colors.divider },
              pressed && { opacity: 0.65 },
            ]}
          >
            <Text
              style={[
                styles.promptText,
                { color: colors.itemText, fontFamily: promptFontFamily },
              ]}
              numberOfLines={2}
            >
              {prompt}
            </Text>
            <Text style={[styles.promptArrow, { color: colors.showMoreText }]}>→</Text>
          </Pressable>
        ))}

        {category.morePrompts.length > 0 && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setShowMore((v) => !v);
              // Expand the animation further when showing more
              Animated.timing(heightAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: false,
              }).start();
            }}
            style={[
              styles.showMoreRow,
              { borderTopWidth: 1, borderTopColor: colors.divider },
            ]}
          >
            <Text style={[styles.showMoreText, { color: colors.showMoreText }]}>
              {showMore ? "Show Less" : `Show ${category.morePrompts.length} More`}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

// ── Main accordion ────────────────────────────────────────────────────────────

export function PromptAccordion({
  categories,
  colors,
  expandedId,
  onToggle,
  onSelectPrompt,
  categoryFontFamily = "DMSans_500Medium",
  promptFontFamily = "DMSans_400Regular",
  headerRadius = 14,
}: PromptAccordionProps) {
  return (
    <View style={styles.root}>
      {categories.map((cat) => (
        <AccordionItem
          key={cat.id}
          category={cat}
          isExpanded={expandedId === cat.id}
          colors={colors}
          onToggle={() => onToggle(cat.id)}
          onSelectPrompt={onSelectPrompt}
          categoryFontFamily={categoryFontFamily}
          promptFontFamily={promptFontFamily}
          headerRadius={headerRadius}
        />
      ))}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { gap: 8 },

  item: {},

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 10,
    minHeight: 52,
  },
  headerIcon: {
    fontSize: 14,
    width: 20,
    textAlign: "center",
  },
  headerText: {
    flex: 1,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  chevron: {
    fontSize: 14,
    width: 20,
    textAlign: "center",
  },

  content: {
    overflow: "hidden",
    borderWidth: 1,
  },

  promptRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
    gap: 10,
  },
  promptText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  promptArrow: {
    fontSize: 14,
  },

  showMoreRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  showMoreText: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "DMSans_400Regular",
  },
});
