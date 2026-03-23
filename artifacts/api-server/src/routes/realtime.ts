import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import nodePath from "path";
import { WebSocket as WsClient, type WebSocket as WsSocket } from "ws";
import type { IncomingMessage } from "http";
import { getWeather } from "../services/weather.js";
import { webSearch } from "../services/search.js";

const execAsync = promisify(exec);

// ── OpenAI Realtime API ──────────────────────────────────────────────────────
const OPENAI_WS_URL =
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17";

// Premium voice for Mo. "shimmer" is warm, composed, and professional.
const REALTIME_VOICE = "shimmer";

// ── Audio helpers ─────────────────────────────────────────────────────────────

// Convert any mobile audio format (M4A/WebM) to raw PCM16 24 kHz mono for
// OpenAI Realtime API input. Uses ffmpeg which is already installed.
async function audioToPcm16(inputBuffer: Buffer, ext: string): Promise<Buffer> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath = nodePath.join(os.tmpdir(), `mo-rt-in-${id}.${ext}`);
  const outPath = nodePath.join(os.tmpdir(), `mo-rt-out-${id}.raw`);
  try {
    fs.writeFileSync(inPath, inputBuffer);
    await execAsync(
      `ffmpeg -y -i "${inPath}" -ar 24000 -ac 1 -f s16le "${outPath}" 2>/dev/null`
    );
    return fs.readFileSync(outPath);
  } catch {
    throw new Error("Audio conversion failed — check ffmpeg installation.");
  } finally {
    try { fs.unlinkSync(inPath); } catch { /* ignore */ }
    try { fs.unlinkSync(outPath); } catch { /* ignore */ }
  }
}

// Wrap raw PCM16 bytes in a WAV container header so expo-av can play it.
// PCM16 24 kHz mono: sampleRate=24000, bitDepth=16, channels=1
function pcm16ToWav(pcm16: Buffer, sampleRate = 24_000, channels = 1): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm16.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);           // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm16.length, 40);
  return Buffer.concat([header, pcm16]);
}

// ── Personality prompts ──────────────────────────────────────────────────────

const SHARED_RULES = `
Rules that never change:
- 1 to 2 sentences only. Never more. Brevity is a form of respect.
- Never use filler: no "Of course", "Certainly", "Great question", "Sure", "Absolutely".
- Never start with "I". Lead with the insight.
- No lists. No bullet points. No markdown. Pure prose.
- When you receive search or weather results, use them naturally.
- Never say you lack access to information. Engage with substance.
- When estimating, do so with conviction.`;

const MODE_PROMPTS: Record<string, string> = {
  executive: `You are Mo — a private advisor of the highest order. Intelligent, discreet, graceful.
${SHARED_RULES}
Tone: composed, assured, slightly warm. Precise language, elevated but never academic. Never hedge. Like a trusted advisor at a private members club who has seen everything and remains unimpressed, yet fully attentive.`,

  creative: `You are Mo — a brilliant creative mind and trusted confidant.
${SHARED_RULES}
Tone: imaginative yet grounded. Find the unexpected angle — the reframe, the metaphor, the perspective that makes someone pause. Vivid and precise language.`,

  motivational: `You are Mo — a composed force of clarity and forward momentum.
${SHARED_RULES}
Tone: direct, energising, deeply human. No hollow cheerleading — only conviction rooted in truth. Spare, powerful language.`,

  planner: `You are Mo — a masterful daily planner and strategic advisor.
${SHARED_RULES}
Tone: structured yet human. Think in blocks of time, energy levels, and priorities. Speak like a chief of staff who keeps things moving without creating anxiety.`,
};

function buildSystemPrompt(config: SessionConfig): string {
  const base = MODE_PROMPTS[config.mode ?? "executive"] ?? MODE_PROMPTS.executive;
  const now = new Date().toUTCString();
  const parts = [base, `\nCurrent datetime (UTC): ${now}.`];

  const p = config.preferences;
  if (p?.timezone) parts.push(`User timezone: ${p.timezone}.`);
  if (p?.name)     parts.push(`User's name: ${p.name}.`);
  if (p?.location) parts.push(`User's default location: ${p.location}. Use for weather when no location is given.`);
  if (p?.responseLength) {
    const m: Record<string, string> = {
      short: "Keep responses to ONE sentence.",
      medium: "Keep responses to 1–2 sentences.",
      long: "You may use up to 3 sentences when depth adds value.",
    };
    if (m[p.responseLength]) parts.push(m[p.responseLength]);
  }

  if (config.memories?.length) {
    const lines = config.memories.map(
      (m) => `• [${m.category ?? ""}] ${m.key}: ${m.value}`
    );
    parts.push(`\nWhat you know about this person:\n${lines.join("\n")}\nUse naturally — don't recite unless asked.`);
  }

  const pending = config.tasks?.filter((t) => t.status === "pending") ?? [];
  if (pending.length) {
    const lines = pending.slice(0, 20).map((t) => `• ${t.title}`);
    parts.push(`\nUser's pending tasks:\n${lines.join("\n")}`);
  }

  const upcoming = config.reminders?.filter(
    (r) => new Date(r.datetime) > new Date()
  ) ?? [];
  if (upcoming.length) {
    const lines = upcoming.slice(0, 10).map((r) => `• ${r.title} — ${r.datetime}`);
    parts.push(`\nUser's upcoming reminders:\n${lines.join("\n")}`);
  }

  if (config.notes?.length) {
    const lines = config.notes.slice(0, 10).map((n) => `• ${n.title ?? n.content.slice(0, 60)}`);
    parts.push(`\nUser's recent notes:\n${lines.join("\n")}`);
  }

  if (config.messages?.length) {
    const recent = config.messages.slice(-10);
    parts.push(
      `\nRecent conversation:\n${recent.map((m) => `${m.role}: ${m.content}`).join("\n")}`
    );
  }

  return parts.join(" ");
}

// ── Realtime API tools (flat format — different from Chat Completions) ────────

const REALTIME_TOOLS = [
  { type: "function", name: "get_weather",     description: "Get current weather for a location.",                                           parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } },
  { type: "function", name: "get_datetime",    description: "Get current date and time.",                                                    parameters: { type: "object", properties: { timezone: { type: "string" } } } },
  { type: "function", name: "web_search",      description: "Search the web for current information.",                                       parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { type: "function", name: "set_reminder",    description: "Schedule a reminder.",                                                          parameters: { type: "object", properties: { title: { type: "string" }, content: { type: "string" }, datetime: { type: "string" } }, required: ["title","content","datetime"] } },
  { type: "function", name: "save_note",       description: "Save a quick note or idea.",                                                    parameters: { type: "object", properties: { content: { type: "string" }, title: { type: "string" }, category: { type: "string", enum: ["idea","meeting","personal","work","other"] } }, required: ["content"] } },
  { type: "function", name: "delete_note",     description: "Delete a saved note by keyword.",                                               parameters: { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"] } },
  { type: "function", name: "save_memory",     description: "Save a personal fact about the user.",                                          parameters: { type: "object", properties: { category: { type: "string", enum: ["personal","preferences","schedule","goals"] }, key: { type: "string" }, value: { type: "string" } }, required: ["category","key","value"] } },
  { type: "function", name: "delete_memory",   description: "Remove a remembered fact.",                                                     parameters: { type: "object", properties: { key: { type: "string" } }, required: ["key"] } },
  { type: "function", name: "add_task",        description: "Add a task to the user's list.",                                                parameters: { type: "object", properties: { title: { type: "string" }, dueDate: { type: "string" }, category: { type: "string", enum: ["work","personal","health","finance","other"] } }, required: ["title"] } },
  { type: "function", name: "complete_task",   description: "Mark a task complete.",                                                         parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
  { type: "function", name: "delete_task",     description: "Delete a task.",                                                                parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
  { type: "function", name: "delete_reminder", description: "Delete an existing reminder.",                                                  parameters: { type: "object", properties: { title: { type: "string" } }, required: ["title"] } },
  { type: "function", name: "plan_day",        description: "Create a structured daily plan. Call when user asks to plan their day.",        parameters: { type: "object", properties: { title: { type: "string" }, timeframe: { type: "string", enum: ["morning","afternoon","evening","full_day"] }, blocks: { type: "array", items: { type: "object", properties: { time: { type: "string" }, title: { type: "string" }, description: { type: "string" }, type: { type: "string", enum: ["task","reminder","focus","break","routine"] }, priority: { type: "string", enum: ["high","medium","low"] } }, required: ["title","type"] } } }, required: ["title","timeframe","blocks"] } },
];

// ── Tool execution ────────────────────────────────────────────────────────────

async function executeTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case "get_weather":     return getWeather(args.location ?? "your location");
    case "get_datetime": {
      const tz = args.timezone ?? "UTC";
      try {
        return `Current date and time: ${new Date().toLocaleString("en-GB", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: true })} (${tz})`;
      } catch { return `Current date and time: ${new Date().toUTCString()} (UTC)`; }
    }
    case "web_search":      return webSearch(args.query ?? "");
    case "set_reminder":    return `Reminder set: "${args.title}" at ${args.datetime}. Confirm warmly, one sentence.`;
    case "save_note":       return `Note captured: "${args.title ?? args.content}". Confirm warmly, one sentence.`;
    case "delete_note":     return `Note about "${args.keyword}" deleted. Confirm in one sentence.`;
    case "save_memory":     return `Memory saved: ${args.category} / "${args.key}" = "${args.value}". Confirm naturally, one sentence.`;
    case "delete_memory":   return `Memory removed for key "${args.key}". Confirm gracefully, one sentence.`;
    case "add_task":        return `Task added: "${args.title}"${args.dueDate ? ` due ${args.dueDate}` : ""}. Confirm warmly, one sentence.`;
    case "complete_task":   return `Task "${args.title}" marked complete. Confirm warmly, one sentence.`;
    case "delete_task":     return `Task "${args.title}" removed. Confirm in one sentence.`;
    case "delete_reminder": return `Reminder "${args.title}" cancelled. Confirm in one sentence.`;
    case "plan_day":        return `Day plan created: "${args.title}". Deliver one warm sentence setting the tone. Do not list the blocks; they appear on screen.`;
    default:                return "Action not available.";
  }
}

// Build the payload that gets forwarded to the mobile client so it can apply
// side effects (save to local storage, fire callbacks, etc.)
function buildClientPayload(name: string, args: Record<string, string>) {
  const base: Record<string, unknown> = { functionCalled: name };

  if (name === "set_reminder")    base.reminder    = { title: args.title ?? "", content: args.content ?? "", datetime: args.datetime ?? new Date(Date.now() + 3_600_000).toISOString() };
  if (name === "save_note")       base.note        = { content: args.content ?? "", title: args.title, category: args.category };
  if (name === "delete_note")     base.noteAction  = { action: "delete", keyword: args.keyword ?? "" };
  if (name === "save_memory")     base.memoryAction = { action: "save", category: args.category, key: args.key ?? "", value: args.value ?? "" };
  if (name === "delete_memory")   base.memoryAction = { action: "delete", key: args.key ?? "" };
  if (name === "add_task")        base.taskAction  = { action: "add", title: args.title ?? "", dueDate: args.dueDate, category: args.category };
  if (name === "complete_task")   base.taskAction  = { action: "complete", title: args.title ?? "" };
  if (name === "delete_task")     base.taskAction  = { action: "delete", title: args.title ?? "" };
  if (name === "delete_reminder") base.reminderAction = { action: "delete", title: args.title ?? "" };
  if (name === "plan_day" && args.title && args.timeframe && args.blocks) {
    try { base.plan = { title: args.title, timeframe: args.timeframe, blocks: JSON.parse(args.blocks) }; } catch { /* ignore */ }
  }

  return base;
}

// ── Session config shape (received from mobile) ───────────────────────────────

interface SessionConfig {
  mode?: string;
  memories?: Array<{ category?: string; key: string; value: string }>;
  tasks?: Array<{ id: string; title: string; status: string }>;
  reminders?: Array<{ id: string; title: string; content: string; datetime: string }>;
  notes?: Array<{ id: string; content: string; title?: string; category?: string; timestamp: number }>;
  preferences?: { name?: string; location?: string; timezone?: string; responseLength?: string };
  messages?: Array<{ role: string; content: string }>;
}

// ── Main WebSocket handler ────────────────────────────────────────────────────

export function handleRealtimeConnection(clientWs: WsSocket, _req: IncomingMessage) {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    clientWs.send(JSON.stringify({ type: "error", message: "Server misconfiguration." }));
    clientWs.close();
    return;
  }

  let openaiWs: WsClient | null = null;
  let sessionReady = false;
  let sessionConfig: SessionConfig = {};

  // Audio accumulation from mobile (binary frames)
  const audioChunks: Buffer[] = [];

  // Response state for a single turn
  const pcm16Chunks: Buffer[] = [];
  let transcriptAcc = "";
  let pendingToolCall: { callId: string; name: string; argsAcc: string } | null = null;
  let isProcessing = false;

  // ── Helpers ──────────────────────────────────────────────────────────────

  const sendToClient = (msg: Record<string, unknown>) => {
    if (clientWs.readyState === 1 /* OPEN */) {
      clientWs.send(JSON.stringify(msg));
    }
  };

  const sendToOpenAI = (msg: Record<string, unknown>) => {
    if (openaiWs?.readyState === 1 /* OPEN */) {
      openaiWs.send(JSON.stringify(msg));
    }
  };

  const resetTurnState = () => {
    pcm16Chunks.length = 0;
    transcriptAcc = "";
    pendingToolCall = null;
  };

  const configureSession = () => {
    const instructions = buildSystemPrompt(sessionConfig);
    sendToOpenAI({
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        instructions,
        voice: REALTIME_VOICE,
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        input_audio_transcription: { model: "whisper-1" },
        turn_detection: null,
        tools: REALTIME_TOOLS,
        tool_choice: "auto",
        temperature: 0.8,
        max_response_output_tokens: 256,
      },
    });
  };

  // ── OpenAI Realtime WebSocket ─────────────────────────────────────────────

  const openOpenAISession = () => {
    if (openaiWs && openaiWs.readyState <= 1) return;

    openaiWs = new WsClient(OPENAI_WS_URL, {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1",
      },
    });

    openaiWs.on("open", () => {
      sessionReady = false;
      configureSession();
    });

    openaiWs.on("message", async (rawData) => {
      let event: Record<string, unknown>;
      try { event = JSON.parse(rawData.toString()); } catch { return; }

      const { type } = event;

      switch (type) {
        // ── Session ready ──────────────────────────────────────────────────
        case "session.updated":
          sessionReady = true;
          // If there's audio queued from a "voice" message that arrived before
          // the session was confirmed ready, flush it now.
          if (isProcessing && audioChunks.length > 0) {
            const ext = ((clientWs as unknown as Record<string, unknown>).__pendingExt as string | undefined) ?? "m4a";
            void flushAudioToOpenAI(ext);
          }
          break;

        // ── Audio delta: accumulate PCM16 chunks ───────────────────────────
        case "response.audio.delta": {
          const delta = (event as any).delta as string | undefined;
          if (delta) pcm16Chunks.push(Buffer.from(delta, "base64"));
          break;
        }

        // ── Audio transcript delta ─────────────────────────────────────────
        case "response.audio_transcript.delta":
          transcriptAcc += (event as any).delta ?? "";
          break;

        // ── All audio for this response received ───────────────────────────
        case "response.audio.done": {
          if (pcm16Chunks.length > 0) {
            const pcm16 = Buffer.concat(pcm16Chunks);
            const wav   = pcm16ToWav(pcm16);
            sendToClient({ type: "audio", data: wav.toString("base64"), mimeType: "audio/wav" });
          }
          break;
        }

        // ── Full transcript for this turn ──────────────────────────────────
        case "response.audio_transcript.done": {
          const text = ((event as any).transcript as string | undefined) || transcriptAcc;
          if (text) sendToClient({ type: "transcript", text });
          transcriptAcc = "";
          break;
        }

        // ── Function call arguments accumulating ───────────────────────────
        case "response.function_call_arguments.delta": {
          if (pendingToolCall) {
            pendingToolCall.argsAcc += (event as any).delta ?? "";
          }
          break;
        }

        // ── Function call complete ─────────────────────────────────────────
        case "response.output_item.done": {
          const item = (event as any).item as Record<string, unknown> | undefined;
          if (item?.type === "function_call") {
            pendingToolCall = {
              callId: item.call_id as string,
              name: item.name as string,
              argsAcc: item.arguments as string ?? "{}",
            };
          }
          break;
        }

        // ── Full response done ─────────────────────────────────────────────
        case "response.done": {
          if (pendingToolCall) {
            const { callId, name, argsAcc } = pendingToolCall;
            pendingToolCall = null;

            let args: Record<string, string> = {};
            try { args = JSON.parse(argsAcc); } catch { /* use empty */ }

            // Execute tool locally, notify client, send result back to OpenAI
            const toolOutput = await executeTool(name, args);
            const clientPayload = buildClientPayload(name, args);
            sendToClient({ type: "tool_result", ...clientPayload });

            // Reset PCM buffer for the next response cycle
            pcm16Chunks.length = 0;
            transcriptAcc = "";

            sendToOpenAI({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id: callId, output: toolOutput },
            });
            sendToOpenAI({ type: "response.create", response: { modalities: ["text", "audio"] } });
          } else {
            // No tool call — pipeline is complete
            sendToClient({ type: "done" });
            isProcessing = false;
          }
          break;
        }

        // ── Errors from OpenAI ─────────────────────────────────────────────
        case "error": {
          const msg = ((event as any).error as { message?: string } | undefined)?.message ?? "OpenAI Realtime error";
          sendToClient({ type: "error", message: msg });
          isProcessing = false;
          break;
        }
      }
    });

    openaiWs.on("close", () => {
      openaiWs = null;
      sessionReady = false;
    });

    openaiWs.on("error", (err) => {
      sendToClient({ type: "error", message: `Realtime connection error: ${err.message}` });
      isProcessing = false;
    });
  };

  // ── Convert and flush the accumulated M4A audio to the OpenAI session ─────

  const flushAudioToOpenAI = async (ext = "m4a") => {
    if (audioChunks.length === 0) {
      sendToClient({ type: "error", message: "No audio received." });
      isProcessing = false;
      return;
    }

    const rawBuffer = Buffer.concat(audioChunks);
    audioChunks.length = 0;

    try {
      const pcm16 = await audioToPcm16(rawBuffer, ext);
      const pcm16b64 = pcm16.toString("base64");

      resetTurnState();

      sendToOpenAI({ type: "input_audio_buffer.append", audio: pcm16b64 });
      sendToOpenAI({ type: "input_audio_buffer.commit" });
      sendToOpenAI({ type: "response.create", response: { modalities: ["text", "audio"] } });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Audio processing failed.";
      sendToClient({ type: "error", message: msg });
      isProcessing = false;
    }
  };

  // ── Handle messages from mobile ───────────────────────────────────────────

  clientWs.on("message", async (data) => {
    // Binary frames = raw M4A audio bytes (alternative streaming path, future use)
    if (Buffer.isBuffer(data)) {
      audioChunks.push(data);
      return;
    }

    let msg: Record<string, unknown>;
    try { msg = JSON.parse(data.toString()); } catch { return; }

    switch (msg.type) {
      // ── "voice" — the primary single-shot message: config + audio in one ──
      case "voice": {
        if (isProcessing) return; // Prevent duplicate concurrent requests
        isProcessing = true;

        sessionConfig = msg as unknown as SessionConfig;

        const audioBase64 = msg.audio as string | undefined;
        const audioExt    = (msg.format as string | undefined) ?? "m4a";

        if (!audioBase64) {
          sendToClient({ type: "error", message: "No audio data." });
          isProcessing = false;
          return;
        }

        // Push base64-decoded audio into the chunk buffer
        audioChunks.length = 0;
        audioChunks.push(Buffer.from(audioBase64, "base64"));

        // Open / reconfigure the OpenAI session with the latest context, then
        // flush audio. If the session is already open we reconfigure in-place.
        if (!openaiWs || openaiWs.readyState > 1) {
          openOpenAISession();
          // flushAudioToOpenAI will be called once session.updated fires (see above)
        } else if (sessionReady) {
          configureSession();
          // Give session.updated a moment to fire; if it doesn't within 500 ms
          // just flush anyway (session was already configured)
          setTimeout(() => {
            if (isProcessing && audioChunks.length > 0) {
              void flushAudioToOpenAI(audioExt);
            }
          }, 500);
        }

        // Stash the format so flushAudioToOpenAI can use it when it fires
        // from the session.updated handler
        (clientWs as unknown as Record<string, unknown>).__pendingExt = audioExt;
        break;
      }

      // ── Legacy multi-step protocol (kept for compatibility) ───────────────
      case "config": {
        sessionConfig = msg as unknown as SessionConfig;
        if (!openaiWs || openaiWs.readyState > 1) {
          openOpenAISession();
        } else if (sessionReady) {
          configureSession();
        }
        break;
      }

      case "audio_done": {
        if (isProcessing) return;
        isProcessing = true;
        const audioExt = (msg.format as string | undefined) ?? "m4a";

        if (!sessionReady) {
          const deadline = Date.now() + 8_000;
          const wait = setInterval(() => {
            if (sessionReady) { clearInterval(wait); void flushAudioToOpenAI(audioExt); }
            else if (Date.now() > deadline) { clearInterval(wait); sendToClient({ type: "error", message: "Session timeout." }); isProcessing = false; }
          }, 100);
        } else {
          void flushAudioToOpenAI(audioExt);
        }
        break;
      }

      case "interrupt": {
        sendToOpenAI({ type: "response.cancel" });
        isProcessing = false;
        break;
      }
    }
  });

  clientWs.on("close", () => {
    openaiWs?.close();
    openaiWs = null;
  });

  clientWs.on("error", () => {
    openaiWs?.close();
    openaiWs = null;
  });

  // Greet the client immediately so the mobile app knows the connection is live
  sendToClient({ type: "connected" });
}
