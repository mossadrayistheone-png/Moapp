import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

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

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === "granted") return true;
    const { status } = await Notifications.requestPermissionsAsync();
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
      .catch(console.error)
      .finally(() => setIsLoaded(true));
  }, []);

  const persist = useCallback((next: Reminder[]) => {
    AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(console.error);
    setReminders(next);
  }, []);

  const addReminder = useCallback(
    async (params: {
      title: string;
      content: string;
      datetime: string;
    }): Promise<Reminder> => {
      const triggerDate = new Date(params.datetime);
      let notificationId: string | null = null;

      if (triggerDate > new Date() && Platform.OS !== "web") {
        try {
          const granted = await requestNotificationPermission();
          if (granted) {
            notificationId = await Notifications.scheduleNotificationAsync({
              content: {
                title: `Mo: ${params.title}`,
                body: params.content,
                sound: true,
              },
              trigger: { date: triggerDate } as Notifications.NotificationTriggerInput,
            });
          }
        } catch (err) {
          console.error("Failed to schedule notification:", err);
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
        AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(console.error);
        return next;
      });

      return reminder;
    },
    []
  );

  const deleteReminder = useCallback(async (id: string) => {
    setReminders((prev) => {
      const reminder = prev.find((r) => r.id === id);
      if (reminder?.notificationId) {
        Notifications.cancelScheduledNotificationAsync(reminder.notificationId).catch(
          () => {} // silent — notification may not exist or push unavailable in Expo Go
        );
      }
      const next = prev.filter((r) => r.id !== id);
      AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  /**
   * Delete reminder(s) by title keyword — used for voice commands like
   * "delete my stretch reminder". Performs a case-insensitive partial match.
   * Cancels any scheduled push notifications for matched reminders.
   */
  const deleteReminderByTitle = useCallback((titleKeyword: string) => {
    const needle = titleKeyword.trim().toLowerCase();
    setReminders((prev) => {
      const toDelete = prev.filter((r) =>
        r.title.toLowerCase().includes(needle)
      );
      for (const r of toDelete) {
        if (r.notificationId) {
          Notifications.cancelScheduledNotificationAsync(r.notificationId).catch(
            () => {} // silent
          );
        }
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
      AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(next)).catch(console.error);
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
