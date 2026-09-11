import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const ASSEMBLYAI_ENDPOINT = "https://dictation.assemblyai.com/v1/transcribe/live";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing ASSEMBLYAI_API_KEY. Add it to .env.local and restart the dev server." },
      { status: 500 },
    );
  }

  let incoming: FormData;
  try {
    incoming = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const audio = incoming.get("audio");
  const configRaw = incoming.get("config");

  if (!(audio instanceof Blob) || typeof configRaw !== "string") {
    return NextResponse.json({ error: "Request must include an 'audio' file and a 'config' JSON field" }, { status: 400 });
  }

  const outgoing = new FormData();
  outgoing.append("config", new Blob([configRaw], { type: "application/json" }));
  outgoing.append("audio", audio, "audio.wav");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const upstream = await fetch(ASSEMBLYAI_ENDPOINT, {
      method: "POST",
      headers: { Authorization: apiKey },
      body: outgoing,
      signal: controller.signal,
    });

    const text = await upstream.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || "Empty response from AssemblyAI" };
    }

    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request to AssemblyAI failed";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
