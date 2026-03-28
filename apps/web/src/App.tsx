import { useState, useEffect } from "react";
import { setBaseUrl } from "@workspace/api-client-react";

const apiUrl = import.meta.env.VITE_API_URL ?? "";

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

export default function App() {
  const [apiStatus, setApiStatus] = useState<boolean | null>(null);
  const [apiLatency, setApiLatency] = useState<number | null>(null);

  useEffect(() => {
    if (!apiUrl) {
      setApiStatus(false);
      return;
    }

    const check = async () => {
      const t0 = performance.now();
      try {
        const res = await fetch(`${apiUrl}/health`, {
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
