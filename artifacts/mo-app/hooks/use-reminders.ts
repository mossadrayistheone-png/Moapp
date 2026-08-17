import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { SafeNotifications, isExpoGo } from "@/utils/notifications";

export interface Reminder {
  id: string;
  title: string;
  content: string;
  datetime: string; // ISO string
  notificationId: string | null;
  completed: boolean;
  createdAt: number;
}

const REMINDERS_KEY = "@mo:reminders";

/**
 * Request notification permission.
 * Returns false silently in Expo Go or on web — reminder data is
 * still stored and surfaced in the UI, just without system alerts.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web" || isExpoGo) return false;
  try {
    const { status: existing } = await SafeNotifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await SafeNotifications.requestPermissionsAsync();
    return status === "granted";
  } catch {
    return false;
  }
}

export function useReminders() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(REMINDERS_KEY)
      .then((raw) => {
        if (raw) setReminders(JSON.parse(raw));
      })
      .catch(() => {})
      .finally(() => setIsLoaded(true));
  }, []);

  const addReminder = useCallback(
    async (params: {
      title: string;
      content: string;
      datetime: string;
    }): Promise<Reminder> => {
      const triggerDate = new Date(params.datetime);
      let notificationId: string | null = null;

      // Schedule a local notification only in real builds, not Expo Go or web
      if (triggerDate > new Date() && Platform.OS !== "web" && !isExpoGo) {
        try {
          const granted = await requestNotificationPermission();
          if (granted) {
            notificationId = await SafeNotifications.scheduleNotificationAsync({
              content: {
                title: `Mo: ${params.title}`,
                body: params.content,
                sound: true,
              },
              trigger: { date: triggerDate },
            });
          }
        } catch {
          // Notification scheduling failed — reminder still saved in storage
        }
      }

      const reminder: Reminder = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: params.title,
        content: params.content,
        datetime: params.datetime,
        notificationId,
        completed: false,
        createdAt: Date.now(),
      };

      setReminders((prev) => {
        const next = [reminder, ...prev];
        AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });

      return reminder;
    },
    []
  );

  const cancelNotification = (id: string | null) => {
    if (!id || isExpoGo || Platform.OS === "web") return;
    SafeNotifications.cancelScheduledNotificationAsync(id).catch(() => {});
  };

  const deleteReminder = useCallback(async (id: string) => {
    setReminders((prev) => {
      const reminder = prev.find((r) => r.id === id);
      cancelNotification(reminder?.notificationId ?? null);
      const next = prev.filter((r) => r.id !== id);
      AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /**
   * Delete reminder(s) by title keyword — used for voice commands like
   * "delete my stretch reminder". Case-insensitive partial match.
   */
  const deleteReminderByTitle = useCallback((titleKeyword: string) => {
    const needle = titleKeyword.trim().toLowerCase();
    setReminders((prev) => {
      const toDelete = prev.filter((r) =>
        r.title.toLowerCase().includes(needle)
      );
      for (const r of toDelete) {
        cancelNotification(r.notificationId);
      }
      const next = prev.filter(
        (r) => !r.title.toLowerCase().includes(needle)
      );
      AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const markCompleted = useCallback((id: string) => {
    setReminders((prev) => {
      const next = prev.map((r) =>
        r.id === id ? { ...r, completed: true } : r
      );
      AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const upcomingReminders = reminders.filter(
    (r) => !r.completed && new Date(r.datetime) > new Date()
  );

  return {
    reminders,
    upcomingReminders,
    addReminder,
    deleteReminder,
    deleteReminderByTitle,
    markCompleted,
    isLoaded,
  };
}
