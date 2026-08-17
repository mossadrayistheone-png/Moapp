import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Colors from "@/constants/colors";
import { UtilityTheme } from "@/constants/themes";

// ── Section header ────────────────────────────────────────────────────────────

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={section.container}>
      <Text style={section.title}>{title}</Text>
      <View style={section.card}>{children}</View>
    </View>
  );
}

const section = StyleSheet.create({
  container: { marginBottom: 32 },
  title: {
    fontFamily: "DMSans_300Light",
    fontSize: 10,
    color: Colors.mutedWhite,
    letterSpacing: 3,
    textTransform: "uppercase",
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: UtilityTheme.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UtilityTheme.cardBorder,
    overflow: "hidden",
  },
});

// ── Toggle row ────────────────────────────────────────────────────────────────

export function SettingsToggle({
  label,
  sublabel,
  value,
  onValueChange,
  last,
}: {
  label: string;
  sublabel?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[row.container, !last && row.border]}>
      <View style={row.textBlock}>
        <Text style={row.label}>{label}</Text>
        {sublabel ? <Text style={row.sublabel}>{sublabel}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: "rgba(255,255,255,0.1)", true: Colors.gold }}
        thumbColor={Colors.white}
        ios_backgroundColor="rgba(255,255,255,0.1)"
      />
    </View>
  );
}

// ── Choice row (single-select options) ───────────────────────────────────────

export function SettingsChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  last,
}: {
  label: string;
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  last?: boolean;
}) {
  return (
    <View style={[row.container, !last && row.border, { flexWrap: "wrap", gap: 8 }]}>
      <Text style={[row.label, { flex: 1 }]}>{label}</Text>
      <View style={choice.optionsRow}>
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <Pressable
              key={opt.key}
              onPress={() => onChange(opt.key)}
              style={({ pressed }) => [
                choice.chip,
                active && choice.chipActive,
                { opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text
                style={[
                  choice.chipText,
                  active && choice.chipTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const choice = StyleSheet.create({
  optionsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UtilityTheme.chipBorder,
  },
  chipActive: {
    borderColor: Colors.gold,
    backgroundColor: "rgba(201,168,76,0.12)",
  },
  chipText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 12,
    color: Colors.mutedWhite,
  },
  chipTextActive: {
    color: Colors.gold,
  },
});

// ── Navigation row (tap to go somewhere) ─────────────────────────────────────

export function SettingsNavRow({
  label,
  sublabel,
  onPress,
  last,
}: {
  label: string;
  sublabel?: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        row.container,
        !last && row.border,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={row.textBlock}>
        <Text style={row.label}>{label}</Text>
        {sublabel ? <Text style={row.sublabel}>{sublabel}</Text> : null}
      </View>
      <Feather name="chevron-right" size={16} color={Colors.mutedWhite} />
    </Pressable>
  );
}

// ── Text input row ────────────────────────────────────────────────────────────

import { TextInput } from "react-native";

export function SettingsInput({
  label,
  value,
  onChangeText,
  placeholder,
  last,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  last?: boolean;
}) {
  return (
    <View style={[row.container, !last && row.border]}>
      <Text style={[row.label, { flex: 0, marginRight: 12, width: 80 }]}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? ""}
        placeholderTextColor="rgba(255,255,255,0.2)"
        style={input.field}
        selectionColor={Colors.gold}
        autoCorrect={false}
      />
    </View>
  );
}

const input = StyleSheet.create({
  field: {
    flex: 1,
    fontFamily: "DMSans_400Regular",
    fontSize: 14,
    color: Colors.white,
    textAlign: "right",
  },
});

// ── Shared row styles ─────────────────────────────────────────────────────────

const row = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UtilityTheme.divider,
  },
  textBlock: { flex: 1, gap: 2 },
  label: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: Colors.white,
    flex: 1,
  },
  sublabel: {
    fontFamily: "DMSans_300Light",
    fontSize: 12,
    color: Colors.mutedWhite,
    lineHeight: 16,
  },
});
