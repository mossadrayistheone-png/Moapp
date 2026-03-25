import { Router, type IRouter, type Request, type Response } from "express";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import nodePath from "path";
import OpenAI from "openai";
import {
  MoChatBody,
  MoSpeakBody,
  MoVoiceBody,
} from "@workspace/api-zod";
import { getWeather } from "../services/weather.js";
import { webSearch } from "../services/search.js";

const execAsync = promisify(exec);

// Normalise any incoming audio to 16-kHz mono WAV using ffmpeg.
// WAV is universally accepted by Whisper regardless of what the Android device
// actually recorded. Falls back to the original buffer if ffmpeg is unavailable.
async function normaliseAudio(audioBuffer: Buffer, ext: string): Promise<{ buffer: Buffer; filename: string }> {
  const tmpId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath  = nodePath.join(os.tmpdir(), `mo-in-${tmpId}.${ext}`);
  const outPath = nodePath.join(os.tmpdir(), `mo-out-${tmpId}.wav`);
  try {
    fs.writeFileSync(inPath, audioBuffer);
    await execAsync(`ffmpeg -y -i "${inPath}" -ar 16000 -ac 1 -f wav "${outPath}" 2>/dev/null`);
    const wavBuffer = fs.readFileSync(outPath);
    return { buffer: wavBuffer, filename: "rec.wav" };
  } catch {
    // ffmpeg unavailable or conversion failed — send original and hope for the best
    return { buffer: audioBuffer, filename: `rec.${ext}` };
  } finally {
    try { fs.unlinkSync(inPath); } catch { /* ignore */ }
    try { fs.unlinkSync(outPath); } catch { /* ignore */ }
  }
}

const router: IRouter = Router();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Personality prompts ──────────────────────────────────────────────────────

const SHARED_RULES = `
Rules that never change:
- 1 to 2 sentences only. Never more. Brevity is a form of respect.
- Never use filler: no "Of course", "Certainly", "Great question", "Sure", "Absolutely".
- Never start with "I". Lead with the insight.
- No lists. No bullet points. No markdown. Pure prose.
- When you receive [Web search results] or [Search result] context, use it naturally — don't quote it verbatim.
- Never say you lack access to information. Engage with substance.
- When estimating, do so with conviction.`;

const MODE_PROMPTS: Record<string, string> = {
  executive: `You are Mo — a private advisor of the highest order. Intelligent, discreet, graceful.
${SHARED_RULES}
Tone: composed, assured, slightly warm. Precise language, elevated but never academic. Never hedge. Occasional phrases carry quiet elegance. Like a trusted advisor at a private members club who has seen everything and remains unimpressed, yet fully attentive.`,

  creative: `You are Mo — a brilliant creative mind and trusted confidant. You think in images, connections, unexpected angles.
${SHARED_RULES}
Tone: imaginative yet grounded. Find the unexpected angle — the reframe, the metaphor, the perspective that makes someone pause. Vivid and precise language. Surprising but inevitable.`,

  motivational: `You are Mo — a composed force of clarity and forward momentum. You cut through doubt.
${SHARED_RULES}
Tone: direct, energising, deeply human. No hollow cheerleading — only conviction rooted in truth. Every response should leave someone feeling more capable. Spare, powerful language — like a coach who doesn't waste words.`,

  planner: `You are Mo — a masterful daily planner and strategic advisor. You orchestrate days with precision and clarity.
${SHARED_RULES}
Tone: structured yet human. Think in blocks of time, energy levels, and priorities. A great plan feels both rigorous and doable. Ask clarifying questions when needed. Speak like a chief of staff who keeps things moving without creating anxiety. Help the user think through their schedule, priorities, and goals for the day.`,
};

// ── Domain types ─────────────────────────────────────────────────────────────

interface MemoryItem {
  id: string;
  category: "personal" | "preferences" | "schedule" | "goals";
  key: string;
  value: string;
  createdAt: number;
  updatedAt: number;
}

interface MemoryAction {
  action: "save" | "delete";
  category?: string;
  key: string;
  value?: string;
}

interface Task {
  id: string;
  title: string;
  dueDate?: string;
  status: "pending" | "completed";
  category?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

interface TaskAction {
  action: "add" | "complete" | "delete";
  title: string;
  dueDate?: string;
  category?: string;
}

interface ReminderContext {
  id: string;
  title: string;
  content: string;
  datetime: string;
}

interface ReminderAction {
  action: "delete" | "dismiss";
  title: string;
}

interface NoteContext {
  id: string;
  content: string;
  title?: string;
  category?: string;
  timestamp: number;
}

interface NoteAction {
  action: "delete";
  keyword: string;
}

interface PlanBlock {
  time?: string;
  title: string;
  description?: string;
  type: "task" | "reminder" | "focus" | "break" | "routine";
  priority?: "high" | "medium" | "low";
}

interface DayPlan {
  title: string;
  timeframe: "morning" | "afternoon" | "evening" | "full_day";
  blocks: PlanBlock[];
}

// ── OpenAI tool definitions ──────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Get current weather for a location. Call when the user asks about weather, temperature, or conditions.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name or location (e.g. 'London', 'New York')",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_datetime",
      description:
        "Get the current date and time. Call when the user asks what time or date it is.",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "IANA timezone name. Use 'UTC' if unknown.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information: news, live facts, prices, recent events. Use when the answer may have changed since training.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Specific, targeted search query",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_reminder",
      description:
        "Schedule a reminder. Call when the user says 'remind me', 'set an alarm', 'alert me', or similar.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short reminder title (5 words max)" },
          content: { type: "string", description: "Full reminder message" },
          datetime: {
            type: "string",
            description:
              "Absolute ISO 8601 datetime in UTC. Compute from the current time in the system prompt.",
          },
        },
        required: ["title", "content", "datetime"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_note",
      description:
        "Save a quick note or captured idea. Call when the user says 'take a note', 'note this', 'save this idea', 'write this down', 'capture', 'remember this' — but NOT for personal facts (use save_memory) or to-dos (use add_task).",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string", description: "The full note content, verbatim or lightly cleaned" },
          title: {
            type: "string",
            description: "Short title for the note (3–6 words max). Extract the essence — e.g. 'Luxury real estate voiceovers' or 'Call the agency'.",
          },
          category: {
            type: "string",
            enum: ["idea", "meeting", "personal", "work", "other"],
            description: "Optional: best-fit category for the note.",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description:
        "Delete a saved note. Call when the user says 'delete my note about X', 'remove the X note', 'clear that note', 'delete the note about X'.",
      parameters: {
        type: "object",
        properties: {
          keyword: {
            type: "string",
            description:
              "A distinctive keyword or phrase from the note's title or content. Partial match is fine — e.g. 'groceries' to match 'Buy groceries for dinner'.",
          },
        },
        required: ["keyword"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Save a personal fact or long-term preference about the user. Call when the user says 'remember that I...', 'keep in mind that I...', 'I want you to know that I...', or similar.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["personal", "preferences", "schedule", "goals"],
            description:
              "personal = identity. preferences = how they like things. schedule = routines. goals = aspirations.",
          },
          key: {
            type: "string",
            description:
              "Short lowercase identifier (e.g. 'wake up time', 'preferred tone'). Use consistent descriptive keys.",
          },
          value: {
            type: "string",
            description: "The value to remember (e.g. '7 AM', 'brief and direct')",
          },
        },
        required: ["category", "key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_memory",
      description:
        "Remove a remembered fact. Call when the user says 'forget that I...', 'stop remembering...', or asks to remove a fact.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description: "The exact key of the memory to delete.",
          },
        },
        required: ["key"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_task",
      description:
        "Add a task to the user's task list. Call when the user says 'add a task', 'I need to', 'put on my list', 'create a task', 'task to', or mentions something they need to do.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Clear, concise task title (e.g. 'Call John', 'Buy groceries', 'Review report')",
          },
          dueDate: {
            type: "string",
            description:
              "Optional ISO 8601 due date in UTC. Compute from the current datetime when user says 'tomorrow', 'by Friday', etc.",
          },
          category: {
            type: "string",
            enum: ["work", "personal", "health", "finance", "other"],
            description: "Optional task category",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description:
        "Mark a task as complete. Call when the user says 'mark X done', 'complete my X task', 'I finished X', 'done with X', 'check off X'.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "The task title or keyword to match (partial match is fine — 'John' matches 'Call John')",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description:
        "Delete a task. Call when the user says 'delete my X task', 'remove X', 'cancel X task'.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "The task title or keyword to match",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_reminder",
      description:
        "Delete or cancel an existing reminder. Call when the user says 'delete my reminder', 'cancel my reminder for X', 'remove the X reminder', or 'clear my reminder'.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Keyword from the reminder title to match (e.g. 'stretch' to match 'Stretch at desk'). Partial match is fine.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "plan_day",
      description:
        "Create a structured daily plan for the user. Call when the user says 'plan my day', 'help me organize today', 'plan my morning', 'plan my afternoon', 'plan my work tasks for today', 'help me structure my day', or any similar planning request. Use all available context (tasks, reminders, notes, memories) to build a realistic, prioritized, time-aware schedule.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description: "Plan title, e.g. 'Your Morning Plan', 'Today\\'s Work Plan', 'Your Afternoon'",
          },
          timeframe: {
            type: "string",
            enum: ["morning", "afternoon", "evening", "full_day"],
            description: "Which part of the day this plan covers",
          },
          blocks: {
            type: "array",
            description:
              "Ordered list of 4–8 time blocks. Each block is a specific activity, task, reminder, or focus period. Be realistic and leave breathing room.",
            items: {
              type: "object",
              properties: {
                time: {
                  type: "string",
                  description:
                    "Suggested time label, e.g. '8:00 AM', 'Late morning', '2:00–3:00 PM'. Optional if the plan is non-time-specific.",
                },
                title: {
                  type: "string",
                  description: "Short, clear block title, e.g. 'Deep work: proposal draft', 'Gym session', 'Team standup'",
                },
                description: {
                  type: "string",
                  description: "Optional 1-sentence detail or context for this block",
                },
                type: {
                  type: "string",
                  enum: ["task", "reminder", "focus", "break", "routine"],
                  description:
                    "Block type — task: from the user's task list; reminder: time-sensitive reminder; focus: deep work/study; break: rest/meals; routine: daily habits",
                },
                priority: {
                  type: "string",
                  enum: ["high", "medium", "low"],
                  description: "Priority level — high is urgent/important, low is nice-to-have",
                },
              },
              required: ["title", "type"],
            },
          },
        },
        required: ["title", "timeframe", "blocks"],
      },
    },
  },
];

// ── Tool execution ───────────────────────────────────────────────────────────

async function executeTool(
  name: string,
  args: Record<string, string>
): Promise<string> {
  switch (name) {
    case "get_weather":
      return getWeather(args.location ?? "your location");

    case "get_datetime": {
      const tz = args.timezone ?? "UTC";
      try {
        const formatted = new Date().toLocaleString("en-GB", {
          timeZone: tz,
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });
        return `Current date and time: ${formatted} (${tz})`;
      } catch {
        return `Current date and time: ${new Date().toUTCString()} (UTC)`;
      }
    }

    case "web_search":
      return webSearch(args.query ?? "");

    case "set_reminder":
      return `Reminder set: "${args.title}" at ${args.datetime}. Confirm to the user warmly, in one sentence.`;

    case "save_note":
      return `Note captured: "${args.title ?? args.content}". Confirm to the user warmly, in one sentence — e.g. "Noted — saved under Ideas." or just "Got it, saved."`;

    case "delete_note":
      return `Note about "${args.keyword}" deleted. Confirm in one sentence — e.g. "Done, that note is gone."`;

    case "save_memory":
      return `Memory saved: ${args.category} / "${args.key}" = "${args.value}". Confirm naturally in one sentence — e.g. "I'll keep that in mind." Keep it brief and warm.`;

    case "delete_memory":
      return `Memory removed for key "${args.key}". Confirm gracefully in one sentence — e.g. "Done, I've let that go."`;

    case "add_task":
      return `Task added: "${args.title}"${args.dueDate ? ` due ${args.dueDate}` : ""}. Confirm warmly in one sentence — e.g. "Added to your list." Keep it brief.`;

    case "complete_task":
      return `Task "${args.title}" marked complete. Confirm warmly in one sentence — e.g. "Done — crossed off your list." Keep it brief.`;

    case "delete_task":
      return `Task "${args.title}" removed. Confirm in one sentence — e.g. "Removed from your list."`;

    case "delete_reminder":
      return `Reminder "${args.title}" cancelled. Confirm in one sentence — e.g. "Done, that reminder is cleared."`;

    case "plan_day":
      return `Day plan created: "${args.title}". Deliver exactly one warm, composed sentence that sets the tone — e.g. "Here's how I'd structure your morning." or "Your day is laid out." Do not list the blocks; they appear on screen.`;

    default:
      return "Action not available.";
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOKEN_MAP: Record<string, number> = {
  short: 60,
  medium: 120,
  long: 220,
};

// ── ElevenLabs Speech-to-Speech ───────────────────────────────────────────────
//
// Pipeline:
//   text → [3a] OpenAI TTS (alloy, tts-1)  →  source.mp3
//          [3b] ElevenLabs STS (/stream)    →  Mo's voice mp3
//
// Keys:
//   ELEVENLABS_STS_API_KEY  — restricted, used exclusively for the STS endpoint
//   ELEVENLABS_VOICE_ID     — target voice character
//   ELEVENLABS_API_KEY      — no longer used anywhere in active code
//
// Streaming endpoint (/stream) is used for ElevenLabs STS so audio chunks
// arrive as soon as the model starts generating — reduces server-side
// buffering latency vs the non-streaming endpoint.
//
interface SynthTimings {
  openaiTtsMs:    number;  // step 3a: OpenAI TTS duration
  sourceMp3Bytes: number;  // step 3a: size of neutral audio sent to ElevenLabs
  elevenStsMs:    number;  // step 3b: ElevenLabs STS duration
}

async function synthesizeSpeech(
  text: string,
  signal?: AbortSignal,
): Promise<{ buffer: Buffer; timings: SynthTimings }> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const stsKey  = process.env.ELEVENLABS_STS_API_KEY;
  if (!voiceId || !stsKey)
    throw new Error("ElevenLabs STS configuration missing (ELEVENLABS_VOICE_ID / ELEVENLABS_STS_API_KEY).");

  const timeout = AbortSignal.timeout(22_000);
  const combinedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  // ── Step 3a: OpenAI TTS → neutral source audio ──────────────────────────
  // tts-1 is the lowest-latency TTS model. "alloy" is clean and neutral —
  // a good prosody source for STS to convert into Mo's character.
  // mp3 keeps the file small for fast upload to ElevenLabs.
  const t3a = Date.now();
  const ttsRes = await openai.audio.speech.create(
    { model: "tts-1", voice: "alloy", input: text, response_format: "mp3" },
    { signal: combinedSignal }
  );
  const sourceMp3 = Buffer.from(await ttsRes.arrayBuffer());
  const openaiTtsMs    = Date.now() - t3a;
  const sourceMp3Bytes = sourceMp3.byteLength;

  // ── Step 3b: ElevenLabs STS → Mo's voice ────────────────────────────────
  // Model: eleven_english_sts_v2 — the dedicated English STS model, lower
  //   latency than eleven_multilingual_sts_v2. Do NOT use TTS model IDs here.
  // Endpoint: /stream — streams mp3 chunks as the model generates them,
  //   reducing the time-to-first-byte on the ElevenLabs side.
  // optimize_streaming_latency=4 — maximum server-side latency reduction.
  // output_format=mp3_22050_32 — 22 kHz, 32 kbps — smallest viable quality.
  const formData = new FormData();
  formData.append("audio", new Blob([sourceMp3], { type: "audio/mpeg" }), "source.mp3");
  formData.append("model_id", "eleven_english_sts_v2");
  formData.append("voice_settings", JSON.stringify({
    stability:         0.72,
    similarity_boost:  0.82,
    style:             0.0,
    use_speaker_boost: false,
  }));

  const t3b = Date.now();
  const stsRes = await fetch(
    `https://api.elevenlabs.io/v1/speech-to-speech/${voiceId}/stream?optimize_streaming_latency=4&output_format=mp3_22050_32`,
    {
      method:  "POST",
      headers: { "xi-api-key": stsKey },
      body:    formData,
      signal:  combinedSignal,
    }
  );

  if (!stsRes.ok) {
    const errText = await stsRes.text().catch(() => "unknown");
    throw new Error(`ElevenLabs STS error ${stsRes.status}: ${errText}`);
  }

  // Accumulate streamed chunks into a single buffer.
  // Even though we need the full buffer before sending the HTTP response,
  // streaming lets the ElevenLabs server start pushing bytes earlier rather
  // than buffering the entire audio internally before responding.
  const chunks: Buffer[] = [];
  for await (const chunk of stsRes.body as unknown as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  const elevenStsMs = Date.now() - t3b;

  return { buffer: Buffer.concat(chunks), timings: { openaiTtsMs, sourceMp3Bytes, elevenStsMs } };
}

function buildMemorySection(memories: MemoryItem[]): string {
  if (!memories?.length) return "";

  const order: Array<MemoryItem["category"]> = ["personal", "preferences", "schedule", "goals"];
  const grouped: Partial<Record<MemoryItem["category"], MemoryItem[]>> = {};
  for (const m of memories) {
    if (!grouped[m.category]) grouped[m.category] = [];
    grouped[m.category]!.push(m);
  }

  const lines: string[] = [];
  for (const cat of order) {
    const items = grouped[cat];
    if (!items?.length) continue;
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    for (const item of items) lines.push(`• [${label}] ${item.key}: ${item.value}`);
  }

  if (!lines.length) return "";

  return `\n\nWhat you know about this person:\n${lines.join("\n")}\n\nUse these naturally in conversation. Do not recite them unless the user explicitly asks what you remember.`;
}

function buildTasksSection(tasks: Task[]): string {
  const pending = tasks?.filter((t) => t.status === "pending") ?? [];
  if (!pending.length) return "";

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const todayStr = now.toDateString();
      const tomorrowStr = new Date(now.getTime() + 86_400_000).toDateString();
      if (d.toDateString() === todayStr) return "today";
      if (d.toDateString() === tomorrowStr) return "tomorrow";
      return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    } catch {
      return iso;
    }
  };

  const lines = pending.slice(0, 20).map((t) => {
    const catPart = t.category ? `[${t.category}] ` : "";
    const duePart = t.dueDate ? ` — due ${formatDate(t.dueDate)}` : "";
    return `• ${catPart}${t.title}${duePart}`;
  });

  return `\n\nUser's pending tasks (${pending.length} total):\n${lines.join("\n")}\n\nWhen asked about tasks, summarise them naturally. When completing or deleting, confirm which task was affected.`;
}

function buildRemindersSection(reminders: ReminderContext[]): string {
  const upcoming = reminders?.filter(
    (r) => new Date(r.datetime) > new Date()
  ) ?? [];
  if (!upcoming.length) return "";

  const formatDate = (iso: string): string => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const todayStr = now.toDateString();
      const tomorrowStr = new Date(now.getTime() + 86_400_000).toDateString();
      if (d.toDateString() === todayStr)
        return `today at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
      if (d.toDateString() === tomorrowStr)
        return `tomorrow at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })}`;
      return d.toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return iso;
    }
  };

  const lines = upcoming.slice(0, 10).map((r) => `• ${r.title} — ${formatDate(r.datetime)}`);

  return `\n\nUser's upcoming reminders (${upcoming.length} total):\n${lines.join("\n")}\n\nWhen asked about reminders, reference them naturally. To delete a reminder, call delete_reminder with the title keyword.`;
}

function buildNotesSection(notes: NoteContext[]): string {
  if (!notes?.length) return "";

  const formatAge = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  const lines = notes.slice(0, 10).map((n) => {
    const catPart = n.category ? `[${n.category}] ` : "";
    const titlePart = n.title ? n.title : n.content.slice(0, 60) + (n.content.length > 60 ? "…" : "");
    return `• ${catPart}${titlePart} — ${formatAge(n.timestamp)}`;
  });

  return `\n\nUser's recent notes (${notes.length} total):\n${lines.join("\n")}\n\nWhen asked about notes, reference them naturally. To delete a note, call delete_note with a keyword from its content or title.`;
}

function buildSystemPrompt(
  mode: string,
  preferences: {
    name?: string;
    location?: string;
    timezone?: string;
    responseLength?: string;
  } | null,
  memories?: MemoryItem[],
  tasks?: Task[],
  reminders?: ReminderContext[],
  notes?: NoteContext[]
): string {
  const base = MODE_PROMPTS[mode] ?? MODE_PROMPTS.executive;
  const now = new Date().toUTCString();
  const parts = [base, `\nCurrent datetime (UTC): ${now}.`];

  if (preferences?.timezone) parts.push(`User timezone: ${preferences.timezone}.`);
  if (preferences?.name) parts.push(`User's name: ${preferences.name}.`);
  if (preferences?.location) {
    parts.push(
      `User's default location: ${preferences.location}. Use for weather when no location is given.`
    );
  }
  if (preferences?.responseLength) {
    const lenMap: Record<string, string> = {
      short: "Keep responses to ONE sentence.",
      medium: "Keep responses to 1–2 sentences.",
      long: "You may use up to 3 sentences when depth adds value.",
    };
    const inst = lenMap[preferences.responseLength];
    if (inst) parts.push(inst);
  }

  const memorySection = buildMemorySection(memories ?? []);
  if (memorySection) parts.push(memorySection);

  const taskSection = buildTasksSection(tasks ?? []);
  if (taskSection) parts.push(taskSection);

  const reminderSection = buildRemindersSection(reminders ?? []);
  if (reminderSection) parts.push(reminderSection);

  const noteSection = buildNotesSection(notes ?? []);
  if (noteSection) parts.push(noteSection);

  return parts.join(" ");
}

type ToolCallResult = {
  functionCalled: string;
  reminder?: { title: string; content: string; datetime: string };
  reminderAction?: ReminderAction;
  note?: { content: string; title?: string; category?: string };
  noteAction?: NoteAction;
  memoryAction?: MemoryAction;
  taskAction?: TaskAction;
  plan?: DayPlan;
};

// Tools that need no second GPT call — the response is a fixed, Mo-style one-liner.
// Saves ~300–500 ms per action request.
const ACTION_TOOLS = new Set([
  "save_note",
  "delete_note",
  "save_memory",
  "delete_memory",
  "add_task",
  "complete_task",
  "delete_task",
  "set_reminder",
  "delete_reminder",
  "plan_day",
]);

function getQuickReply(toolName: string, args: Record<string, string>): string {
  switch (toolName) {
    case "save_note":      return args.title ? `Noted — saved as "${args.title}".` : "Got it, saved.";
    case "delete_note":    return "Done, that note is gone.";
    case "save_memory":    return "I'll keep that in mind.";
    case "delete_memory":  return "Done, I've let that go.";
    case "add_task":       return args.title ? `Added "${args.title}" to your list.` : "Added to your list.";
    case "complete_task":  return "Done — crossed off your list.";
    case "delete_task":    return "Removed from your list.";
    case "set_reminder":   return args.title ? `Reminder set: ${args.title}.` : "Reminder set.";
    case "delete_reminder":return "Reminder cleared.";
    case "plan_day":       return args.title ? `${args.title} is ready.` : "Your plan is ready.";
    default:               return "";
  }
}

async function runWithTools(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  maxTokens: number,
  signal?: AbortSignal
): Promise<{ reply: string; toolResult: ToolCallResult | null }> {
  const firstCompletion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools: TOOLS,
      tool_choice: "auto",
      max_tokens: maxTokens,
      temperature: 0.6,
    },
    { signal, timeout: 12_000 }
  );

  const firstChoice = firstCompletion.choices[0];
  const assistantMessage = firstChoice?.message;

  if (!assistantMessage?.tool_calls?.length) {
    return { reply: assistantMessage?.content?.trim() ?? "", toolResult: null };
  }

  // Narrow to the standard function tool call shape.
  const toolCall = assistantMessage.tool_calls[0] as {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  };
  const toolName = toolCall.function.name;
  let toolArgs: Record<string, string> = {};
  try {
    toolArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    // ignore parse errors
  }

  // Execute the tool (local logic or external API)
  const toolOutput = await executeTool(toolName, toolArgs);

  // Build client-side metadata for side effects
  const toolResult: ToolCallResult = { functionCalled: toolName };

  if (toolName === "set_reminder") {
    toolResult.reminder = {
      title: toolArgs.title ?? "",
      content: toolArgs.content ?? "",
      datetime: toolArgs.datetime ?? new Date(Date.now() + 3_600_000).toISOString(),
    };
  }
  if (toolName === "save_note") {
    toolResult.note = {
      content: toolArgs.content ?? "",
      title: toolArgs.title,
      category: toolArgs.category,
    };
  }
  if (toolName === "delete_note") {
    toolResult.noteAction = { action: "delete", keyword: toolArgs.keyword ?? "" };
  }
  if (toolName === "plan_day") {
    if (toolArgs.title && toolArgs.timeframe && toolArgs.blocks) {
      toolResult.plan = toolArgs as unknown as DayPlan;
    }
  }
  if (toolName === "save_memory") {
    toolResult.memoryAction = {
      action: "save",
      category: toolArgs.category,
      key: toolArgs.key ?? "",
      value: toolArgs.value ?? "",
    };
  }
  if (toolName === "delete_memory") {
    toolResult.memoryAction = { action: "delete", key: toolArgs.key ?? "" };
  }
  if (toolName === "add_task") {
    toolResult.taskAction = {
      action: "add",
      title: toolArgs.title ?? "",
      dueDate: toolArgs.dueDate,
      category: toolArgs.category,
    };
  }
  if (toolName === "complete_task") {
    toolResult.taskAction = { action: "complete", title: toolArgs.title ?? "" };
  }
  if (toolName === "delete_task") {
    toolResult.taskAction = { action: "delete", title: toolArgs.title ?? "" };
  }
  if (toolName === "delete_reminder") {
    toolResult.reminderAction = { action: "delete", title: toolArgs.title ?? "" };
  }

  // ── Fast path: skip second GPT call for action tools ─────────────────────
  // These tools need no data lookup or synthesis — a pre-written Mo-style
  // one-liner is faster (saves ~300–500 ms) and just as good.
  if (ACTION_TOOLS.has(toolName)) {
    return { reply: getQuickReply(toolName, toolArgs), toolResult };
  }

  // ── Slow path: second GPT call for data-lookup tools (weather, search, time)
  const secondCompletion = await openai.chat.completions.create(
    {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
        assistantMessage,
        { role: "tool", tool_call_id: toolCall.id, content: toolOutput },
      ],
      max_tokens: maxTokens,
      temperature: 0.6,
    },
    { signal, timeout: 12_000 }
  );

  const reply = secondCompletion.choices[0]?.message?.content?.trim() ?? "";
  return { reply, toolResult };
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.post("/mo/chat", async (req: Request, res: Response) => {
  const parsed = MoChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, mode = "executive", messages = [], preferences, memories, tasks, reminders, notes } =
    parsed.data;

  const systemPrompt = buildSystemPrompt(
    mode,
    preferences ?? null,
    (memories as MemoryItem[]) ?? [],
    (tasks as Task[]) ?? [],
    (reminders as ReminderContext[]) ?? [],
    (notes as NoteContext[]) ?? []
  );
  const maxTokens = TOKEN_MAP[preferences?.responseLength ?? "medium"] ?? 120;

  const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    ...(messages ?? []).slice(-10).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: message },
  ];

  try {
    const { reply, toolResult } = await runWithTools(systemPrompt, conversationMessages, maxTokens);
    res.json({
      reply,
      functionCalled: toolResult?.functionCalled,
      reminder: toolResult?.reminder,
      reminderAction: toolResult?.reminderAction,
      note: toolResult?.note,
      noteAction: toolResult?.noteAction,
      memoryAction: toolResult?.memoryAction,
      taskAction: toolResult?.taskAction,
      plan: toolResult?.plan,
    });
  } catch (err: any) {
    req.log.error({ err }, "Mo chat error");
    res.status(500).json({ error: err?.message ?? "Failed to get a response." });
  }
});

router.post("/mo/speak", async (req: Request, res: Response) => {
  const parsed = MoSpeakBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const { buffer } = await synthesizeSpeech(parsed.data.text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.byteLength);
    res.send(buffer);
  } catch (err) {
    req.log.error({ err }, "ElevenLabs STS speak error");
    res.status(500).json({ error: "Failed to synthesize speech." });
  }
});

// ── Pipeline timeout: 24 s hard deadline (Replit proxy kills at ~25 s) ───────
const PIPELINE_TIMEOUT_MS = 24_000;

function pipelineDeadline(): AbortSignal {
  return AbortSignal.timeout(PIPELINE_TIMEOUT_MS);
}

router.post("/mo/voice", async (req: Request, res: Response) => {
  const parsed = MoVoiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const {
    audio,
    format = "m4a",
    mode = "executive",
    messages = [],
    preferences,
    memories,
    tasks,
    reminders,
    notes,
  } = parsed.data;

  const systemPrompt = buildSystemPrompt(
    mode,
    preferences ?? null,
    (memories as MemoryItem[]) ?? [],
    (tasks as Task[]) ?? [],
    (reminders as ReminderContext[]) ?? [],
    (notes as NoteContext[]) ?? []
  );
  const maxTokens = TOKEN_MAP[preferences?.responseLength ?? "medium"] ?? 120;

  // One AbortSignal shared by the whole pipeline — cancelled if we reach 24 s.
  // This prevents any hanging upstream call from blocking the proxy indefinitely.
  const deadline = pipelineDeadline();
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  // Per-stage timing captured as each stage completes. Used in pipeline_summary.
  const stageMs: {
    ffmpeg?:    number;
    whisper?:   number;
    gpt?:       number;
    openaiTts?: number;
    elevenSts?: number;
  } = {};

  try {
    // ── Stage 1: Whisper transcription ─────────────────────────────────────
    const rawBuffer = Buffer.from(audio, "base64");

    // Normalise to WAV using ffmpeg so Whisper always receives a format it
    // accepts unambiguously — avoids MIME-type and codec issues from Android.
    req.log.info({ stage: "ffmpeg_start", ms: elapsed(), inputBytes: rawBuffer.byteLength }, "Voice pipeline");
    const tFfmpeg = Date.now();
    const { buffer: audioBuffer, filename } = await normaliseAudio(rawBuffer, format);
    stageMs.ffmpeg = Date.now() - tFfmpeg;
    req.log.info({ stage: "ffmpeg_done", ms: elapsed(), stageMs: stageMs.ffmpeg, outputBytes: audioBuffer.byteLength, filename }, "Voice pipeline");

    const audioFile = new File([new Uint8Array(audioBuffer)], filename, { type: "audio/wav" });

    req.log.info({ stage: "whisper_start", ms: elapsed() }, "Voice pipeline");
    const tWhisper = Date.now();

    let transcript: string;
    try {
      const transcription = await openai.audio.transcriptions.create(
        { file: audioFile, model: "whisper-1", language: "en" },
        { signal: deadline, timeout: 15_000 }
      );
      transcript = transcription.text.trim();
    } catch (err: any) {
      const isTimeout = err?.name === "AbortError" || err?.name === "TimeoutError" || err?.code === "ECONNABORTED";
      req.log.error({ err: err?.message, ms: elapsed() }, "Whisper failed");
      if (isTimeout) {
        res.status(504).json({ error: "Transcription timed out. Please try again." });
      } else {
        res.status(502).json({ error: "Could not transcribe audio. Please try again." });
      }
      return;
    }

    stageMs.whisper = Date.now() - tWhisper;
    req.log.info({ stage: "whisper_done", ms: elapsed(), stageMs: stageMs.whisper, chars: transcript.length }, "Voice pipeline");

    if (!transcript) {
      res.json({ transcript: "", reply: "", audioBase64: "" });
      return;
    }

    // ── Stage 2: GPT-4o-mini reply ─────────────────────────────────────────
    const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      ...(messages ?? []).slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: transcript },
    ];

    req.log.info({ stage: "gpt_start", ms: elapsed() }, "Voice pipeline");
    const tGpt = Date.now();

    let reply: string;
    let toolResult: ToolCallResult | null;
    try {
      ({ reply, toolResult } = await runWithTools(systemPrompt, conversationMessages, maxTokens, deadline));
    } catch (err: any) {
      req.log.error({ err: err?.message, ms: elapsed() }, "GPT failed");
      res.status(502).json({ error: "AI response failed. Please try again." });
      return;
    }

    stageMs.gpt = Date.now() - tGpt;
    req.log.info({ stage: "gpt_done", ms: elapsed(), stageMs: stageMs.gpt, replyChars: reply.length }, "Voice pipeline");

    if (!reply) {
      res.json({ transcript, reply: "", audioBase64: "" });
      return;
    }

    // ── Stage 3: OpenAI TTS → ElevenLabs STS (graceful — text always returned)
    req.log.info({ stage: "sts_start", ms: elapsed() }, "Voice pipeline");

    let audioBase64 = "";
    try {
      const { buffer: audioResponseBuffer, timings } = await synthesizeSpeech(reply, deadline);

      stageMs.openaiTts = timings.openaiTtsMs;
      stageMs.elevenSts = timings.elevenStsMs;

      req.log.info({
        stage:       "openai_tts_done",
        ms:          elapsed(),
        stageMs:     timings.openaiTtsMs,
        sourceBytes: timings.sourceMp3Bytes,
      }, "Voice pipeline");

      req.log.info({
        stage:    "eleven_sts_done",
        ms:       elapsed(),
        stageMs:  timings.elevenStsMs,
        outBytes: audioResponseBuffer.byteLength,
      }, "Voice pipeline");

      audioBase64 = audioResponseBuffer.toString("base64");
    } catch (err: any) {
      // STS failure is non-fatal — return the text reply without audio.
      // The client shows the reply as text and skips playback.
      req.log.warn({ err: err?.message, ms: elapsed() }, "STS failed — returning text-only response");
    }

    // ── Pipeline summary ────────────────────────────────────────────────────
    // One structured line with every stage's ms, easy to grep and chart.
    req.log.info({
      stage:     "pipeline_summary",
      totalMs:   elapsed(),
      ffmpegMs:  stageMs.ffmpeg,
      whisperMs: stageMs.whisper,
      gptMs:     stageMs.gpt,
      ttsMs:     stageMs.openaiTts,   // step 3a: OpenAI TTS (neutral source)
      stsMs:     stageMs.elevenSts,   // step 3b: ElevenLabs STS (Mo's voice)
      hasAudio:  audioBase64.length > 0,
    }, "Voice pipeline");

    res.json({
      transcript,
      reply,
      audioBase64,
      functionCalled: toolResult?.functionCalled,
      reminder: toolResult?.reminder,
      reminderAction: toolResult?.reminderAction,
      note: toolResult?.note,
      noteAction: toolResult?.noteAction,
      memoryAction: toolResult?.memoryAction,
      taskAction: toolResult?.taskAction,
      plan: toolResult?.plan,
    });
  } catch (err: any) {
    const isTimeout = err?.name === "AbortError" || err?.name === "TimeoutError";
    req.log.error({ err: err?.message, ms: elapsed() }, "Voice pipeline uncaught error");
    if (isTimeout) {
      res.status(504).json({ error: "Request timed out. Please try again." });
    } else {
      res.status(500).json({ error: err?.message ?? "Voice pipeline failed." });
    }
  }
});

export default router;
