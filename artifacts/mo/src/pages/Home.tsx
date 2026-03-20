import { motion, AnimatePresence } from "framer-motion";
import { useVoiceAssistant, type AssistantMode } from "@/hooks/use-voice-assistant";
import { MicButton } from "@/components/MicButton";
import { Waveform } from "@/components/Waveform";
import { cn } from "@/lib/utils";

const MODES: { id: AssistantMode; label: string }[] = [
  { id: "executive", label: "Executive" },
  { id: "creative", label: "Creative" },
  { id: "motivational", label: "Motivational" },
];

export default function Home() {
  const assistant = useVoiceAssistant();

  // Determine the display text based on state
  let statusLabel = "Tap to speak";
  if (assistant.isListening) statusLabel = "Listening...";
  if (assistant.isThinking) statusLabel = "Thinking...";
  if (assistant.isSpeaking) statusLabel = "Speaking...";
  if (assistant.isError) statusLabel = "Error. Try again.";

  // For the smooth letter reveal of status label
  const statusCharacters = statusLabel.split('');

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center overflow-hidden">
      
      {/* Luxury Ambient Background Glows */}
      <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-[60vw] h-[60vh] bg-primary/5 blur-[150px] rounded-full pointer-events-none" />

      {/* Top Brand Mark */}
      <header className="absolute top-0 w-full p-8 flex justify-center z-10 pointer-events-none">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="font-display text-3xl font-medium tracking-widest text-primary text-glow italic"
        >
          Mo.
        </motion.h1>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-3xl mx-auto flex flex-col items-center justify-center p-6 sm:p-12 z-10 relative mt-16 mb-32">
        
        {/* Dynamic Text Area (User Transcript or AI Reply) */}
        <div className="flex-1 w-full flex flex-col justify-end items-center text-center mb-12 min-h-[200px]">
          <AnimatePresence mode="wait">
            
            {/* User Transcript */}
            {(assistant.isListening || (assistant.isThinking && !assistant.reply)) && (
              <motion.div
                key="transcript"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="w-full max-w-2xl"
              >
                <p className="text-xl sm:text-2xl text-muted-foreground font-light leading-relaxed">
                  {assistant.transcript || <span className="opacity-30">I am listening...</span>}
                </p>
              </motion.div>
            )}

            {/* AI Reply */}
            {(assistant.isSpeaking || (assistant.reply && assistant.isIdle)) && (
              <motion.div
                key="reply"
                initial={{ opacity: 0, scale: 0.98, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.98, filter: "blur(4px)" }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="w-full max-w-3xl"
              >
                <p className="font-display text-3xl sm:text-4xl md:text-5xl text-foreground leading-tight tracking-wide text-glow">
                  {assistant.reply}
                </p>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </main>

      {/* Bottom Control Area */}
      <div className="absolute bottom-12 w-full flex flex-col items-center justify-end z-20">

        {/* Mode Switcher */}
        <div className="flex items-center gap-6 mb-8">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => assistant.setMode(m.id)}
              disabled={assistant.isListening || assistant.isThinking || assistant.isSpeaking}
              className={cn(
                "text-[10px] font-medium tracking-[0.2em] uppercase transition-all duration-500 disabled:pointer-events-none",
                assistant.mode === m.id
                  ? "text-primary"
                  : "text-white/20 hover:text-white/40"
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
        
        {/* Waveform below the button during speaking */}
        <div className="h-8 mt-2 flex items-center justify-center">
          <AnimatePresence>
            {assistant.isSpeaking && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
              >
                <Waveform active={true} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <div className="mt-4 h-6 flex justify-center">
          <AnimatePresence mode="wait">
            <motion.p 
              key={statusLabel}
              className="text-sm font-medium tracking-widest uppercase text-primary/70 flex space-x-0"
            >
              {statusCharacters.map((char, index) => (
                <motion.span
                  key={index}
                  initial={{ opacity: 0, filter: "blur(2px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  exit={{ opacity: 0, filter: "blur(2px)" }}
                  transition={{ 
                    duration: 0.4, 
                    ease: "easeInOut",
                    delay: index * 0.03
                  }}
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
