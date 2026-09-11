// Records mic audio and encodes it as 16-bit PCM WAV, since the AssemblyAI
// Dictation API only accepts audio/wav or raw PCM (no webm/opus, no mp3).
const SAMPLE_RATE = 16000;
const MAX_SECONDS = 120;

export class WavRecorder {
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserBuffer: Uint8Array<ArrayBuffer> | null = null;
  private stream: MediaStream | null = null;
  private chunks: Float32Array[] = [];
  private sampleRate = SAMPLE_RATE;
  private stopped = true;
  private startedAt = 0;

  onTick: ((seconds: number) => void) | null = null;
  onAutoStop: (() => void) | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  async start() {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.audioContext = new Ctx({ sampleRate: SAMPLE_RATE });
    this.sampleRate = this.audioContext.sampleRate;

    this.source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = this.audioContext.createGain();
    silentGain.gain.value = 0;

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyserBuffer = new Uint8Array(this.analyser.frequencyBinCount);

    this.processor.onaudioprocess = (e) => {
      if (this.stopped) return;
      this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    this.source.connect(this.processor);
    this.processor.connect(silentGain);
    silentGain.connect(this.audioContext.destination);
    this.source.connect(this.analyser);

    this.stopped = false;
    this.startedAt = Date.now();

    this.tickInterval = setInterval(() => {
      const seconds = (Date.now() - this.startedAt) / 1000;
      this.onTick?.(seconds);
      if (seconds >= MAX_SECONDS) {
        this.onAutoStop?.();
      }
    }, 200);
  }

  /** Current mic input level, 0-1, for driving a live waveform. */
  getLevel(): number {
    if (!this.analyser || !this.analyserBuffer) return 0;
    this.analyser.getByteTimeDomainData(this.analyserBuffer);
    let sumSquares = 0;
    for (let i = 0; i < this.analyserBuffer.length; i++) {
      const centered = (this.analyserBuffer[i] - 128) / 128;
      sumSquares += centered * centered;
    }
    return Math.min(1, Math.sqrt(sumSquares / this.analyserBuffer.length) * 4);
  }

  stop(): Blob {
    this.stopped = true;
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.processor?.disconnect();
    this.analyser?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.audioContext?.close();

    return encodeWav(this.chunks, this.sampleRate);
  }
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((sum, c) => sum + c.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, length * 2, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      const s = Math.max(-1, Math.min(1, chunk[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export { SAMPLE_RATE, MAX_SECONDS };
