import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface WaveformProps {
  className?: string;
  active?: boolean;
}

export function Waveform({ className, active = true }: WaveformProps) {
  return (
    <div className={cn("flex items-center justify-center gap-[3px] h-8", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          className="w-1 bg-primary rounded-full"
          initial={{ height: "20%" }}
          animate={active ? { height: ["20%", "100%", "20%"] } : { height: "20%" }}
          transition={
            active
              ? {
                  repeat: Infinity,
                  duration: 0.8,
                  ease: "easeInOut",
                  delay: i * 0.15,
                }
              : { duration: 0.3 }
          }
        />
      ))}
    </div>
  );
}
