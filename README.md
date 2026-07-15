# RecTransc

A local macOS desktop app that records meetings, transcribes them with OpenAI Whisper, and generates a summary + action points using GPT-4o. All transcripts are saved locally on your machine.

---

## Features

- 🎙 **Record** — one-click recording from your microphone
- 📝 **Transcribe** — powered by OpenAI Whisper (whisper-1)
- 🧠 **Summarise** — concise 3–5 sentence meeting summary
- ✅ **Action Points** — extracted action items with owners/deadlines
- 🗂 **History** — all transcripts saved locally, with delete support
- 🔒 **Private** — audio never stored; API key lives only on your device

---

## Requirements

- **Node.js** 18+ — [nodejs.org](https://nodejs.org)
- **OpenAI API key** — [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- macOS (optimised for macOS; will also run on Windows/Linux)

---

## Setup

```bash
# 1. Install dependencies (run once)
cd "/Users/ninajuresic/Desktop/rectransc app"
npm install

# 2. Launch the app
npm start
```

On first launch the app will ask for your OpenAI API key. It is saved to your local app data folder and never leaves your machine unencrypted.

---

## Usage

| Step | Action |
|------|--------|
| 1 | Click **New Recording** or the big purple button |
| 2 | Speak — the timer counts up and the waveform animates |
| 3 | Click the button again to **stop** |
| 4 | Wait ~10–30 s while Whisper transcribes and GPT-4o analyses |
| 5 | The result appears automatically with **Summary**, **Action Points**, and **Full Transcript** |
| 6 | All recordings appear in the left sidebar — click any to review |
| 7 | Hit **Delete** to remove a recording you no longer need |

---

## API Key

- Click the **⚙ gear icon** (top-left) at any time to update your API key
- The key is stored in `~/Library/Application Support/rectransc/settings.json`
- Transcripts are stored in `~/Library/Application Support/rectransc/transcripts.json`

---

## Cost (approximate)

| Item | Rate |
|------|------|
| Whisper transcription | $0.006 / minute of audio |
| GPT-4o analysis | ~$0.01–0.03 per meeting |

A typical 1-hour meeting costs roughly **$0.40–0.60**.

---

## Troubleshooting

**"Microphone access denied"** → open *System Settings → Privacy & Security → Microphone* and enable access for the app.

**"No speech detected"** → make sure your mic is working and you spoke during the recording.

**API errors** → verify your key at [platform.openai.com](https://platform.openai.com) and check you have available credits.
