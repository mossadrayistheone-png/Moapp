import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import {
  MoChatBody,
  MoSpeakBody,
  MoVoiceBody,
} from "@workspace/api-zod";
import { getWeather } from "../services/weather.js";
import { webSearch } from "../services/search.js";

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

// ── Memory types ─────────────────────────────────────────────────────────────

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

// ── OpenAI tool definitions ──────────────────────────────────────────────────

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description:
        "Get current weather conditions for a location. Call when the user asks about weather, temperature, or conditions.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City name or location (e.g. 'London', 'New York', 'Tokyo')",
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
        "Get the current date and time. Call when the user asks what time or date it is, or the day of the week.",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description:
              "IANA timezone name (e.g. 'America/New_York', 'Europe/London'). Use 'UTC' if unknown.",
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
          title: {
            type: "string",
            description: "Short reminder title (5 words max)",
          },
          content: {
            type: "string",
            description: "Full reminder message",
          },
          datetime: {
            type: "string",
            description:
              "Absolute ISO 8601 datetime in UTC (e.g. '2024-11-15T15:00:00Z'). Compute from the current time provided in the system prompt.",
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
        "Save a quick note. Call when the user says 'note', 'write this down', 'remember this', 'capture', or similar — but NOT for personal facts about themselves (use save_memory for those).",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The full note content to save",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_memory",
      description:
        "Save or update a personal fact or preference about the user — something Mo should remember long-term. Call when the user says 'remember that I...', 'keep in mind that I...', 'I want you to know that I...', 'note that I prefer...', or similar phrases about themselves.",
      parameters: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["personal", "preferences", "schedule", "goals"],
            description:
              "personal = identity facts (name, birthday, family). preferences = how they like things done. schedule = routines and timing. goals = aspirations and targets.",
          },
          key: {
            type: "string",
            description:
              "Short lowercase identifier for this fact (e.g. 'wake up time', 'preferred response style', 'current project'). Use consistent, descriptive keys.",
          },
          value: {
            type: "string",
            description:
              "The value to remember, written concisely (e.g. '7 AM', 'brief and direct', 'launching Mo app by Q1')",
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
        "Remove a specific remembered fact. Call when the user says 'forget that I...', 'stop remembering...', or asks Mo to remove a previously saved fact.",
      parameters: {
        type: "object",
        properties: {
          key: {
            type: "string",
            description:
              "The exact key of the memory to delete, as it appears in the current memories list in the system prompt.",
          },
        },
        required: ["key"],
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
        const now = new Date();
        const formatted = now.toLocaleString("en-GB", {
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
      return `Note captured: "${args.content}". Confirm to the user warmly, in one sentence.`;

    case "save_memory":
      return `Memory saved: ${args.category} / "${args.key}" = "${args.value}". Confirm to the user naturally in one sentence — e.g. "I'll keep that in mind" or "Noted — I'll remember that." Keep it brief and warm.`;

    case "delete_memory":
      return `Memory removed for key "${args.key}". Confirm to the user in one sentence, gracefully — e.g. "Done, I've let that go."`;

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

async function synthesizeSpeech(text: string): Promise<Buffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!voiceId || !apiKey) throw new Error("ElevenLabs configuration missing.");

  const elevenRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.75,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!elevenRes.ok) {
    const errText = await elevenRes.text();
    throw new Error(`ElevenLabs error ${elevenRes.status}: ${errText}`);
  }

  return Buffer.from(await elevenRes.arrayBuffer());
}

function buildMemorySection(memories: MemoryItem[]): string {
  if (!memories?.length) return "";

  const order: Array<MemoryItem["category"]> = [
    "personal",
    "preferences",
    "schedule",
    "goals",
  ];
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
    for (const item of items) {
      lines.push(`• [${label}] ${item.key}: ${item.value}`);
    }
  }

  if (!lines.length) return "";

  return `\n\nWhat you know about this person:\n${lines.join("\n")}\n\nUse these naturally in conversation. Do not recite them as a list unless the user explicitly asks what you remember. When relevant, weave them in with warmth.`;
}

function buildSystemPrompt(
  mode: string,
  preferences: {
    name?: string;
    location?: string;
    timezone?: string;
    responseLength?: string;
  } | null,
  memories?: MemoryItem[]
): string {
  const base = MODE_PROMPTS[mode] ?? MODE_PROMPTS.executive;
  const now = new Date().toUTCString();
  const parts = [base, `\nCurrent datetime (UTC): ${now}.`];

  if (preferences?.timezone) {
    parts.push(`User timezone: ${preferences.timezone}.`);
  }
  if (preferences?.name) {
    parts.push(`User's name: ${preferences.name}.`);
  }
  if (preferences?.location) {
    parts.push(
      `User's default location: ${preferences.location}. Use this for weather queries when no location is specified.`
    );
  }
  if (preferences?.responseLength) {
    const lenMap: Record<string, string> = {
      short: "Keep responses to ONE sentence.",
      medium: "Keep responses to 1–2 sentences.",
      long: "You may use up to 3 sentences when depth adds value.",
    };
    const lenInstruction = lenMap[preferences.responseLength];
    if (lenInstruction) parts.push(lenInstruction);
  }

  const memorySection = buildMemorySection(memories ?? []);
  if (memorySection) parts.push(memorySection);

  return parts.join(" ");
}

type ToolCallResult = {
  functionCalled: string;
  reminder?: { title: string; content: string; datetime: string };
  note?: { content: string };
  memoryAction?: MemoryAction;
};

async function runWithTools(
  systemPrompt: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  maxTokens: number
): Promise<{ reply: string; toolResult: ToolCallResult | null }> {
  // First call — may trigger a tool
  const firstCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    tools: TOOLS,
    tool_choice: "auto",
    max_tokens: maxTokens,
    temperature: 0.6,
  });

  const firstChoice = firstCompletion.choices[0];
  const assistantMessage = firstChoice?.message;

  // No tool call — direct answer
  if (!assistantMessage?.tool_calls?.length) {
    return {
      reply: assistantMessage?.content?.trim() ?? "",
      toolResult: null,
    };
  }

  const toolCall = assistantMessage.tool_calls[0];
  const toolName = toolCall.function.name;
  let toolArgs: Record<string, string> = {};
  try {
    toolArgs = JSON.parse(toolCall.function.arguments);
  } catch {
    // ignore parse errors
  }

  const toolOutput = await executeTool(toolName, toolArgs);

  // Build tool result metadata for client
  const toolResult: ToolCallResult = { functionCalled: toolName };

  if (toolName === "set_reminder") {
    toolResult.reminder = {
      title: toolArgs.title ?? "",
      content: toolArgs.content ?? "",
      datetime: toolArgs.datetime ?? new Date(Date.now() + 3600_000).toISOString(),
    };
  }
  if (toolName === "save_note") {
    toolResult.note = { content: toolArgs.content ?? "" };
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
    toolResult.memoryAction = {
      action: "delete",
      key: toolArgs.key ?? "",
    };
  }

  // Second call — synthesize final response using tool result
  const secondCompletion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
      assistantMessage,
      {
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolOutput,
      },
    ],
    max_tokens: maxTokens,
    temperature: 0.6,
  });

  const reply =
    secondCompletion.choices[0]?.message?.content?.trim() ?? "";

  return { reply, toolResult };
}

// ── Routes ───────────────────────────────────────────────────────────────────

router.post("/mo/chat", async (req: Request, res: Response) => {
  const parsed = MoChatBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const { message, mode = "executive", messages = [], preferences, memories } =
    parsed.data;

  const systemPrompt = buildSystemPrompt(
    mode,
    preferences ?? null,
    (memories as MemoryItem[]) ?? []
  );
  const maxTokens = TOKEN_MAP[preferences?.responseLength ?? "medium"] ?? 120;

  const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    [
      ...(messages ?? []).slice(-10).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ];

  try {
    const { reply, toolResult } = await runWithTools(
      systemPrompt,
      conversationMessages,
      maxTokens
    );

    res.json({
      reply,
      functionCalled: toolResult?.functionCalled,
      reminder: toolResult?.reminder,
      note: toolResult?.note,
      memoryAction: toolResult?.memoryAction,
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
    const audioBuffer = await synthesizeSpeech(parsed.data.text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.byteLength);
    res.send(audioBuffer);
  } catch (err) {
    req.log.error({ err }, "ElevenLabs speak error");
    res.status(500).json({ error: "Failed to synthesize speech." });
  }
});

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
  } = parsed.data;

  const systemPrompt = buildSystemPrompt(
    mode,
    preferences ?? null,
    (memories as MemoryItem[]) ?? []
  );
  const maxTokens = TOKEN_MAP[preferences?.responseLength ?? "medium"] ?? 120;

  try {
    // 1. Transcribe with Whisper
    const audioBuffer = Buffer.from(audio, "base64");
    const mimeMap: Record<string, string> = {
      m4a: "audio/m4a",
      mp4: "audio/mp4",
      wav: "audio/wav",
      caf: "audio/x-caf",
    };
    const audioFile = new File([audioBuffer], `rec.${format}`, {
      type: mimeMap[format] ?? "audio/m4a",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
    });

    const transcript = transcription.text.trim();
    if (!transcript) {
      res.json({ transcript: "", reply: "", audioBase64: "" });
      return;
    }

    // 2. Build conversation messages
    const conversationMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
      [
        ...(messages ?? []).slice(-10).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })),
        { role: "user" as const, content: transcript },
      ];

    // 3. Get Mo's reply (with tool calling + memory-aware prompt)
    const { reply, toolResult } = await runWithTools(
      systemPrompt,
      conversationMessages,
      maxTokens
    );

    if (!reply) {
      res.json({ transcript, reply: "", audioBase64: "" });
      return;
    }

    // 4. Synthesize speech
    const audioResponseBuffer = await synthesizeSpeech(reply);
    const audioBase64 = audioResponseBuffer.toString("base64");

    res.json({
      transcript,
      reply,
      audioBase64,
      functionCalled: toolResult?.functionCalled,
      reminder: toolResult?.reminder,
      note: toolResult?.note,
      memoryAction: toolResult?.memoryAction,
    });
  } catch (err: any) {
    req.log.error({ err }, "Voice pipeline error");
    res.status(500).json({ error: err?.message ?? "Voice pipeline failed." });
  }
});

export default router;
