import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

export interface Note {
  id: string;
  content: string;
  timestamp: number;
  source: "voice" | "manual";
}

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
    (content: string, source: Note["source"] = "voice"): Note => {
      const note: Note = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        content,
        timestamp: Date.now(),
        source,
      };
      setNotes((prev) => {
        const next = [note, ...prev];
        AsyncStorage.setItem(NOTES_KEY, JSON.stringify(next)).catch(
          console.error
        );
        return next;
      });
      return note;
    },
    []
  );

  const deleteNote = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const next = prev.filter((n) => n.id !== id);
        AsyncStorage.setItem(NOTES_KEY, JSON.stringify(next)).catch(
          console.error
        );
        return next;
      });
    },
    []
  );

  const clearNotes = useCallback(() => {
    persist([]);
  }, [persist]);

  return { notes, addNote, deleteNote, clearNotes, isLoaded };
}
