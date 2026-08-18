import {
  CormorantGaramond_400Regular,
  CormorantGaramond_400Regular_Italic,
  CormorantGaramond_500Medium,
} from "@expo-google-fonts/cormorant-garamond";
import {
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
} from "@expo-google-fonts/dm-sans";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppProvider } from "@/context/AppContext";
import { initializeRevenueCat, SubscriptionProvider } from "@/lib/revenuecat";
import { OnboardingScreen } from "@/components/OnboardingScreen";
import { SafeNotifications } from "@/utils/notifications";

// Initialise RevenueCat once at module load. If API keys are not yet
// configured (development / pre-launch), we catch the error and set
// revenueCatConfigured = false so the SubscriptionProvider falls back
// to open access (no paywall shown during development).
let revenueCatConfigured = false;
try {
  initializeRevenueCat();
  revenueCatConfigured = true;
} catch (err: any) {
  console.warn("[RevenueCat] Not configured — paywall disabled:", err?.message ?? err);
}

let _baseUrl: string | null = null;
function setBaseUrl(url: string | null): void {
  _baseUrl = url ? url.replace(/\/+$/, "") : null;
}
export function getBaseUrl(): string | null { return _baseUrl; }

setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Register the foreground notification handler via the safe wrapper.
// In Expo Go this is a silent no-op; in a dev/prod build it uses the
// real expo-notifications module.
SafeNotifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  // null = still checking AsyncStorage; true = show onboarding; false = skip
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem("@mo/onboarding_complete")
      .then((val) => setShowOnboarding(val === null))
      .catch(() => setShowOnboarding(false));
  }, []);

  const handleOnboardingComplete = async (name?: string) => {
    if (name) await AsyncStorage.setItem("@mo/user_name", name).catch(() => {});
    await AsyncStorage.setItem("@mo/onboarding_complete", "1").catch(() => {});
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = async () => {
    await AsyncStorage.setItem("@mo/onboarding_complete", "1").catch(() => {});
    setShowOnboarding(false);
  };

  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_400Regular,
    CormorantGaramond_400Regular_Italic,
    CormorantGaramond_500Medium,
    DMSans_300Light,
    DMSans_400Regular,
    DMSans_500Medium,
    // Load Feather icon font explicitly by file path so all <Feather> icons
    // render immediately.  Direct require avoids the broken .font static
    // property (affected by 'use client' in React 19 / Expo SDK 54).
    feather: require("@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Wait for fonts AND onboarding check before rendering anything
  if ((!fontsLoaded && !fontError) || showOnboarding === null) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <SubscriptionProvider isConfigured={revenueCatConfigured}>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <StatusBar style="light" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen
                  name="settings"
                  options={{
                    headerShown: false,
                    animation: "slide_from_right",
                  }}
                />
                <Stack.Screen
                  name="notes"
                  options={{
                    headerShown: false,
                    animation: "slide_from_right",
                  }}
                />
              </Stack>
              {/* Onboarding overlay — shown only on first launch */}
              {showOnboarding && (
                <View style={StyleSheet.absoluteFillObject}>
                  <OnboardingScreen
                    onComplete={handleOnboardingComplete}
                    onSkip={handleOnboardingSkip}
                  />
                </View>
              )}
            </GestureHandlerRootView>
            </SubscriptionProvider>
          </AppProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
