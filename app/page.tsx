"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { WavRecorder, MAX_SECONDS } from "@/lib/recorder";
import { PRESETS, LANGUAGES, type Preset } from "@/lib/presets";

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
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const recorderRef = useRef<WavRecorder | null>(null);

  // Runs client-only, after hydration, to avoid a server/client mismatch
  // (the server always renders an empty history since localStorage doesn't exist there).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from an external store (localStorage) on mount, not derived state
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // ignore corrupt local storage
    }
  }, []);

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
    <div className="min-h-screen flex flex-col bg-[var(--ink)]">
      <header className="border-b border-[var(--ink-line)]">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display italic text-3xl text-[var(--text-primary)] tracking-tight">Scrybe</h1>
            <p className="text-sm text-[var(--text-muted)] max-w-md mt-1 leading-relaxed">
              Ramble however you want. Get back the exact document you needed — not just a cleaner transcript.
            </p>
          </div>
          <a
            href="https://www.assemblyai.com/docs/dictation"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--text-faint)] hover:text-[var(--brass)] underline underline-offset-4 shrink-0 mt-1"
          >
            Built on the AssemblyAI Dictation API ↗
          </a>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10 grid gap-10 lg:grid-cols-[260px_1fr]">
        {/* Controls */}
        <aside className="space-y-8">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
              Shape it as
            </span>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 mb-3 leading-relaxed">
              Same rambling speech, restructured into a different document — not just cleaned up.
            </p>
            <div className="flex flex-col">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  disabled={status !== "idle"}
                  className={`text-left px-3 py-2.5 border-l-2 transition disabled:opacity-40 ${
                    presetId === p.id
                      ? "border-l-[var(--brass)] bg-[var(--ink-panel-raised)]"
                      : "border-l-transparent hover:border-l-[var(--ink-line)] hover:bg-[var(--ink-panel)]"
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${
                      presetId === p.id ? "text-[var(--brass)]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="text-xs text-[var(--text-faint)] mt-0.5">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)] mb-1.5">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={status !== "idle"}
              className="w-full bg-transparent border-b border-[var(--ink-line)] focus:border-[var(--brass)] text-sm text-[var(--text-primary)] py-1.5 outline-none disabled:opacity-40"
            >
              {LANGUAGES.map((l) => (
                <option key={l.code} value={l.code} className="bg-[var(--ink-panel)]">
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)] mb-1.5">
              Key terms <span className="normal-case text-[var(--text-faint)]/70">(optional)</span>
            </label>
            <input
              value={keyterms}
              onChange={(e) => setKeyterms(e.target.value)}
              disabled={status !== "idle"}
              placeholder="AssemblyAI, Scrybe, Luma"
              className="w-full bg-transparent border-b border-[var(--ink-line)] focus:border-[var(--brass)] text-sm text-[var(--text-primary)] py-1.5 outline-none disabled:opacity-40 placeholder:text-[var(--text-faint)]"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)] mb-1.5">
              Context <span className="normal-case text-[var(--text-faint)]/70">(optional)</span>
            </label>
            <input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              disabled={status !== "idle"}
              placeholder="dictating a doctor's visit note"
              className="w-full bg-transparent border-b border-[var(--ink-line)] focus:border-[var(--brass)] text-sm text-[var(--text-primary)] py-1.5 outline-none disabled:opacity-40 placeholder:text-[var(--text-faint)]"
            />
          </div>
        </aside>

        {/* Main panel */}
        <section className="space-y-8">
          <div className="border border-[var(--ink-line)] bg-[var(--ink-panel)] p-10 flex flex-col items-center gap-5">
            <button
              onClick={handleMicClick}
              disabled={status === "processing"}
              aria-label={status === "recording" ? "Stop recording" : "Start recording"}
              className={`relative h-24 w-24 rounded-full flex items-center justify-center transition-transform active:scale-95 disabled:opacity-60 ${
                status === "recording" ? "bg-[var(--seal)]" : "bg-[var(--brass)] hover:brightness-110"
              }`}
              style={status === "recording" ? { boxShadow: "0 0 0 10px var(--seal-glow)" } : undefined}
            >
              {status === "processing" ? (
                <span className="h-3 w-3 rounded-full bg-[var(--ink)] animate-ping" />
              ) : status === "recording" ? (
                <span className="h-5 w-5 rounded-sm bg-[var(--ink)]" />
              ) : (
                <MicIcon />
              )}
            </button>

            <div className="h-12 flex items-center justify-center">
              {status === "recording" ? (
                <Waveform recorderRef={recorderRef} active />
              ) : (
                <span className="font-mono text-xs text-[var(--text-faint)]">
                  {status === "processing" ? "Transcribing…" : `Tap to dictate — max ${MAX_SECONDS}s`}
                </span>
              )}
            </div>

            {status === "recording" && (
              <div className="font-mono text-xs text-[var(--text-muted)]">
                {seconds.toFixed(1)}s{" "}
                <span className={remaining < 15 ? "text-[var(--seal)]" : ""}>({remaining.toFixed(0)}s left)</span>
              </div>
            )}
          </div>

          {error && (
            <div className="border-l-2 border-[var(--seal)] bg-[var(--ink-panel)] px-4 py-3 text-sm text-[var(--text-primary)]">
              {error}
            </div>
          )}

          {result &&
            (activePreset.id === "verbatim" ? (
              <div className="max-w-md">
                <VerbatimSlip text={result.text ?? ""} onCopy={copy} />
              </div>
            ) : (
              <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 items-start">
                <VerbatimSlip text={result.text ?? ""} onCopy={copy} />
                <DocumentCard
                  preset={activePreset}
                  text={result.llm_response ?? result.llm_error ?? ""}
                  onCopy={copy}
                />
              </div>
            ))}

          {history.length > 0 && (
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-faint)]">
                History
              </span>
              <ul className="mt-2 border-t border-[var(--ink-line)]">
                {history.map((h) => (
                  <li
                    key={h.id + h.timestamp}
                    className="py-2.5 border-b border-[var(--ink-line)] flex items-start justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-faint)] mb-0.5">
                        {h.presetLabel} · {new Date(h.timestamp).toLocaleTimeString()}
                      </div>
                      <div className="truncate text-sm text-[var(--text-muted)]">{h.rewrite || h.verbatim}</div>
                    </div>
                    <button
                      onClick={() => copy(h.rewrite || h.verbatim)}
                      className="shrink-0 font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--text-faint)] hover:text-[var(--brass)]"
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

function VerbatimSlip({ text, onCopy }: { text: string; onCopy: (t: string) => void }) {
  return (
    <div className="rise-in bg-[var(--slip)] text-[var(--slip-text)] p-5 shadow-[0_10px_28px_rgba(0,0,0,0.4)] -rotate-[0.5deg]">
      <div className="flex items-center justify-between mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--slip-muted)]">
        <span>What you said</span>
        <button onClick={() => onCopy(text)} className="hover:text-[var(--slip-text)] underline underline-offset-2">
          Copy
        </button>
      </div>
      <p className="font-mono text-sm leading-relaxed whitespace-pre-wrap min-h-[3rem]">{text || "—"}</p>
    </div>
  );
}

function DocumentCard({ preset, text, onCopy }: { preset: Preset; text: string; onCopy: (t: string) => void }) {
  const dateline = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const subject = preset.showSubject ? deriveSubject(text) : null;

  return (
    <div
      style={{ animationDelay: "120ms" }}
      className={`rise-in bg-[var(--parchment)] text-[var(--parchment-text)] p-6 shadow-[0_10px_28px_rgba(0,0,0,0.4)] rotate-[0.4deg] ${
        preset.texture === "ruled" ? "ruled-paper" : preset.texture === "grid" ? "grid-paper" : ""
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-display italic text-lg">{preset.letterhead}</span>
        <button
          onClick={() => onCopy(text)}
          className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--parchment-muted)] hover:text-[var(--parchment-text)] underline underline-offset-2"
        >
          Copy
        </button>
      </div>
      <div className="font-mono text-[10px] uppercase tracking-[0.15em] text-[var(--parchment-muted)] mb-3">
        {dateline}
        {subject && <> · Re: {subject}</>}
      </div>
      <div className="h-px bg-[var(--parchment-line)] mb-3" />
      <p className="font-display text-[15px] leading-relaxed whitespace-pre-wrap min-h-[3rem]">{text || "—"}</p>
    </div>
  );
}

function deriveSubject(text: string): string {
  const firstSentence = text.split(/[.!?\n]/)[0]?.trim() ?? "";
  const words = firstSentence.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
  return words || "Untitled";
}

function Waveform({
  recorderRef,
  active,
}: {
  recorderRef: RefObject<WavRecorder | null>;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const levelsRef = useRef<number[]>(new Array(32).fill(0.06));

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const recorder = recorderRef.current;
    if (!active || !recorder || !canvas || !ctx) return;

    const draw = () => {
      const level = recorder.getLevel();
      const levels = levelsRef.current;
      levels.shift();
      levels.push(Math.max(0.06, level));

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);
      const barWidth = width / levels.length;
      levels.forEach((l, i) => {
        const barHeight = Math.max(3, l * height);
        ctx.fillStyle = "#c6a33d";
        ctx.fillRect(i * barWidth + barWidth * 0.25, (height - barHeight) / 2, barWidth * 0.5, barHeight);
      });

      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, recorderRef]);

  return <canvas ref={canvasRef} width={240} height={48} className="block" aria-hidden="true" />;
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--ink)]">
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
