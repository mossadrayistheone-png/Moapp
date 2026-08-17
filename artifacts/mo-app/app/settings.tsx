import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SettingsChoice,
  SettingsInput,
  SettingsSection,
  SettingsToggle,
} from "@/components/SettingsRow";
import Colors from "@/constants/colors";
import { UtilityTheme } from "@/constants/themes";
import { useApp, type ResponseLength } from "@/context/AppContext";
import type { AssistantMode } from "@/hooks/use-voice";

const MODES: { key: AssistantMode; label: string }[] = [
  { key: "executive", label: "Executive" },
  { key: "creative", label: "Creative" },
  { key: "motivational", label: "Motivational" },
  { key: "planner", label: "Planner" },
];

const LENGTHS: { key: ResponseLength; label: string }[] = [
  { key: "short", label: "Brief" },
  { key: "medium", label: "Balanced" },
  { key: "long", label: "Detailed" },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { preferences, updatePreferences, clearHistory } = useApp();

  const handleClearHistory = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    clearHistory();
  };

  return (
    <View style={[styles.root]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12 },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={20} color={Colors.gold} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile */}
        <SettingsSection title="Your Profile">
          <SettingsInput
            label="Name"
            value={preferences.name}
            onChangeText={(t) => updatePreferences({ name: t })}
            placeholder="How should Mo address you?"
          />
          <SettingsInput
            label="Location"
            value={preferences.location}
            onChangeText={(t) => updatePreferences({ location: t })}
            placeholder="City for weather lookups"
          />
          <SettingsInput
            label="Timezone"
            value={preferences.timezone}
            onChangeText={(t) => updatePreferences({ timezone: t })}
            placeholder="e.g. America/New_York"
            last
          />
        </SettingsSection>

        {/* Assistant */}
        <SettingsSection title="Assistant">
          <SettingsChoice
            label="Default mode"
            options={MODES}
            value={preferences.defaultMode}
            onChange={(v) => updatePreferences({ defaultMode: v })}
          />
          <SettingsChoice
            label="Response length"
            options={LENGTHS}
            value={preferences.responseLength}
            onChange={(v) => updatePreferences({ responseLength: v })}
          />
          <SettingsToggle
            label="Auto-play responses"
            sublabel="Mo speaks immediately after answering"
            value={preferences.autoplay}
            onValueChange={(v) => updatePreferences({ autoplay: v })}
            last
          />
        </SettingsSection>

        {/* Display */}
        <SettingsSection title="Display">
          <SettingsToggle
            label="Background video"
            sublabel="Disable to save battery and data"
            value={preferences.backgroundEnabled}
            onValueChange={(v) => updatePreferences({ backgroundEnabled: v })}
            last
          />
        </SettingsSection>

        {/* Data */}
        <SettingsSection title="Privacy">
          <Pressable
            onPress={handleClearHistory}
            style={({ pressed }) => [
              styles.dangerRow,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Feather name="trash-2" size={15} color="#e05252" />
            <Text style={styles.dangerText}>Clear conversation memory</Text>
          </Pressable>
        </SettingsSection>

        {/* About */}
        <View style={styles.about}>
          <Text style={styles.aboutText}>Mo · Executive Assistant</Text>
          <Text style={styles.aboutVersion}>Version 1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: UtilityTheme.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: UtilityTheme.divider,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 22,
    color: Colors.gold,
    letterSpacing: 1,
  },
  scroll: {
    padding: 20,
    paddingTop: 28,
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dangerText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 15,
    color: "#e05252",
  },
  about: {
    alignItems: "center",
    gap: 4,
    marginTop: 12,
  },
  aboutText: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 14,
    color: Colors.mutedWhite,
  },
  aboutVersion: {
    fontFamily: "DMSans_300Light",
    fontSize: 11,
    color: UtilityTheme.textMuted,
    letterSpacing: 1,
  },
});
