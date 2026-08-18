import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { AssistantMode } from "@/hooks/use-voice";

// ── Types ────────────────────────────────────────────────────────────────────

export type ResponseLength = "short" | "medium" | "long";
export type MemoryCategory = "personal" | "preferences" | "schedule" | "goals";
export type TaskStatus = "pending" | "completed";
export type TaskCategory = "work" | "personal" | "health" | "finance" | "other";

export interface MemoryItem {
  id: string;
  category: MemoryCategory;
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: string;
  title: string;
  dueDate?: string;
  status: TaskStatus;
  category?: TaskCategory;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

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
  // Preferences
  preferences: UserPreferences;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  // Conversation
  conversationHistory: ConversationMessage[];
  addToHistory: (transcript: string, reply: string) => void;
  clearHistory: () => void;
  // Memory
  memories: MemoryItem[];
  saveMemory: (params: { category: MemoryCategory; key: string; value: string }) => void;
  deleteMemoryById: (id: string) => void;
  deleteMemoryByKey: (key: string) => void;
  clearMemories: () => void;
  // Tasks
  tasks: Task[];
  addTask: (params: { title: string; dueDate?: string; category?: string }) => void;
  completeTaskById: (id: string) => void;
  completeTaskByTitle: (title: string) => void;
  deleteTaskById: (id: string) => void;
  deleteTaskByTitle: (title: string) => void;
  clearTasks: () => void;
  // Loading
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
  defaultMode: "daily",
};

const PREFS_KEY = "@mo:preferences";
const HISTORY_KEY = "@mo:conversationHistory";
const MEMORY_KEY = "@mo:memories";
const TASKS_KEY = "@mo:tasks";
const MAX_HISTORY = 20;

// ── Context ──────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [conversationHistory, setConversationHistory] = useState<ConversationMessage[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load all persistent state on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [prefsRaw, historyRaw, memoriesRaw, tasksRaw] = await Promise.all([
          AsyncStorage.getItem(PREFS_KEY),
          AsyncStorage.getItem(HISTORY_KEY),
          AsyncStorage.getItem(MEMORY_KEY),
          AsyncStorage.getItem(TASKS_KEY),
        ]);
        if (prefsRaw) setPreferences((p) => ({ ...p, ...JSON.parse(prefsRaw) }));
        if (historyRaw) setConversationHistory(JSON.parse(historyRaw));
        if (memoriesRaw) setMemories(JSON.parse(memoriesRaw));
        if (tasksRaw) setTasks(JSON.parse(tasksRaw));
      } catch (err) {
        console.error("Failed to load app state:", err);
      } finally {
        setIsLoaded(true);
      }
    };
    load();
  }, []);

  // ── Preferences ──────────────────────────────────────────────────────────

  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...updates };
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(console.error);
      }, 300);
      return next;
    });
  }, []);

  // ── Conversation history ──────────────────────────────────────────────────

  const addToHistory = useCallback((transcript: string, reply: string) => {
    setConversationHistory((prev) => {
      const next = [
        ...prev,
        { role: "user" as const, content: transcript, timestamp: Date.now() },
        { role: "assistant" as const, content: reply, timestamp: Date.now() + 1 },
      ].slice(-MAX_HISTORY);
      AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setConversationHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY).catch(console.error);
  }, []);

  // ── Memory ────────────────────────────────────────────────────────────────

  const persistMemories = useCallback((items: MemoryItem[]) => {
    AsyncStorage.setItem(MEMORY_KEY, JSON.stringify(items)).catch(console.error);
  }, []);

  const saveMemory = useCallback(
    (params: { category: MemoryCategory; key: string; value: string }) => {
      setMemories((prev) => {
        const normalKey = params.key.trim().toLowerCase();
        const idx = prev.findIndex((m) => m.key.trim().toLowerCase() === normalKey);
        let next: MemoryItem[];
        if (idx >= 0) {
          next = prev.map((m, i) =>
            i === idx
              ? { ...m, value: params.value, category: params.category, updatedAt: Date.now() }
              : m
          );
        } else {
          next = [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              category: params.category,
              key: params.key.trim(),
              value: params.value.trim(),
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ];
        }
        persistMemories(next);
        return next;
      });
    },
    [persistMemories]
  );

  const deleteMemoryById = useCallback(
    (id: string) => {
      setMemories((prev) => {
        const next = prev.filter((m) => m.id !== id);
        persistMemories(next);
        return next;
      });
    },
    [persistMemories]
  );

  const deleteMemoryByKey = useCallback(
    (key: string) => {
      const normalKey = key.trim().toLowerCase();
      setMemories((prev) => {
        const next = prev.filter((m) => m.key.trim().toLowerCase() !== normalKey);
        persistMemories(next);
        return next;
      });
    },
    [persistMemories]
  );

  const clearMemories = useCallback(() => {
    setMemories([]);
    AsyncStorage.removeItem(MEMORY_KEY).catch(console.error);
  }, []);

  // ── Tasks ─────────────────────────────────────────────────────────────────

  const persistTasks = useCallback((items: Task[]) => {
    AsyncStorage.setItem(TASKS_KEY, JSON.stringify(items)).catch(console.error);
  }, []);

  const addTask = useCallback(
    (params: { title: string; dueDate?: string; category?: string }) => {
      setTasks((prev) => {
        const newTask: Task = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: params.title.trim(),
          dueDate: params.dueDate,
          category: (params.category as TaskCategory) ?? undefined,
          status: "pending",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const next = [newTask, ...prev];
        persistTasks(next);
        return next;
      });
    },
    [persistTasks]
  );

  const completeTaskById = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const next = prev.map((t) =>
          t.id === id && t.status === "pending"
            ? { ...t, status: "completed" as const, completedAt: Date.now(), updatedAt: Date.now() }
            : t
        );
        persistTasks(next);
        return next;
      });
    },
    [persistTasks]
  );

  const completeTaskByTitle = useCallback(
    (title: string) => {
      const needle = title.trim().toLowerCase();
      setTasks((prev) => {
        const next = prev.map((t) =>
          t.title.toLowerCase().includes(needle) && t.status === "pending"
            ? { ...t, status: "completed" as const, completedAt: Date.now(), updatedAt: Date.now() }
            : t
        );
        persistTasks(next);
        return next;
      });
    },
    [persistTasks]
  );

  const deleteTaskById = useCallback(
    (id: string) => {
      setTasks((prev) => {
        const next = prev.filter((t) => t.id !== id);
        persistTasks(next);
        return next;
      });
    },
    [persistTasks]
  );

  const deleteTaskByTitle = useCallback(
    (title: string) => {
      const needle = title.trim().toLowerCase();
      setTasks((prev) => {
        const next = prev.filter((t) => !t.title.toLowerCase().includes(needle));
        persistTasks(next);
        return next;
      });
    },
    [persistTasks]
  );

  const clearTasks = useCallback(() => {
    setTasks([]);
    AsyncStorage.removeItem(TASKS_KEY).catch(console.error);
  }, []);

  return (
    <AppContext.Provider
      value={{
        preferences,
        updatePreferences,
        conversationHistory,
        addToHistory,
        clearHistory,
        memories,
        saveMemory,
        deleteMemoryById,
        deleteMemoryByKey,
        clearMemories,
        tasks,
        addTask,
        completeTaskById,
        completeTaskByTitle,
        deleteTaskById,
        deleteTaskByTitle,
        clearTasks,
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
