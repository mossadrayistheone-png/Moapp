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

    // Attempt autoplay — on iOS this is allowed only when muted + playsInline
    video.play().catch(() => {
      // Silently fail; video will play on next user interaction on restrictive browsers
    });

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
        preload="metadata"
        disablePictureInPicture
        className="absolute inset-0 w-full h-full object-cover"
        style={{ willChange: "auto" }}
      />
      <div className="absolute inset-0 bg-black/25" />
    </div>
  );
}
