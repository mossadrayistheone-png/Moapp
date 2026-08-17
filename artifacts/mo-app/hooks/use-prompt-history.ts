/**
 * Tracks recently asked prompts per mode, persisted to AsyncStorage.
 * Surfaces the top N most recently used prompts.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "@mo:promptHistory";
const MAX_STORED = 30;
const MAX_SHOWN = 5;

interface PromptHistoryEntry {
  text: string;
  mode: string;
  timestamp: number;
}

interface UsePromptHistoryReturn {
  recentPrompts: string[];            // For current mode
  addPrompt: (text: string, mode: string) => void;
  clearHistory: () => void;
}

export function usePromptHistory(currentMode: string): UsePromptHistoryReturn {
  const [allHistory, setAllHistory] = useState<PromptHistoryEntry[]>([]);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setAllHistory(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  const persist = useCallback((items: PromptHistoryEntry[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(items)).catch(() => {});
    }, 300);
  }, []);

  const addPrompt = useCallback(
    (text: string, mode: string) => {
      setAllHistory((prev) => {
        // Remove duplicate if it already exists
        const filtered = prev.filter(
          (e) => !(e.text === text && e.mode === mode)
        );
        const next: PromptHistoryEntry[] = [
          { text, mode, timestamp: Date.now() },
          ...filtered,
        ].slice(0, MAX_STORED);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearHistory = useCallback(() => {
    setAllHistory([]);
    AsyncStorage.removeItem(KEY).catch(() => {});
  }, []);

  // Filter to current mode, de-duplicate, return top N
  const recentPrompts = allHistory
    .filter((e) => e.mode === currentMode)
    .map((e) => e.text)
    .slice(0, MAX_SHOWN);

  return { recentPrompts, addPrompt, clearHistory };
}
