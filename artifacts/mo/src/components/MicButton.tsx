import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Waveform } from "./Waveform";
import type { AssistantState } from "@/hooks/use-voice-assistant";

interface MicButtonProps {
  state: AssistantState;
  onClick: () => void;
  className?: string;
}

export function MicButton({ state, onClick, className }: MicButtonProps) {
  const isListening = state === 'listening';
  const isThinking = state === 'thinking';
  const isSpeaking = state === 'speaking';
  const isIdle = state === 'idle' || state === 'error';

  return (
    <div className={cn("relative flex items-center justify-center w-40 h-40", className)}>
      {/* Outer pulsing ring for listening state */}
      <AnimatePresence>
        {isListening && (
          <>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.5, opacity: 0 }}
              exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border border-primary/40"
            />
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1.8, opacity: 0 }}
              exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeOut", delay: 0.6 }}
              className="absolute inset-0 rounded-full border border-primary/20"
            />
          </>
        )}
      </AnimatePresence>

      {/* Main interactive button */}
      <motion.button
        onClick={onClick}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "relative z-10 flex items-center justify-center w-24 h-24 rounded-full",
          "transition-all duration-500 ease-out box-glow",
          isListening 
            ? "bg-primary/20 border-2 border-primary text-primary shadow-[0_0_40px_rgba(212,175,55,0.4)]" 
            : "bg-card border border-white/5 text-muted-foreground hover:text-primary hover:border-primary/50"
        )}
      >
        <AnimatePresence mode="wait">
          {isIdle && (
            <motion.div
              key="idle"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Mic className="w-8 h-8" strokeWidth={1.5} />
            </motion.div>
          )}

          {isListening && (
            <motion.div
              key="listening"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Square className="w-8 h-8 fill-primary" strokeWidth={0} />
            </motion.div>
          )}

          {isThinking && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Loader2 className="w-8 h-8 animate-spin text-primary" strokeWidth={1.5} />
            </motion.div>
          )}

          {isSpeaking && (
            <motion.div
              key="speaking"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              <Waveform active={true} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
