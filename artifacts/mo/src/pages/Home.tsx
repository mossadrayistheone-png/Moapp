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
    <div
      className="relative w-full overflow-hidden"
      style={{ minHeight: "100dvh" }}
    >
      <BackgroundVideo />

      {/* Brand mark — safe area top */}
      <header
        className="absolute top-0 w-full flex justify-between items-start z-10"
        style={{ paddingTop: "max(env(safe-area-inset-top), 2rem)", paddingLeft: "1.25rem", paddingRight: "1.25rem" }}
      >
        <div className="w-16" />
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="font-display text-2xl sm:text-3xl font-medium tracking-widest text-primary italic pointer-events-none"
          style={{ textShadow: "0 2px 20px rgba(0,0,0,0.9), 0 0 20px hsl(45 61% 56% / 0.3)" }}
        >
          Mo.
        </motion.h1>
        <motion.a
          href="/mo-app-v8.apk"
          download="mo-app-v8.apk"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="w-16 flex justify-end items-center gap-1 text-[10px] font-medium tracking-widest uppercase text-primary/60 hover:text-primary transition-colors duration-300"
          style={{ textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 1v7M3 6l3 3 3-3M2 11h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          APK
        </motion.a>
      </header>

      {/* Text area — vertically centred, pushed up from the controls */}
      <div
        className="absolute inset-0 flex items-center justify-center z-10 px-6"
        style={{ paddingBottom: "clamp(200px, 45vh, 300px)" }}
      >
        <AnimatePresence mode="wait">

          {(assistant.isListening || (assistant.isThinking && !assistant.reply)) && (
            <motion.p
              key="transcript"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="text-lg sm:text-xl md:text-2xl text-white/85 font-light leading-relaxed text-center max-w-lg"
              style={{ textShadow: "0 1px 12px rgba(0,0,0,0.9), 0 2px 32px rgba(0,0,0,0.7)" }}
            >
              {assistant.transcript || <span className="opacity-40">Listening…</span>}
            </motion.p>
          )}

          {(assistant.isSpeaking || (assistant.reply && assistant.isIdle)) && (
            <motion.p
              key="reply"
              initial={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
              animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="font-display text-2xl sm:text-4xl md:text-5xl text-white leading-tight tracking-wide text-center max-w-2xl"
              style={{ textShadow: "0 2px 20px rgba(0,0,0,0.9), 0 0 40px rgba(0,0,0,0.5), 0 0 20px hsl(45 61% 56% / 0.2)" }}
            >
              {assistant.reply}
            </motion.p>
          )}

        </AnimatePresence>
      </div>

      {/* Bottom controls — safe area aware, floating */}
      <div
        className="absolute bottom-0 w-full flex flex-col items-center gap-4 z-10"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 2.5rem)" }}
      >
        {/* Mode switcher */}
        <div className="flex items-center gap-6 sm:gap-8">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => assistant.setMode(m.id)}
              disabled={assistant.isListening || assistant.isThinking || assistant.isSpeaking}
              className={cn(
                "text-[10px] font-medium tracking-[0.2em] uppercase transition-all duration-500 disabled:pointer-events-none",
                "min-h-[44px] min-w-[44px] flex items-center justify-center",
                assistant.mode === m.id
                  ? "text-primary"
                  : "text-white/35 hover:text-white/65"
              )}
              style={{ textShadow: "0 1px 8px rgba(0,0,0,0.9)", touchAction: "manipulation" }}
            >
              {m.label}
            </button>
          ))}
        </div>

        <MicButton state={assistant.state} onClick={assistant.toggle} />

        {/* Waveform */}
        <div className="h-7 flex items-center justify-center">
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
              className="text-[11px] font-medium tracking-widest uppercase text-primary/90 flex space-x-0"
              style={{ textShadow: "0 1px 8px rgba(0,0,0,0.9)" }}
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
    </div>
  );
}
