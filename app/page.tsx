"use client";

import { useRef, useState } from "react";
import { WavRecorder, MAX_SECONDS } from "@/lib/recorder";
import { PRESETS, LANGUAGES } from "@/lib/presets";

type DictateResponse = {
  text?: string;
  llm_response?: string | null;
  llm_error?: string | null;
  confidence?: number;
  audio_duration_ms?: number;
  session_id?: string;
  error?: string;
};

type HistoryEntry = {
  id: string;
  timestamp: number;
  presetLabel: string;
  verbatim: string;
  rewrite: string | null;
};

const HISTORY_KEY = "scrybe-history";

export default function Home() {
  const [status, setStatus] = useState<"idle" | "recording" | "processing">("idle");
  const [seconds, setSeconds] = useState(0);
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [language, setLanguage] = useState("en");
  const [keyterms, setKeyterms] = useState("");
  const [context, setContext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DictateResponse | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const recorderRef = useRef<WavRecorder | null>(null);

  const saveHistory = (entries: HistoryEntry[]) => {
    setHistory(entries);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
    } catch {
      // storage full or unavailable, skip persistence
    }
  };

  const activePreset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0];

  const startRecording = async () => {
    setError(null);
    setResult(null);
    try {
      const recorder = new WavRecorder();
      recorder.onTick = (s) => setSeconds(s);
      recorder.onAutoStop = () => stopRecording();
      recorderRef.current = recorder;
      await recorder.start();
      setSeconds(0);
      setStatus("recording");
    } catch {
      setError("Couldn't access your microphone. Check browser permissions and try again.");
    }
  };

  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    const wavBlob = recorder.stop();
    recorderRef.current = null;
    setStatus("processing");

    try {
      const config = {
        language_codes: [language],
        llm_instruction: activePreset.instruction,
        ...(keyterms.trim()
          ? { keyterms_prompt: keyterms.split(",").map((t) => t.trim()).filter(Boolean) }
          : {}),
        ...(context.trim() ? { stt_prompt: context.trim() } : {}),
      };

      const formData = new FormData();
      formData.append("config", JSON.stringify(config));
      formData.append("audio", wavBlob, "audio.wav");

      const res = await fetch("/api/dictate", { method: "POST", body: formData });
      const data: DictateResponse = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || "The dictation request failed.");
        setStatus("idle");
        return;
      }

      setResult(data);
      if (data.text) {
        const entry: HistoryEntry = {
          id: data.session_id || String(Date.now()),
          timestamp: Date.now(),
          presetLabel: activePreset.label,
          verbatim: data.text,
          rewrite: data.llm_response ?? null,
        };
        saveHistory([entry, ...history]);
      }
    } catch {
      setError("Couldn't reach the dictation server. Is ASSEMBLYAI_API_KEY configured?");
    } finally {
      setStatus("idle");
    }
  };

  const handleMicClick = () => {
    if (status === "recording") {
      stopRecording();
    } else if (status === "idle") {
      startRecording();
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard unavailable, silently ignore
    }
  };

  const remaining = Math.max(0, MAX_SECONDS - seconds);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-5 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Scrybe</h1>
          <p className="text-sm text-zinc-500 max-w-md">
            Ramble however you want. Get back the exact document you needed — not just a cleaner transcript.
          </p>
        </div>
        <a
          href="https://www.assemblyai.com/docs/dictation"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-4 shrink-0"
        >
          Built on the AssemblyAI Dictation API ↗
        </a>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Controls */}
        <aside className="space-y-6">
          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-1">Shape it as</label>
            <p className="text-xs text-zinc-600 mb-2">
              Same rambling speech, restructured into a different document — not just cleaned up.
            </p>
            <div className="space-y-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  disabled={status !== "idle"}
                  className={`w-full text-left rounded-lg border px-3 py-2 transition disabled:opacity-50 ${
                    presetId === p.id
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-zinc-800 hover:border-zinc-700"
                  }`}
                >
                  <div className="text-sm font-medium">{p.label}</div>
                  <div className="text-xs text-zinc-500">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-2">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={status !== "idle"}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Key terms <span className="normal-case text-zinc-600">(optional, comma separated)</span>
            </label>
            <input
              value={keyterms}
              onChange={(e) => setKeyterms(e.target.value)}
              disabled={status !== "idle"}
              placeholder="e.g. AssemblyAI, Scrybe, Luma"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50 placeholder:text-zinc-700"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-zinc-500 mb-2">
              Context <span className="normal-case text-zinc-600">(optional)</span>
            </label>
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={status !== "idle"}
              placeholder="e.g. dictating a doctor's visit note"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm disabled:opacity-50 placeholder:text-zinc-700"
            />
          </div>
        </aside>

        {/* Main panel */}
        <section className="space-y-6">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 flex flex-col items-center gap-4">
            <button
              onClick={handleMicClick}
              disabled={status === "processing"}
              className={`h-20 w-20 rounded-full flex items-center justify-center transition disabled:opacity-60 ${
                status === "recording"
                  ? "bg-red-500 animate-pulse shadow-[0_0_0_8px_rgba(239,68,68,0.15)]"
                  : "bg-emerald-500 hover:bg-emerald-400"
              }`}
              aria-label={status === "recording" ? "Stop recording" : "Start recording"}
            >
              {status === "processing" ? (
                <span className="text-xs font-medium text-black">...</span>
              ) : status === "recording" ? (
                <span className="h-5 w-5 rounded-sm bg-white" />
              ) : (
                <MicIcon />
              )}
            </button>
            <div className="text-sm text-zinc-400">
              {status === "recording" && (
                <span>
                  Recording — {seconds.toFixed(1)}s{" "}
                  <span className={remaining < 15 ? "text-red-400" : ""}>({remaining.toFixed(0)}s left)</span>
                </span>
              )}
              {status === "processing" && <span>Transcribing…</span>}
              {status === "idle" && <span>Tap to dictate (max {MAX_SECONDS}s)</span>}
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ResultCard title="What you said" text={result.text ?? ""} onCopy={copy} />
              <ResultCard
                title={`What you needed — ${activePreset.label}`}
                text={result.llm_response ?? result.llm_error ?? ""}
                onCopy={copy}
                accent
              />
            </div>
          )}

          {history.length > 0 && (
            <div>
              <h2 className="text-xs uppercase tracking-wide text-zinc-500 mb-2">History</h2>
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id + h.timestamp}
                    className="rounded-lg border border-zinc-800 px-3 py-2 text-sm flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500 mb-0.5">
                        {h.presetLabel} · {new Date(h.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="truncate text-zinc-300">{h.rewrite || h.verbatim}</div>
                    </div>
                    <button
                      onClick={() => copy(h.rewrite || h.verbatim)}
                      className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Copy
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function ResultCard({
  title,
  text,
  onCopy,
  accent,
}: {
  title: string;
  text: string;
  onCopy: (t: string) => void;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-emerald-800 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950"}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs uppercase tracking-wide text-zinc-500">{title}</h3>
        <button onClick={() => onCopy(text)} className="text-xs text-zinc-500 hover:text-zinc-300">
          Copy
        </button>
      </div>
      <p className="text-sm text-zinc-200 whitespace-pre-wrap min-h-[2.5rem]">{text || "—"}</p>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-black">
      <path
        d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 11a7 7 0 01-14 0M12 18v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
