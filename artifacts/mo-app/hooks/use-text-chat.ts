/**
 * Text-based chat hook — calls POST /api/mo/chat.
 * Mirrors the response shape of the voice pipeline so tool callbacks work.
 */

import { useCallback, useRef, useState } from "react";
import type { AssistantMode } from "@/hooks/use-voice";
import type { ConversationMessage, MemoryItem, Task } from "@/context/AppContext";
import type { Reminder } from "@/hooks/use-reminders";
import type { Note } from "@/hooks/use-notes";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export type ChatState = "idle" | "loading" | "done" | "error";

interface ChatContext {
  mode: AssistantMode;
  messages: ConversationMessage[];
  memories: MemoryItem[];
  tasks: Task[];
  reminders: Reminder[];
  notes: Note[];
  preferences?: {
    name?: string;
    location?: string;
    timezone?: string;
    responseLength?: "short" | "medium" | "long";
  };
}

interface ToolResult {
  note?: { content: string; title?: string; category?: string };
  noteAction?: { action: "delete"; keyword: string };
  reminder?: { title: string; content: string; datetime: string };
  reminderAction?: { action: "delete" | "dismiss"; title: string };
  memoryAction?: {
    action: "save" | "delete";
    category?: string;
    key: string;
    value?: string;
  };
  taskAction?: {
    action: "add" | "complete" | "delete";
    title: string;
    dueDate?: string;
    category?: string;
  };
}

interface UseTextChatOptions {
  onComplete: (userText: string, reply: string, tools: ToolResult) => void;
}

interface UseTextChatReturn {
  chatState: ChatState;
  chatReply: string;
  chatError: string;
  submitText: (text: string, context: ChatContext) => Promise<void>;
  resetChat: () => void;
}

// Map app modes to API-accepted mode strings
const API_MODE: Record<string, string> = {
  daily:       "planner",
  executive:   "executive",
  luxury:      "creative",
  creative:    "creative",
  motivational:"motivational",
  planner:     "planner",
};

export function useTextChat({ onComplete }: UseTextChatOptions): UseTextChatReturn {
  const [chatState, setChatState] = useState<ChatState>("idle");
  const [chatReply, setChatReply] = useState("");
  const [chatError, setChatError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const submitText = useCallback(
    async (text: string, ctx: ChatContext) => {
      if (!text.trim()) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setChatState("loading");
      setChatReply("");
      setChatError("");

      try {
        const response = await fetch(`${BASE_URL}/api/mo/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            mode: API_MODE[ctx.mode] ?? "executive",
            messages: ctx.messages.slice(-10).map((m) => ({
              role: m.role,
              content: m.content,
            })),
            preferences: ctx.preferences,
            memories: ctx.memories.map((m) => ({
              id: m.id,
              category: m.category,
              key: m.key,
              value: m.value,
              createdAt: m.createdAt,   // required by memoryItemSchema
              updatedAt: m.updatedAt,   // required by memoryItemSchema
            })),
            tasks: ctx.tasks
              .filter((t) => t.status === "pending")
              .slice(0, 10)
              .map((t) => ({
                id: t.id,
                title: t.title,
                status: t.status,
                dueDate: t.dueDate,
                category: t.category,
                createdAt: t.createdAt,   // required by taskSchema
                updatedAt: t.updatedAt,   // required by taskSchema
              })),
            reminders: ctx.reminders.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title,
              content: r.content,   // required by reminderContextSchema
              datetime: r.datetime,
            })),
            notes: ctx.notes.slice(0, 10).map((n) => ({
              id: n.id,
              content: n.content,
              title: n.title,
              category: n.category,
              timestamp: n.timestamp,
            })),
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as any)?.error ?? `Error ${response.status}`);
        }

        const data = await response.json();
        const reply: string = data.reply ?? "";

        setChatReply(reply);
        setChatState("done");

        const tools: ToolResult = {
          note:          data.note,
          noteAction:    data.noteAction,
          reminder:      data.reminder,
          reminderAction:data.reminderAction,
          memoryAction:  data.memoryAction,
          taskAction:    data.taskAction,
        };

        onComplete(text, reply, tools);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        const msg = err?.message ?? "Failed to get a response. Please try again.";
        setChatError(msg);
        setChatState("error");
      }
    },
    [onComplete]
  );

  const resetChat = useCallback(() => {
    abortRef.current?.abort();
    setChatState("idle");
    setChatReply("");
    setChatError("");
  }, []);

  return { chatState, chatReply, chatError, submitText, resetChat };
}
