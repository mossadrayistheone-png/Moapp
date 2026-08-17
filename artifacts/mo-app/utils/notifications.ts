/**
 * Safe expo-notifications wrapper.
 *
 * Expo Go SDK 53+ removed Android remote push notification support.
 * The native module initialisation throws a console.error the moment
 * the JS module is required — even if you never call a single API.
 *
 * We use expo-constants to detect the execution environment at
 * runtime BEFORE the require() call so that inside Expo Go we
 * never touch the native module at all.  A silent stub is returned
 * instead, keeping reminder storage and all UI fully functional.
 *
 * Development build: all real expo-notifications APIs are used.
 * Expo Go:          stub — no errors, no push, reminders stored only.
 */

import Constants, { ExecutionEnvironment } from "expo-constants";

// ── Environment detection ─────────────────────────────────────────────────────

/**
 * True when running inside Expo Go (the "store client").
 * False in development builds, production builds, and web.
 */
export const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// ── Minimal type surface we need from expo-notifications ─────────────────────

type PermissionResponse = {
  status: "granted" | "denied" | "undetermined";
  granted: boolean;
  canAskAgain: boolean;
  expires: "never";
};

type NotificationContent = {
  title?: string;
  body?: string;
  sound?: boolean | string;
};

type NotificationRequest = {
  content: NotificationContent;
  trigger: unknown;
};

type NotificationHandler = {
  handleNotification: (n: unknown) => Promise<{
    shouldShowAlert: boolean;
    shouldShowBanner: boolean;
    shouldShowList: boolean;
    shouldPlaySound: boolean;
    shouldSetBadge: boolean;
  }>;
};

type SafeNotificationsAPI = {
  setNotificationHandler: (handler: NotificationHandler) => void;
  getPermissionsAsync: () => Promise<PermissionResponse>;
  requestPermissionsAsync: () => Promise<PermissionResponse>;
  scheduleNotificationAsync: (request: NotificationRequest) => Promise<string>;
  cancelScheduledNotificationAsync: (id: string) => Promise<void>;
};

// ── Silent stub used inside Expo Go ──────────────────────────────────────────

const STUB: SafeNotificationsAPI = {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({
    status: "undetermined",
    granted: false,
    canAskAgain: true,
    expires: "never",
  }),
  requestPermissionsAsync: async () => ({
    status: "denied",
    granted: false,
    canAskAgain: false,
    expires: "never",
  }),
  scheduleNotificationAsync: async () => "",
  cancelScheduledNotificationAsync: async () => {},
};

// ── Safe loader — require() is only called when NOT in Expo Go ───────────────

function loadNotifications(): SafeNotificationsAPI {
  if (isExpoGo) {
    return STUB;
  }
  try {
    // Dynamic require keeps the static import graph clean —
    // Metro only executes this when we're in a real build.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as SafeNotificationsAPI;
  } catch {
    return STUB;
  }
}

export const SafeNotifications = loadNotifications();
