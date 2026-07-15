"use strict";

const { app, BrowserWindow, ipcMain, systemPreferences } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

let mainWindow;
let groqClient = null; // one free Groq client — handles both transcription + analysis

// ── Persistent paths ────────────────────────────────────────────
const userDataPath = app.getPath("userData");
const transcriptsFile = path.join(userDataPath, "transcripts.json");
const settingsFile = path.join(userDataPath, "settings.json");

// ── Storage helpers ─────────────────────────────────────────────
function getSettings() {
  try {
    if (fs.existsSync(settingsFile)) {
      const s = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
      // Migrate any old key names → groqKey
      const old = s.apiKey || s.openaiKey || s.anthropicKey;
      if (old && !s.groqKey) {
        s.groqKey = old;
        delete s.apiKey;
        delete s.openaiKey;
        saveSettings(s);
      }
      return s;
    }
  } catch (_) {}
  return {};
}

function saveSettings(s) {
  fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2));
}

function getTranscripts() {
  try {
    if (fs.existsSync(transcriptsFile))
      return JSON.parse(fs.readFileSync(transcriptsFile, "utf8"));
  } catch (_) {}
  return [];
}

function saveTranscripts(list) {
  fs.writeFileSync(transcriptsFile, JSON.stringify(list, null, 2));
}

// ── Groq client (OpenAI-compatible SDK, Groq base URL) ───────────
function getGroqClient() {
  if (groqClient) return groqClient;
  const s = getSettings();
  const key = s.groqKey || process.env.GROQ_API_KEY;
  if (!key) return null;
  const { OpenAI } = require("openai");
  groqClient = new OpenAI({
    apiKey: key,
    baseURL: "https://api.groq.com/openai/v1",
  });
  return groqClient;
}

// ── Window ──────────────────────────────────────────────────────
async function createWindow() {
  if (process.platform === "darwin") {
    try {
      await systemPreferences.askForMediaAccess("microphone");
    } catch (_) {}
  }
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 820,
    minHeight: 580,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: "hiddenInset",
    backgroundColor: "#0c0c1a",
    show: false,
  });
  mainWindow.loadFile("renderer/index.html");
  mainWindow.once("ready-to-show", () => mainWindow.show());
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── IPC ──────────────────────────────────────────────────────────
ipcMain.handle("get-transcripts", () => getTranscripts());

ipcMain.handle("delete-transcript", (_, id) => {
  const list = getTranscripts().filter((t) => t.id !== id);
  saveTranscripts(list);
  return list;
});

ipcMain.handle("get-settings", () => {
  const s = getSettings();
  return { hasKey: !!(s.groqKey || process.env.GROQ_API_KEY) };
});

ipcMain.handle("save-key", (_, groqKey) => {
  const s = getSettings();
  s.groqKey = groqKey;
  saveSettings(s);
  groqClient = null;
  return true;
});

// ── IPC: analyse imported transcript (no Whisper needed) ────────────────
ipcMain.handle("analyse-transcript", async (_, { transcript }) => {
  const groq = getGroqClient();
  if (!groq) throw new Error("Groq API key not configured. Open Settings.");
  if (!transcript?.trim()) throw new Error("Transcript text is empty.");

  const send = (msg) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send("import-progress", msg);
  };

  send("Analysing with LLaMA…");
  const completion = await groq.chat.completions.create({
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
        content: `Analyse this meeting transcript and return a JSON object with exactly these fields:\n- "title": a short descriptive meeting title (5\u20138 words)\n- "summary": a concise 3\u20135 sentence summary of the key discussion points\n- "actionPoints": an array of plain strings only (not objects), each string is one action item written as a complete sentence including who is responsible and any deadline if mentioned\n\nExample of correct actionPoints format: ["John to send the proposal by Friday", "Team to review the budget next week"]\n\nTranscript:\n${transcript.trim()}`,
      },
    ],
  });

  let analysis = { title: "Meeting", summary: "", actionPoints: [] };
  try {
    analysis = JSON.parse(completion.choices[0].message.content);
  } catch (_) {}

  const rawPoints = Array.isArray(analysis.actionPoints)
    ? analysis.actionPoints
    : [];
  const actionPoints = rawPoints
    .map((p) => {
      if (typeof p === "string") return p.trim();
      if (p && typeof p === "object") {
        const text =
          p.action || p.task || p.description || p.text || p.item || "";
        const owner = p.owner || p.assignee || "";
        const deadline = p.deadline || p.due || "";
        let r = text;
        if (owner && !r.toLowerCase().includes(owner.toLowerCase()))
          r += ` — ${owner}`;
        if (deadline && !r.toLowerCase().includes(deadline.toLowerCase()))
          r += ` (by ${deadline})`;
        return r.trim() || JSON.stringify(p);
      }
      return String(p);
    })
    .filter((s) => s.length > 0);

  const entry = {
    id: crypto.randomUUID(),
    title: analysis.title || "Imported Meeting",
    date: new Date().toISOString(),
    duration: null,
    transcript: transcript.trim(),
    summary: analysis.summary || "",
    actionPoints,
    source: "import",
  };

  const list = getTranscripts();
  list.unshift(entry);
  saveTranscripts(list);
  return entry;
});

// ── IPC: process audio (multi-segment for long meetings) ────────────────
ipcMain.handle(
  "process-audio",
  async (_, { audioSegments, audioBuffer, duration }) => {
    const groq = getGroqClient();
    if (!groq)
      throw new Error(
        "Groq API key not configured. Open Settings to add your free key.",
      );

    // Accept either a segments array (new) or a single buffer (legacy)
    const segments = audioSegments ?? [audioBuffer];
    const total = segments.length;
    const tempFiles = [];

    const send = (msg) => {
      if (mainWindow && !mainWindow.isDestroyed())
        mainWindow.webContents.send("progress", msg);
    };

    try {
      // ─ Step 1: transcribe each segment ───────────────────────────────
      let fullTranscript = "";

      for (let i = 0; i < total; i++) {
        const part = total > 1 ? ` (part ${i + 1} of ${total})` : "";
        send(`Transcribing${part}…`);

        const tmpPath = path.join(
          os.tmpdir(),
          `rectransc-${Date.now()}-${i}.webm`,
        );
        fs.writeFileSync(tmpPath, Buffer.from(segments[i]));
        tempFiles.push(tmpPath);

        const { text } = await groq.audio.transcriptions.create({
          file:     fs.createReadStream(tmpPath),
          model:    "whisper-large-v3",
          language: "en",
          prompt:   "This is an English business meeting transcript.",
        });

        if (text?.trim())
          fullTranscript += (fullTranscript ? " " : "") + text.trim();
      }

      if (!fullTranscript.trim())
        throw new Error("No speech detected in the recording.");

      // ─ Step 2: analyse combined transcript ──────────────────────────
      send("Analysing with LLaMA…");
      const completion = await groq.chat.completions.create({
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
            content: `Analyse this meeting transcript and return a JSON object with exactly these fields:\n- "title": a short descriptive meeting title (5\u20138 words)\n- "summary": a concise 3\u20135 sentence summary of the key discussion points\n- "actionPoints": an array of plain strings only (not objects), each string is one action item written as a complete sentence including who is responsible and any deadline if mentioned\n\nExample of correct actionPoints format: ["John to send the proposal by Friday", "Team to review the budget next week"]\n\nTranscript:\n${fullTranscript}`,
          },
        ],
      });

      let analysis = { title: "Meeting", summary: "", actionPoints: [] };
      try {
        analysis = JSON.parse(completion.choices[0].message.content);
      } catch (_) {}

      // Normalise actionPoints: LLaMA sometimes returns objects instead of strings
      const rawPoints = Array.isArray(analysis.actionPoints)
        ? analysis.actionPoints
        : [];
      const actionPoints = rawPoints
        .map((p) => {
          if (typeof p === "string") return p.trim();
          if (p && typeof p === "object") {
            // Flatten common object shapes {action, task, description, owner, deadline, text, item}
            const text =
              p.action || p.task || p.description || p.text || p.item || "";
            const owner = p.owner || p.assignee || p.responsible || "";
            const deadline = p.deadline || p.due || p.dueDate || "";
            let result = text;
            if (owner && !result.toLowerCase().includes(owner.toLowerCase()))
              result += ` — ${owner}`;
            if (
              deadline &&
              !result.toLowerCase().includes(deadline.toLowerCase())
            )
              result += ` (by ${deadline})`;
            return result.trim() || JSON.stringify(p);
          }
          return String(p);
        })
        .filter((s) => s.length > 0);

      const entry = {
        id: crypto.randomUUID(),
        title: analysis.title || "Meeting",
        date: new Date().toISOString(),
        duration,
        transcript: fullTranscript,
        summary: analysis.summary || "",
        actionPoints,
      };

      const list = getTranscripts();
      list.unshift(entry);
      saveTranscripts(list);
      return entry;
    } finally {
      tempFiles.forEach((f) => {
        try {
          fs.unlinkSync(f);
        } catch (_) {}
      });
    }
  },
);
