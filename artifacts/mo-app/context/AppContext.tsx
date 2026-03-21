import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import type { AssistantMode } from "@/hooks/use-voice";

// ── Types ────────────────────────────────────────────────────────────────────

export type ResponseLength = "short" | "medium" | "long";

export interface UserPreferences {
  name: string;
  location: string;
  timezone: string;
  autoplay: boolean;
  responseLength: ResponseLength;
  backgroundEnabled: boolean;
  defaultMode: AssistantMode;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

interface AppContextValue {
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  conversationHistory: ConversationMessage[];
  addToHistory: (transcript: string, reply: string) => void;
  clearHistory: () => void;
  isLoaded: boolean;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

function getSystemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  } catch {
    return "UTC";
  }
}

const DEFAULT_PREFERENCES: UserPreferences = {
  name: "",
  location: "",
  timezone: getSystemTimezone(),
  autoplay: true,
  responseLength: "medium",
  backgroundEnabled: true,
  defaultMode: "executive",
};

const PREFS_KEY = "@mo:preferences";
const HISTORY_KEY = "@mo:conversationHistory";
const MAX_HISTORY = 20;

// ── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] =
    useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [conversationHistory, setConversationHistory] = useState<
    ConversationMessage[]
  >([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load from storage
  useEffect(() => {
    const load = async () => {
      try {
        const [prefsRaw, historyRaw] = await Promise.all([
          AsyncStorage.getItem(PREFS_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
        ]);

        if (prefsRaw) {
          const saved = JSON.parse(prefsRaw) as Partial<UserPreferences>;
          setPreferences((prev) => ({ ...prev, ...saved }));
        }

        if (historyRaw) {
          setConversationHistory(JSON.parse(historyRaw));
        }
      } catch (err) {
        console.error("Failed to load app state:", err);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
  }, []);

  const updatePreferences = useCallback(
    (updates: Partial<UserPreferences>) => {
      setPreferences((prev) => {
        const next = { ...prev, ...updates };
        // Debounced save
        if (saveTimeout.current) clearTimeout(saveTimeout.current);
        saveTimeout.current = setTimeout(() => {
          AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(
            console.error
          );
        }, 300);
        return next;
      });
    },
    []
  );

  const addToHistory = useCallback((transcript: string, reply: string) => {
    setConversationHistory((prev) => {
      const next = [
        ...prev,
        {
          role: "user" as const,
          content: transcript,
          timestamp: Date.now(),
        },
        {
          role: "assistant" as const,
          content: reply,
          timestamp: Date.now() + 1,
        },
      ].slice(-MAX_HISTORY);

      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(
        console.error
      );
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setConversationHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY).catch(console.error);
  }, []);

  return (
    <AppContext.Provider
      value={{
        preferences,
        updatePreferences,
        conversationHistory,
        addToHistory,
        clearHistory,
        isLoaded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
}
