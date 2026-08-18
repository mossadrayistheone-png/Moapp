import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
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
  SettingsNavRow,
  SettingsSection,
  SettingsToggle,
} from "@/components/SettingsRow";
import Colors from "@/constants/colors";
import { UtilityTheme } from "@/constants/themes";
import { useApp, type ResponseLength } from "@/context/AppContext";
import type { AssistantMode } from "@/hooks/use-voice";
import { useSubscription } from "@/lib/revenuecat";

const MODES: { key: AssistantMode; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "executive", label: "Executive" },
  { key: "luxury", label: "Luxury" },
];

const LENGTHS: { key: ResponseLength; label: string }[] = [
  { key: "short", label: "Brief" },
  { key: "medium", label: "Balanced" },
  { key: "long", label: "Detailed" },
];

const TIER_LABELS: Record<string, string> = {
  free:      "Free",
  executive: "Executive",
  luxury:    "Luxury",
};

/**
 * Formats a renewal/expiry date as a sublabel string.
 * Uses "Renews" when the subscription will auto-renew, "Expires" when canceled.
 */
function formatRenewal(date: Date | null, willRenew: boolean | null): string | undefined {
  if (!date) return undefined;
  const formatted = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (willRenew ? "Renews " : "Expires ") + formatted;
}

async function openManageSubscriptions() {
  const url =
    Platform.OS === "ios"
      ? "itms-apps://apps.apple.com/account/subscriptions"
      : "https://play.google.com/store/account/subscriptions?package=com.mo.assistant";
  const supported = await Linking.canOpenURL(url);
  if (supported) Linking.openURL(url);
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { preferences, updatePreferences, clearHistory } = useApp();
  const {
    activeTier,
    renewalDate,
    willRenew,
    isConfigured,
    isLoading: subLoading,
    restore,
    isRestoring,
  } = useSubscription();

  const handleClearHistory = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    clearHistory();
  };

  const handleRestore = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await restore();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // silent — RevenueCat shows its own error UI
    }
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

        {/* Subscription */}
        <SettingsSection title="Subscription">
          {/* Active tier badge row */}
          <View style={[sub.row, sub.border]}>
            <View style={sub.textBlock}>
              <Text style={sub.label}>Plan</Text>
              {formatRenewal(renewalDate, willRenew) ? (
                <Text style={sub.sublabel}>
                  {formatRenewal(renewalDate, willRenew)}
                </Text>
              ) : null}
            </View>
            {subLoading && isConfigured ? (
              <ActivityIndicator size="small" color={Colors.gold} />
            ) : (
              <View style={[
                sub.badge,
                activeTier === "luxury"    && sub.badgeLuxury,
                activeTier === "executive" && sub.badgeExec,
              ]}>
                <Text style={[
                  sub.badgeText,
                  (activeTier === "luxury" || activeTier === "executive") && sub.badgeTextPaid,
                ]}>
                  {TIER_LABELS[activeTier] ?? "Free"}
                </Text>
              </View>
            )}
          </View>

          {/* Restore purchases — disabled when RevenueCat is not configured */}
          <Pressable
            onPress={handleRestore}
            disabled={isRestoring || !isConfigured}
            style={({ pressed }) => [
              sub.row,
              sub.border,
              { opacity: pressed || isRestoring || !isConfigured ? 0.5 : 1 },
            ]}
          >
            <Text style={sub.label}>Restore Purchases</Text>
            {isRestoring
              ? <ActivityIndicator size="small" color={Colors.mutedWhite} />
              : <Feather name="refresh-cw" size={15} color={Colors.mutedWhite} />}
          </Pressable>

          {/* Manage subscription (only when paid and configured) */}
          {activeTier !== "free" && isConfigured ? (
            <SettingsNavRow
              label="Manage Subscription"
              sublabel="Cancel or change plan in the store"
              onPress={openManageSubscriptions}
              last
            />
          ) : (
            <View style={sub.row}>
              <Text style={sub.sublabel}>
                {isConfigured
                  ? "Upgrade to Executive or Luxury from the main screen"
                  : "Subscriptions available in production build"}
              </Text>
            </View>
          )}
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
          <SettingsNavRow
            label="Privacy Policy"
            sublabel="How Mo handles your data"
            onPress={() => {
              const domain = process.env.EXPO_PUBLIC_DOMAIN;
              const url = domain
                ? `https://${domain}/privacy-policy.html`
                : "https://mo.app/privacy-policy";
              Linking.openURL(url).catch(() => {});
            }}
          />
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
          <Text style={styles.aboutText}>Mo</Text>
          <Text style={styles.aboutVersion}>Version 1.0</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const sub = StyleSheet.create({
  row: {
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
    lineHeight: 17,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: UtilityTheme.chipBorder,
    backgroundColor: "transparent",
  },
  badgeExec: {
    borderColor: "rgba(139,150,204,0.5)",
    backgroundColor: "rgba(139,150,204,0.10)",
  },
  badgeLuxury: {
    borderColor: "rgba(201,168,76,0.5)",
    backgroundColor: "rgba(201,168,76,0.10)",
  },
  badgeText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: Colors.mutedWhite,
  },
  badgeTextPaid: {
    color: Colors.gold,
  },
});

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
