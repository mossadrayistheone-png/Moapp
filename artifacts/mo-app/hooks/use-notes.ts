import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export interface Note {
  id: string;
  content: string;
  /** Short title (3–6 words), auto-extracted by GPT when created via voice */
  title?: string;
  /** Optional category: idea | meeting | personal | work | other */
  category?: string;
  timestamp: number;
  source: "voice" | "manual";
}

export type NoteCategory = "idea" | "meeting" | "personal" | "work" | "other";

const NOTES_KEY = "@mo:notes";

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(NOTES_KEY)
      .then((raw) => {
        if (raw) setNotes(JSON.parse(raw));
      })
      .catch(console.error)
      .finally(() => setIsLoaded(true));
  }, []);

  const persist = useCallback((next: Note[]) => {
    AsyncStorage.setItem(NOTES_KEY, JSON.stringify(next)).catch(console.error);
    setNotes(next);
  }, []);

  const addNote = useCallback(
    (
      params:
        | string
        | {
            content: string;
            title?: string;
            category?: string;
            source?: Note["source"];
          },
      legacySource: Note["source"] = "voice"
    ): Note => {
      const isString = typeof params === "string";
      const content = isString ? params : params.content;
      const title = isString ? undefined : params.title;
      const category = isString ? undefined : params.category;
      const source = isString ? legacySource : (params.source ?? "voice");

      const note: Note = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        content,
        title,
        category,
        timestamp: Date.now(),
        source,
      };
      setNotes((prev) => {
        const next = [note, ...prev];
        AsyncStorage.setItem(NOTES_KEY, JSON.stringify(next)).catch(console.error);
        return next;
      });
      return note;
    },
    []
  );

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      AsyncStorage.setItem(NOTES_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  }, []);

  /**
   * Delete note(s) by keyword — used for voice commands like
   * "delete my note about groceries". Matches against title and content.
   */
  const deleteNoteByKeyword = useCallback((keyword: string) => {
    const needle = keyword.trim().toLowerCase();
    setNotes((prev) => {
      const next = prev.filter(
        (n) =>
          !n.content.toLowerCase().includes(needle) &&
          !(n.title ?? "").toLowerCase().includes(needle)
      );
      AsyncStorage.setItem(NOTES_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  }, []);

  const clearNotes = useCallback(() => {
    persist([]);
  }, [persist]);

  return { notes, addNote, deleteNote, deleteNoteByKeyword, clearNotes, isLoaded };
}
