# Scrybe

Ramble in, the exact document out. Built on AssemblyAI's [Dictation API](https://www.assemblyai.com/docs/dictation) for **Voice Hackathon Week: Hack into Dictation**.

## Why this isn't just voice typing

Voice typing (Google's, Otter, Wispr, Windows Voice Access) gives you a cleaner transcript of what you said. That's it — you still have to manually turn it into the email, note, or record you actually needed.

The Dictation API does something different: one HTTP call returns both the **exact verbatim transcript** and an **LLM rewrite reshaped by a plain-English instruction** — not cleanup, restructuring. Scrybe puts that front and center: pick a shape before you speak (Clean Notes / Email Draft / Meeting Minutes / Clinical SOAP Note / Verbatim), ramble however you want, and the "What you needed" panel comes back already in that shape — same words, different document. The "What you said" panel sits right next to it so you can see exactly what changed.

Record up to 120 seconds per take. Also exercises the API's language selection (16 languages), key-term biasing, and free-text context steering.

## Why this covers the API's surface

- Dual output (`text` + `llm_response`) shown side by side
- `llm_instruction` swapped per preset (Notes / Email / Meeting Minutes / SOAP / Verbatim-only)
- `language_codes` picker (16 languages)
- `keyterms_prompt` for domain vocabulary biasing
- `stt_prompt` for free-text context
- Client records raw mic audio and encodes 16 kHz mono PCM WAV in-browser (the API only accepts WAV/raw PCM), auto-stops at the 120s cap
- API key never reaches the browser — a Next.js route handler (`app/api/dictate/route.ts`) proxies the request server-side

## Setup

```bash
npm install
cp .env.local.example .env.local
# then edit .env.local and set ASSEMBLYAI_API_KEY
npm run dev
```

Open http://localhost:3000, allow microphone access, pick a preset, and dictate.

## Project structure

- [app/page.tsx](app/page.tsx) — UI: preset/language/keyterm controls, mic button, dual-transcript results, local history
- [lib/recorder.ts](lib/recorder.ts) — mic capture → 16-bit PCM WAV encoder (Web Audio API)
- [lib/presets.ts](lib/presets.ts) — rewrite presets and language list
- [app/api/dictate/route.ts](app/api/dictate/route.ts) — server-side proxy to `https://dictation.assemblyai.com/v1/transcribe/live`

## Deploying

Set `ASSEMBLYAI_API_KEY` as an environment variable on your host (e.g. Vercel project settings), then deploy normally — no other config needed.
