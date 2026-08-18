/**
 * RevenueCat subscription context for Mo.
 *
 * Entitlement structure:
 *   "executive" entitlement → Executive mode access
 *   "luxury"    entitlement → Luxury mode access (also grants executive access)
 *   No entitlement          → Daily mode only (free)
 *
 * Configuration:
 *   Set EXPO_PUBLIC_REVENUECAT_TEST_API_KEY, EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
 *   and EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY in environment variables after
 *   running the seed script and connecting the RevenueCat integration.
 *
 *   If the keys are not set, RevenueCat initialisation is skipped and all modes
 *   remain accessible (development fallback — no gating).
 */

import React, { createContext, useContext } from "react";
import { Platform } from "react-native";
import Purchases, {
  LOG_LEVEL,
  type PurchasesOfferings,
  type PurchasesPackage,
  type CustomerInfo,
} from "react-native-purchases";
import { useMutation, useQuery } from "@tanstack/react-query";
import Constants from "expo-constants";

// ── Configuration ─────────────────────────────────────────────────────────────
// These are public (EXPO_PUBLIC_) keys — safe to ship in the client bundle.
// Set them via Replit Secrets after running the RevenueCat seed script.

const REVENUECAT_TEST_API_KEY    = process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY;
const REVENUECAT_IOS_API_KEY     = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

// Entitlement identifiers — must match what is created in RevenueCat.
export const EXECUTIVE_ENTITLEMENT_ID = "executive";
export const LUXURY_ENTITLEMENT_ID    = "luxury";

// Package identifiers in the default offering — must match seed script.
export const EXECUTIVE_PACKAGE_ID = "executive_monthly";
export const LUXURY_PACKAGE_ID    = "luxury_monthly";

// ── Initialisation ────────────────────────────────────────────────────────────

function getRevenueCatApiKey(): string {
  if (!REVENUECAT_TEST_API_KEY || !REVENUECAT_IOS_API_KEY || !REVENUECAT_ANDROID_API_KEY) {
    throw new Error(
      "RevenueCat API keys not configured. Set EXPO_PUBLIC_REVENUECAT_TEST_API_KEY, " +
      "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY, and EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY " +
      "in Replit Secrets after running scripts/src/seedRevenueCat.ts."
    );
  }

  // Expo Go / web / TestFlight sandbox → use test store key
  if (__DEV__ || Platform.OS === "web" || Constants.executionEnvironment === "storeClient") {
    return REVENUECAT_TEST_API_KEY;
  }

  if (Platform.OS === "ios")     return REVENUECAT_IOS_API_KEY;
  if (Platform.OS === "android") return REVENUECAT_ANDROID_API_KEY;

  return REVENUECAT_TEST_API_KEY;
}

/**
 * Call once at app startup (in _layout.tsx).
 * Throws if API keys are not set — catch and handle gracefully.
 */
export function initializeRevenueCat(): void {
  const apiKey = getRevenueCatApiKey();
  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  console.log("[RevenueCat] Configured successfully");
}

// ── Context ───────────────────────────────────────────────────────────────────

/** Tier identifier derived from active entitlements. */
export type SubscriptionTier = "free" | "executive" | "luxury";

interface SubscriptionContextValue {
  /** User has an active "executive" OR "luxury" entitlement. */
  hasExecutive: boolean;
  /** User has an active "luxury" entitlement specifically. */

  hasLuxury: boolean;
  /** Computed active tier — "free" when no paid entitlement is active. */

  activeTier: SubscriptionTier;
  /** Expiration/renewal date of the highest active entitlement, or null. */

  renewalDate: Date | null;
  /**
   * Whether the active subscription will auto-renew.
   * false means the user has canceled and the entitlement expires on renewalDate.
   * null when there is no active subscription.
   */

  willRenew: boolean | null;
  /** RevenueCat was successfully initialised with valid API keys. */

  isConfigured: boolean;
  /** Subscription data is still loading from RevenueCat. */

  isLoading: boolean;
  /** Raw RevenueCat offerings (for showing live prices in the paywall). */

  offerings: PurchasesOfferings | null | undefined;
  /** Purchase a RevenueCat package. */

  purchase: (pkg: PurchasesPackage) => Promise<CustomerInfo>;
  /** Restore previous purchases. */

  restore: () => Promise<CustomerInfo>;

  isPurchasing: boolean;

  isRestoring: boolean;
}

function useSubscriptionContext(isConfigured: boolean): SubscriptionContextValue {
  const customerInfoQuery = useQuery({
    queryKey: ["revenuecat", "customer-info"],
    queryFn: () => Purchases.getCustomerInfo(),
    staleTime: 60 * 1000,
    enabled: isConfigured,
  });

  const offeringsQuery = useQuery({
    queryKey: ["revenuecat", "offerings"],
    queryFn: () => Purchases.getOfferings(),
    staleTime: 300 * 1000,
    enabled: isConfigured,
  });

  const purchaseMutation = useMutation({
    mutationFn: async (pkg: PurchasesPackage) => {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      return customerInfo;
    },
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const restoreMutation = useMutation({
    mutationFn: () => Purchases.restorePurchases(),
    onSuccess: () => customerInfoQuery.refetch(),
  });

  const active = customerInfoQuery.data?.entitlements.active ?? {};
  const hasLuxury    = LUXURY_ENTITLEMENT_ID    in active;
  const hasExecutive = hasLuxury || (EXECUTIVE_ENTITLEMENT_ID in active);

  const activeTier: SubscriptionTier = hasLuxury
    ? "luxury"
    : hasExecutive
    ? "executive"
    : "free";

  // Expiration + renewal state of the highest active entitlement.
  const activeEntId = hasLuxury
    ? LUXURY_ENTITLEMENT_ID
    : hasExecutive
    ? EXECUTIVE_ENTITLEMENT_ID
    : null;
  const activeEntitlement = activeEntId ? active[activeEntId] : null;
  const renewalDate: Date | null = activeEntitlement?.expirationDate
    ? new Date(activeEntitlement.expirationDate)
    : null;
  const willRenew: boolean | null = activeEntitlement != null
    ? (activeEntitlement.willRenew ?? false)
    : null;

  return {
    hasExecutive,
    hasLuxury,
    activeTier,
    renewalDate,
    willRenew,
    isConfigured,
    isLoading: isConfigured && (customerInfoQuery.isLoading || offeringsQuery.isLoading),
    offerings: offeringsQuery.data,
    purchase: purchaseMutation.mutateAsync,
    restore:  restoreMutation.mutateAsync,
    isPurchasing: purchaseMutation.isPending,
    isRestoring:  restoreMutation.isPending,
  };
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({
  children,
  isConfigured,
}: {
  children: React.ReactNode;
  isConfigured: boolean;
}) {
  const value = useSubscriptionContext(isConfigured);
  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
