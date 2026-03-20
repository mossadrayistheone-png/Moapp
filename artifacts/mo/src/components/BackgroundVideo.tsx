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
      <video
        ref={videoRef}
        src="/background.mp4"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ willChange: "transform" }}
      />
      {/* Minimal scrim — just enough to take the edge off bright areas */}
      <div className="absolute inset-0 bg-black/25" />
    </div>
  );
}
