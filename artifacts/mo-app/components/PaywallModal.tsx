/**
 * PaywallModal — shown when a user tries to access Executive or Luxury mode
 * without the required subscription entitlement.
 *
 * Prices are always read live from RevenueCat offerings — never hardcoded.
 */

import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PurchasesPackage } from "react-native-purchases";

import Colors from "@/constants/colors";
import { UtilityTheme as T } from "@/constants/themes";
import {
  EXECUTIVE_PACKAGE_ID,
  LUXURY_PACKAGE_ID,
  useSubscription,
} from "@/lib/revenuecat";

interface PaywallModalProps {
  visible: boolean;
  mode: "executive" | "luxury";
  onDismiss: () => void;
}

const MODE_COPY = {
  executive: {
    title: "Executive",
    subtitle: "Your private advisor. Composed, precise, always on.",
    color: "#C9A85C",
    packageId: EXECUTIVE_PACKAGE_ID,
    entitlementLabel: "Executive",
  },
  luxury: {
    title: "Luxury",
    subtitle: "Elite concierge. Travel, dining, lifestyle — impeccably arranged.",
    color: "#9B7FCC",
    packageId: LUXURY_PACKAGE_ID,
    entitlementLabel: "Luxury",
  },
} as const;

export function PaywallModal({ visible, mode, onDismiss }: PaywallModalProps) {
  const insets = useSafeAreaInsets();
  const { offerings, purchase, restore, isPurchasing, isRestoring } = useSubscription();
  const [error, setError] = useState<string | null>(null);

  const copy = MODE_COPY[mode];

  // Find the right package from the current offering
  const currentOffering = offerings?.current;
  const pkg: PurchasesPackage | undefined =
    currentOffering?.availablePackages.find((p) => p.identifier === copy.packageId);

  const priceString = pkg?.product.priceString ?? "—";

  const handlePurchase = async () => {
    if (!pkg) return;
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await purchase(pkg);
      onDismiss();
    } catch (e: any) {
      if (e?.userCancelled) return;
      setError(e?.message ?? "Purchase failed. Please try again.");
    }
  };

  const handleRestore = async () => {
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await restore();
      onDismiss();
    } catch (e: any) {
      setError(e?.message ?? "Restore failed. Please try again.");
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          {/* Close */}
          <Pressable
            onPress={onDismiss}
            hitSlop={12}
            style={styles.closeButton}
          >
            <Feather name="x" size={20} color={T.textMuted} />
          </Pressable>

          {/* Mode badge */}
          <View style={[styles.badge, { borderColor: copy.color }]}>
            <Text style={[styles.badgeText, { color: copy.color }]}>
              {copy.title}
            </Text>
          </View>

          <Text style={styles.title}>{copy.subtitle}</Text>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{priceString}</Text>
            <Text style={styles.pricePer}> / month</Text>
          </View>

          {/* Features included */}
          {mode === "luxury" && (
            <Text style={styles.includes}>
              Includes everything in Executive
            </Text>
          )}

          {/* Error */}
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : null}

          {/* Subscribe CTA */}
          <Pressable
            onPress={handlePurchase}
            disabled={isPurchasing || !pkg}
            style={({ pressed }) => [
              styles.cta,
              { backgroundColor: copy.color, opacity: pressed || isPurchasing ? 0.75 : 1 },
            ]}
          >
            {isPurchasing ? (
              <ActivityIndicator color="#000" size="small" />
            ) : (
              <Text style={styles.ctaText}>
                Subscribe to {copy.title}
              </Text>
            )}
          </Pressable>

          {/* Restore */}
          <Pressable
            onPress={handleRestore}
            disabled={isRestoring}
            style={({ pressed }) => [styles.restoreButton, { opacity: pressed ? 0.5 : 1 }]}
          >
            {isRestoring ? (
              <ActivityIndicator color={T.textMuted} size="small" />
            ) : (
              <Text style={styles.restoreText}>Restore purchases</Text>
            )}
          </Pressable>

          {/* Back to Daily */}
          <Pressable onPress={onDismiss} style={styles.backButton}>
            <Text style={styles.backText}>Continue with Daily (free)</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: T.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 28,
    paddingHorizontal: 28,
    alignItems: "center",
  },
  closeButton: {
    position: "absolute",
    top: 16,
    right: 20,
    padding: 4,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 4,
    marginBottom: 16,
  },
  badgeText: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 14,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: "CormorantGaramond_400Regular_Italic",
    fontSize: 18,
    color: Colors.mutedWhite,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 26,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 6,
  },
  price: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 36,
    color: Colors.gold,
  },
  pricePer: {
    fontFamily: "DMSans_300Light",
    fontSize: 15,
    color: T.textMuted,
  },
  includes: {
    fontFamily: "DMSans_300Light",
    fontSize: 13,
    color: T.textMuted,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  error: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: "#e05252",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  cta: {
    width: "100%",
    height: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  ctaText: {
    fontFamily: "DMSans_500Medium",
    fontSize: 16,
    color: "#000",
    letterSpacing: 0.3,
  },
  restoreButton: {
    marginTop: 14,
    padding: 8,
  },
  restoreText: {
    fontFamily: "DMSans_400Regular",
    fontSize: 13,
    color: T.textMuted,
  },
  backButton: {
    marginTop: 10,
    padding: 8,
  },
  backText: {
    fontFamily: "DMSans_300Light",
    fontSize: 13,
    color: T.textMuted,
    letterSpacing: 0.2,
  },
});
