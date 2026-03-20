import { motion, AnimatePresence } from "framer-motion";
import { useVoiceAssistant } from "@/hooks/use-voice-assistant";
import { MicButton } from "@/components/MicButton";

export default function Home() {
  const assistant = useVoiceAssistant();

  // Determine the display text based on state
  let statusLabel = "Tap to speak";
  if (assistant.isListening) statusLabel = "Listening...";
  if (assistant.isThinking) statusLabel = "Thinking...";
  if (assistant.isSpeaking) statusLabel = "Speaking...";
  if (assistant.isError) statusLabel = "Error. Try again.";

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
                transition={{ duration: 0.4 }}
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
                initial={{ opacity: 0, scale: 0.95, filter: "blur(8px)" }}
                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
                transition={{ duration: 0.6, ease: "easeOut" }}
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
        <MicButton 
          state={assistant.state} 
          onClick={assistant.toggle} 
        />
        
        <motion.p 
          key={statusLabel}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 text-sm font-medium tracking-widest uppercase text-primary/70"
        >
          {statusLabel}
        </motion.p>
      </div>

    </div>
  );
}
