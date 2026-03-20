import { useRef, useEffect } from "react";

export function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleMetadata = () => {
      if (video.duration && isFinite(video.duration)) {
        video.currentTime = Math.random() * video.duration;
      }
    };

    video.addEventListener("loadedmetadata", handleMetadata);
    return () => video.removeEventListener("loadedmetadata", handleMetadata);
  }, []);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden">
      {/* Video layer */}
      <video
        ref={videoRef}
        src="/background.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover scale-105 blur-[1px]"
        style={{ willChange: "transform" }}
      />

      {/* Light base overlay — keeps it cinematic without killing the image */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Vignette — darkens edges only, centre stays open */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </div>
  );
}
