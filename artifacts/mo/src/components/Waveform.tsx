import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface WaveformProps {
  className?: string;
  active?: boolean;
}

export function Waveform({ className, active = true }: WaveformProps) {
  // 7 bars for the waveform
  const bars = [1, 2, 3, 4, 5, 6, 7];
  
  return (
    <div className={cn("flex items-center justify-center gap-[6px] w-[80px] h-[24px]", className)}>
      {bars.map((i) => (
        <motion.div
          key={i}
          className="w-[2px] bg-primary rounded-full"
          initial={{ height: "4px" }}
          animate={active ? { 
            height: ["4px", i % 2 === 0 ? "24px" : "16px", "4px"] 
          } : { height: "4px" }}
          transition={
            active
              ? {
                  repeat: Infinity,
                  duration: 1.2,
                  ease: "easeInOut",
                  delay: i * 0.15,
                }
              : { duration: 0.5, ease: "easeInOut" }
          }
        />
      ))}
    </div>
  );
}
