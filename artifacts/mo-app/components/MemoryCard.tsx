import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import type { MemoryItem } from "@/context/AppContext";

// Category config
const CATEGORY_CONFIG: Record<
  MemoryItem["category"],
  { label: string; color: string; icon: string }
> = {
  personal: { label: "Personal", color: "#C9A84C", icon: "user" },
  preferences: { label: "Preferences", color: "#7EB8C4", icon: "sliders" },
  schedule: { label: "Schedule", color: "#A08CE8", icon: "clock" },
  goals: { label: "Goals", color: "#7EC48C", icon: "target" },
};

export function MemoryCard({
  item,
  onDelete,
}: {
  item: MemoryItem;
  onDelete: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const config = CATEGORY_CONFIG[item.category];

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onDelete(item.id));
  };

  return (
    <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
      {/* Category pill */}
      <View style={[styles.categoryPill, { backgroundColor: `${config.color}18`, borderColor: `${config.color}35` }]}>
        <Feather name={config.icon as any} size={10} color={config.color} />
        <Text style={[styles.categoryText, { color: config.color }]}>
          {config.label}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.body}>
        <Text style={styles.key}>{item.key}</Text>
        <Text style={styles.value}>{item.value}</Text>
      </View>

      {/* Delete */}
      <Pressable
        onPress={handleDelete}
        hitSlop={12}
        style={({ pressed }) => [styles.deleteBtn, { opacity: pressed ? 0.5 : 0.55 }]}
      >
        <Feather name="x" size={14} color={Colors.mutedWhite} />
      </Pressable>
    </Animated.View>
  );
}

// Group cards by category for the list view
export function MemoryCategorySection({
  category,
  items,
  onDelete,
}: {
  category: MemoryItem["category"];
  items: MemoryItem[];
  onDelete: (id: string) => void;
}) {
  const config = CATEGORY_CONFIG[category];

  return (
    <View style={section.container}>
      <View style={section.header}>
        <View style={[section.dot, { backgroundColor: config.color }]} />
        <Text style={[section.title, { color: config.color }]}>
          {config.label}
        </Text>
        <Text style={section.count}>
          {items.length} {items.length === 1 ? "fact" : "facts"}
        </Text>
      </View>
      {items.map((item) => (
        <MemoryCard key={item.id} item={item} onDelete={onDelete} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryText: {
    fontFamily: "DMSans_300Light",
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  body: {
    flex: 1,
    gap: 2,
  },
  key: {
    fontFamily: "DMSans_300Light",
    fontSize: 10,
    color: Colors.mutedWhite,
    letterSpacing: 0.5,
    textTransform: "lowercase",
  },
  value: {
    fontFamily: "DMSans_500Medium",
    fontSize: 15,
    color: Colors.white,
    lineHeight: 20,
  },
  deleteBtn: {
    padding: 4,
  },
});

const section = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  title: {
    fontFamily: "DMSans_500Medium",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    flex: 1,
  },
  count: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: Colors.mutedWhite,
  },
});
