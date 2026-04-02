import { useState, useEffect } from "react";
import { setBaseUrl } from "@workspace/api-client-react";

const apiUrl = import.meta.env.VITE_API_URL ?? "";
const APK_VERSION = "v19";
const APK_SIZE = "66 MB";
const downloadUrl = apiUrl
  ? `${apiUrl}/api/download/mo-app-${APK_VERSION}.apk`
  : null;

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) {
    return (
      <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
    );
  }
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-500" : "bg-red-500"}`}
    />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0">
      <span style={{ color: "var(--muted)" }} className="text-sm">
        {label}
      </span>
      <span className="text-sm font-mono" style={{ color: "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}

function AndroidIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C14.15 1.23 13.1 1 12 1c-1.1 0-2.15.23-3.12.63L7.4.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.3C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export default function App() {
  const [apiStatus, setApiStatus] = useState<boolean | null>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setBaseUrl(apiUrl);
    if (!apiUrl) {
      setApiStatus(false);
      return;
    }

    const check = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${apiUrl}/api/healthz`, {
          signal: AbortSignal.timeout(5000),
        });
        setApiLatency(Math.round(performance.now() - t0));
        setApiStatus(res.ok);
      } catch {
        setApiStatus(false);
        setApiLatency(null);
      }
    };

    check();
  }, []);

  const handleCopyLink = () => {
    if (!downloadUrl) return;
    navigator.clipboard.writeText(downloadUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: "var(--ink)" }}
    >
      <div className="w-full max-w-md space-y-8">
        {/* Wordmark */}
        <div className="text-center space-y-2">
          <h1
            className="text-6xl font-light tracking-[0.3em]"
            style={{
              color: "var(--gold)",
              fontFamily: "Georgia, 'Times New Roman', serif",
              letterSpacing: "0.35em",
            }}
          >
            MO
          </h1>
          <p className="text-sm tracking-widest uppercase" style={{ color: "var(--muted)" }}>
            AI Voice Assistant
          </p>
        </div>

        {/* Divider */}
        <div
          className="h-px w-full"
          style={{ background: "linear-gradient(to right, transparent, var(--gold-dim), transparent)" }}
        />

        {/* Download Card */}
        <div
          className="rounded-xl p-6 space-y-4"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: "var(--gold)" }}>
              <AndroidIcon />
            </span>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                Android App · {APK_VERSION}
              </p>
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {APK_SIZE} · Requires Android 8.0+
              </p>
            </div>
          </div>

          {downloadUrl ? (
            <div className="space-y-3">
              <a
                href={downloadUrl}
                download={`mo-app-${APK_VERSION}.apk`}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg text-sm font-medium transition-opacity hover:opacity-90 active:opacity-75"
                style={{
                  background: "var(--gold)",
                  color: "var(--ink)",
                }}
              >
                <DownloadIcon />
                Download APK
              </a>

              <button
                onClick={handleCopyLink}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-lg text-sm transition-colors"
                style={{
                  background: "transparent",
                  border: "1px solid var(--border)",
                  color: copied ? "var(--gold)" : "var(--muted)",
                  cursor: "pointer",
                }}
              >
                {copied ? "✓ Link copied" : "Copy download link"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-center py-2" style={{ color: "var(--muted)" }}>
              Set <code className="font-mono text-xs px-1 py-0.5 rounded" style={{ background: "var(--ink)", color: "var(--gold)" }}>VITE_API_URL</code> to enable downloads
            </p>
          )}

          <div
            className="pt-2 border-t text-xs space-y-1"
            style={{ borderColor: "var(--border)", color: "var(--muted)" }}
          >
            <p>1. Enable "Install unknown apps" in Android settings</p>
            <p>2. Open the downloaded APK to install</p>
          </div>
        </div>

        {/* Status Card */}
        <div
          className="rounded-xl p-6 space-y-1"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "var(--muted)" }}>
            System Status
          </p>

          <InfoRow label="Frontend" value="Running" />
          <div className="flex items-center justify-between py-3 border-b border-[var(--border)]">
            <span style={{ color: "var(--muted)" }} className="text-sm">
              API Server
            </span>
            <span className="flex items-center gap-2 text-sm">
              <StatusDot ok={apiStatus} />
              <span style={{ color: "var(--text)" }}>
                {apiStatus === null
                  ? "Checking…"
                  : apiStatus
                    ? `Connected${apiLatency !== null ? ` · ${apiLatency} ms` : ""}`
                    : apiUrl
                      ? "Unreachable"
                      : "VITE_API_URL not set"}
              </span>
            </span>
          </div>
          <InfoRow
            label="API URL"
            value={apiUrl || "(not configured)"}
          />
          <InfoRow label="Environment" value={import.meta.env.MODE} />
        </div>

        {/* Feature list */}
        <div
          className="rounded-xl p-6"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "var(--muted)" }}>
            Capabilities
          </p>
          <ul className="space-y-3">
            {[
              "Voice conversation with GPT-4o",
              "ElevenLabs speech synthesis",
              "Real-time weather & web search",
              "Notes, reminders & daily planning",
              "Four personality modes",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm" style={{ color: "var(--text)" }}>
                <span style={{ color: "var(--gold)" }} className="mt-0.5 shrink-0">
                  ◆
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-center text-xs" style={{ color: "var(--muted)" }}>
          Built with React · Vite · TypeScript
        </p>
      </div>
    </div>
  );
}
