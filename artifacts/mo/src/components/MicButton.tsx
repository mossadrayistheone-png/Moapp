import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
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
      {/* Outer pulsing rings for listening state */}
      <AnimatePresence>
        {isListening && (
          <>
            <motion.div
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: 2, opacity: [0.6, 0] }}
              exit={{ scale: 1, opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full border border-primary"
            />
            <motion.div
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: 2.5, opacity: [0.4, 0] }}
              exit={{ scale: 1, opacity: 0, transition: { duration: 0.8, ease: "easeInOut" } }}
              transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", delay: 1.25 }}
              className="absolute inset-0 rounded-full border border-primary"
            />
          </>
        )}
      </AnimatePresence>

      {/* Main interactive button */}
      <motion.button
        onClick={onClick}
        animate={
          isIdle 
            ? { scale: [1, 1.03, 1] } 
            : { scale: 1 }
        }
        transition={
          isIdle 
            ? { repeat: Infinity, duration: 4, ease: "easeInOut" } 
            : { duration: 0.3 }
        }
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "relative z-10 flex items-center justify-center w-24 h-24 rounded-full",
          "transition-all duration-700 ease-in-out box-glow",
          isListening 
            ? "bg-primary/20 border-2 border-primary text-primary shadow-[0_0_40px_rgba(201,168,76,0.6)]" 
            : isThinking
            ? "bg-card text-primary shadow-[0_0_20px_rgba(201,168,76,0.2)]"
            : isSpeaking
            ? "bg-card border border-primary/30 text-muted-foreground shadow-[0_0_30px_rgba(201,168,76,0.15)]"
            : "bg-card border border-white/5 text-muted-foreground hover:text-primary hover:border-primary/50"
        )}
      >
        {/* Thinking border shimmer */}
        <AnimatePresence>
          {isThinking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.6, 0.8, 0.6] }}
              exit={{ opacity: 0 }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="absolute inset-0 rounded-full border-2 border-primary"
            />
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {(isIdle || isSpeaking) && (
            <motion.div
              key="mic"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: isSpeaking ? 0.4 : 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <Mic className="w-8 h-8" strokeWidth={1.5} />
            </motion.div>
          )}

          {isListening && (
            <motion.div
              key="listening"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
            >
              <Square className="w-8 h-8 fill-primary" strokeWidth={0} />
            </motion.div>
          )}

          {isThinking && (
            <motion.div
              key="thinking"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="flex items-center justify-center gap-2"
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-[6px] h-[6px] rounded-full bg-primary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "easeInOut",
                    delay: i * 0.3,
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
