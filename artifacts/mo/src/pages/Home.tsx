import { motion, AnimatePresence } from "framer-motion";
import { useVoiceAssistant, type AssistantMode } from "@/hooks/use-voice-assistant";
import { MicButton } from "@/components/MicButton";
import { Waveform } from "@/components/Waveform";
import { BackgroundVideo } from "@/components/BackgroundVideo";
import { cn } from "@/lib/utils";

const MODES: { id: AssistantMode; label: string }[] = [
  { id: "executive", label: "Executive" },
  { id: "creative", label: "Creative" },
  { id: "motivational", label: "Motivational" },
];

export default function Home() {
  const assistant = useVoiceAssistant();

  let statusLabel = "Tap to speak";
  if (assistant.isListening) statusLabel = "Listening...";
  if (assistant.isThinking) statusLabel = "Thinking...";
  if (assistant.isSpeaking) statusLabel = "Speaking...";
  if (assistant.isError) statusLabel = "Error. Try again.";

  const statusCharacters = statusLabel.split('');

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center overflow-hidden">

      {/* Full-screen background video */}
      <BackgroundVideo />

      {/* Top Brand Mark — sits directly over the video */}
      <header className="absolute top-0 w-full p-8 flex justify-center z-10 pointer-events-none">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="font-display text-3xl font-medium tracking-widest text-primary italic drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]"
          style={{ textShadow: "0 2px 16px rgba(0,0,0,0.9), 0 0 20px hsl(45 61% 56% / 0.3)" }}
        >
          Mo.
        </motion.h1>
      </header>

      {/* Central UI Panel — semi-transparent card that holds all interactive content */}
      <main className="relative z-10 flex flex-col items-center justify-between w-full min-h-[100dvh] py-24 px-6">

        {/* Text display area — frosted panel, only rendered when there's content */}
        <div className="flex-1 flex items-center justify-center w-full max-w-2xl mx-auto">
          <AnimatePresence mode="wait">

            {(assistant.isListening || (assistant.isThinking && !assistant.reply)) && (
              <motion.div
                key="transcript"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="w-full rounded-2xl px-8 py-6 text-center"
                style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
              >
                <p className="text-xl sm:text-2xl text-white/80 font-light leading-relaxed">
                  {assistant.transcript || <span className="opacity-40">Listening...</span>}
                </p>
              </motion.div>
            )}

            {(assistant.isSpeaking || (assistant.reply && assistant.isIdle)) && (
              <motion.div
                key="reply"
                initial={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="w-full rounded-2xl px-8 py-8 text-center"
                style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)" }}
              >
                <p className="font-display text-3xl sm:text-4xl md:text-5xl text-white leading-tight tracking-wide"
                   style={{ textShadow: "0 0 20px hsl(45 61% 56% / 0.25)" }}>
                  {assistant.reply}
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        {/* Bottom controls — contained panel */}
        <div
          className="w-full max-w-sm mx-auto flex flex-col items-center gap-6 rounded-2xl px-8 py-6"
          style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(16px)" }}
        >
          {/* Mode Switcher */}
          <div className="flex items-center gap-6">
            {MODES.map((m) => (
              <button
                key={m.id}
                onClick={() => assistant.setMode(m.id)}
                disabled={assistant.isListening || assistant.isThinking || assistant.isSpeaking}
                className={cn(
                  "text-[10px] font-medium tracking-[0.2em] uppercase transition-all duration-500 disabled:pointer-events-none",
                  assistant.mode === m.id
                    ? "text-primary"
                    : "text-white/30 hover:text-white/60"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          <MicButton
            state={assistant.state}
            onClick={assistant.toggle}
          />

          {/* Waveform */}
          <div className="h-8 flex items-center justify-center">
            <AnimatePresence>
              {assistant.isSpeaking && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.4, ease: "easeInOut" }}
                >
                  <Waveform active={true} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Status label */}
          <div className="h-5 flex justify-center">
            <AnimatePresence mode="wait">
              <motion.p
                key={statusLabel}
                className="text-[11px] font-medium tracking-widest uppercase text-primary/80 flex space-x-0"
              >
                {statusCharacters.map((char, index) => (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, filter: "blur(2px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(2px)" }}
                    transition={{ duration: 0.4, ease: "easeInOut", delay: index * 0.03 }}
                  >
                    {char === " " ? "\u00A0" : char}
                  </motion.span>
                ))}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

      </main>

    </div>
  );
}
