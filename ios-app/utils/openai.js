const GROQ_WHISPER_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

// ── Transcription — Groq Whisper (free) ───────────────────────────
export async function transcribeAudio(groqKey, fileUri) {
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    type: "audio/m4a",
    name: "recording.m4a",
  });
  formData.append('model', 'whisper-large-v3')
  formData.append('language', 'en')
  formData.append('prompt', 'This is an English business meeting transcript.')

  const res = await fetch(GROQ_WHISPER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error?.message || `Transcription error (${res.status})`,
    );
  }
  const { text } = await res.json();
  return text;
}

// ── Analysis — Groq LLaMA (free) ──────────────────────────────────
export async function analyzeTranscript(groqKey, transcript) {
  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a professional meeting assistant. Respond only with valid JSON, no markdown.",
        },
        {
          role: "user",
          content: `Analyse this meeting transcript and return a JSON object with exactly these fields:
- "title": a short descriptive meeting title (5–8 words)
- "summary": a concise 3–5 sentence summary of the key discussion points
- "actionPoints": an array of action items; include owner and deadline if mentioned (empty array if none)

Transcript:
${transcript}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message || `Analysis error (${res.status})`);
  }
  const data = await res.json();
  try {
    return JSON.parse(data.choices[0].message.content);
  } catch {
    return { title: "Meeting", summary: "", actionPoints: [] };
  }
}
