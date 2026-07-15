"use strict";

// ── State ──────────────────────────────────────────────────────────
let transcripts = [];
let selectedId = null;
let mediaRecorder = null;
let isRecording = false;
let isProcessing = false;
let timerInterval = null;
let seconds = 0;
let hasKey = false;
let mimeType = "";

// ── Segment recording (handles long meetings) ──────────────────────
// Groq Whisper has a 25 MB file limit. We rotate to a fresh recorder
// every SEGMENT_MS so each chunk is small and can be transcribed
// independently. Transcripts are concatenated before analysis.
const SEGMENT_MS  = 20 * 60 * 1000   // rotate every 20 minutes
const AUDIO_KBPS  = 128000            // 128 kbps — clear speech quality, ~19 MB per 20-min segment
let segments = []; // completed Blobs, one per segment
let streamRef = null; // keeps the mic stream alive across rotations
let segmentTimerId = null; // setInterval that triggers rotation
let isFinalStop = false;

// ── DOM refs ───────────────────────────────────────────────────────
const recordBtn = document.getElementById("record-btn");
const timerEl = document.getElementById("timer");
const statusText = document.getElementById("status-text");
const waveform = document.getElementById("waveform");
const transcriptList = document.getElementById("transcript-list");
const recordingView = document.getElementById("recording-view");
const detailView = document.getElementById("detail-view");
const newRecordingBtn = document.getElementById("new-recording-btn");
const settingsOverlay = document.getElementById("settings-overlay");
const settingsBtn = document.getElementById("settings-btn");
const groqKeyInput = document.getElementById("groq-key-input");
const keyError = document.getElementById("key-error");
const saveKeyBtn = document.getElementById("save-key-btn");
const settingsCancelBtn = document.getElementById("settings-cancel-btn");
const settingsTitle = document.getElementById("settings-title");
const settingsDesc = document.getElementById("settings-desc");
const deleteBtn = document.getElementById("delete-btn");

// ── Init ───────────────────────────────────────────────────────────
async function init() {
  const settings = await window.api.getSettings();
  hasKey = settings.hasKey;
  if (!hasKey) showSettings(false);
  transcripts = await window.api.getTranscripts();
  renderList();
  window.api.onProgress((msg) => {
    statusText.textContent = msg;
  });
}

// ── Recording ──────────────────────────────────────────────────────
recordBtn.addEventListener("click", async () => {
  if (isProcessing) return;
  if (isRecording) stopRecording();
  else await startRecording();
});

recordBtn.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    recordBtn.click();
  }
});

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    mimeType =
      [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t)) || "";

    segments = [];
    streamRef = stream;
    isFinalStop = false;
    isRecording = true;
    seconds = 0;

    // Start first segment
    startNewSegment();

    // Auto-rotate every SEGMENT_MS
    segmentTimerId = setInterval(() => rotateSegment(), SEGMENT_MS);

    recordBtn.classList.add("recording");
    waveform.classList.remove("hidden");
    statusText.textContent = "Recording… click to stop";

    timerInterval = setInterval(() => {
      seconds++;
      timerEl.textContent = fmtTime(seconds);
      // Show segment count for long recordings
      if (seconds > 0 && seconds % 60 === 0 && segments.length > 0) {
        const segLabel =
          segments.length > 0
            ? `  ·  ${segments.length} segment${segments.length > 1 ? "s" : ""} saved`
            : "";
        statusText.textContent = `Recording…${segLabel}  click to stop`;
      }
    }, 1000);
  } catch (err) {
    statusText.textContent =
      err.name === "NotAllowedError"
        ? "Microphone access denied — check System Settings > Privacy."
        : "Could not start recording: " + err.message;
  }
}

// Creates a fresh MediaRecorder on the existing stream.
// When it stops, the blob is pushed to segments[].
// If isFinalStop is set, processing begins after.
function startNewSegment() {
  const chunks = [];
  const options = { audioBitsPerSecond: AUDIO_KBPS };
  if (mimeType) options.mimeType = mimeType;

  const recorder = new MediaRecorder(streamRef, options);

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    if (chunks.length > 0) {
      segments.push(new Blob(chunks, { type: mimeType || "audio/webm" }));
    }
    if (isFinalStop) {
      streamRef?.getTracks().forEach((t) => t.stop());
      processRecording();
    }
  };

  recorder.start(500);
  mediaRecorder = recorder;
}

// Stops the current segment and starts a fresh one (keeps recording).
function rotateSegment() {
  if (!isRecording || isFinalStop) return;
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    // onstop will NOT trigger processRecording because isFinalStop is false
    mediaRecorder.stop();
  }
  startNewSegment();
}

// User clicked stop.
function stopRecording() {
  if (!mediaRecorder || !isRecording) return;
  clearInterval(timerInterval);
  clearInterval(segmentTimerId);

  isRecording = false;
  isProcessing = true;
  isFinalStop = true; // ← next onstop triggers processRecording()

  recordBtn.classList.remove("recording");
  recordBtn.classList.add("processing");
  waveform.classList.add("hidden");
  statusText.textContent = "Processing…";

  if (mediaRecorder.state !== "inactive") mediaRecorder.stop();
}

async function processRecording() {
  const duration = seconds;
  try {
    const segmentBuffers = await Promise.all(
      segments.map((b) => b.arrayBuffer()),
    );
    const result = await window.api.processAudio({
      audioSegments: segmentBuffers,
      duration,
    });
    transcripts.unshift(result);
    renderList();
    showDetail(result.id);
  } catch (err) {
    statusText.textContent = "⚠  " + (err.message || "Something went wrong.");
    if (err.message?.toLowerCase().includes("key"))
      setTimeout(() => showSettings(hasKey), 1800);
  } finally {
    recordBtn.classList.remove("processing");
    timerEl.textContent = "00:00";
    isProcessing = false;
    segments = [];
    isFinalStop = false;
  }
}

// ── Sidebar list ───────────────────────────────────────────────────
function renderList() {
  if (!transcripts.length) {
    transcriptList.innerHTML =
      '<div class="list-empty">No recordings yet.<br>Hit <strong>New Recording</strong> to begin.</div>';
    return;
  }
  transcriptList.innerHTML = transcripts
    .map(
      (t) => `
    <div class="transcript-item${selectedId === t.id ? " selected" : ""}" data-id="${t.id}">
      <div class="item-title">${esc(t.title)}</div>
      <div class="item-meta"><span>${relDate(t.date)}</span><span>${fmtDuration(t.duration)}</span></div>
    </div>`,
    )
    .join("");
  transcriptList.querySelectorAll(".transcript-item").forEach((el) => {
    el.addEventListener("click", () => showDetail(el.dataset.id));
  });
}

// ── Detail view ────────────────────────────────────────────────────
function showDetail(id) {
  const t = transcripts.find((t) => t.id === id);
  if (!t) return;
  selectedId = id;
  renderList();
  document.getElementById("detail-title").textContent = t.title;
  document.getElementById("detail-date").textContent =
    fmtDate(t.date) + (t.source === "import" ? "  ·  Imported" : "");
  document.getElementById("detail-duration").textContent = t.duration
    ? fmtDuration(t.duration)
    : "";
  document.getElementById("detail-summary").textContent =
    t.summary || "No summary available.";
  document.getElementById("detail-transcript").textContent = t.transcript;
  const ul = document.getElementById("detail-actions");
  ul.innerHTML = t.actionPoints?.length
    ? t.actionPoints.map((a) => `<li>${esc(a)}</li>`).join("")
    : '<li class="no-actions">No specific action items were identified.</li>';
  document
    .querySelectorAll(".detail-section")
    .forEach((s) => s.classList.remove("collapsed"));
  recordingView.classList.add("hidden");
  detailView.classList.remove("hidden");
}

document.querySelectorAll(".section-header").forEach((h) => {
  h.addEventListener("click", () =>
    h.closest(".detail-section").classList.toggle("collapsed"),
  );
});

// ── New Recording ──────────────────────────────────────────────────
newRecordingBtn.addEventListener("click", () => {
  if (isRecording || isProcessing) return;
  selectedId = null;
  renderList();
  detailView.classList.add("hidden");
  recordingView.classList.remove("hidden");
  statusText.textContent = "Click to start recording";
  timerEl.textContent = "00:00";
});

// ── Delete ─────────────────────────────────────────────────────────
deleteBtn.addEventListener("click", async () => {
  if (!selectedId) return;
  if (!window.confirm("Delete this recording? This cannot be undone.")) return;
  transcripts = await window.api.deleteTranscript(selectedId);
  selectedId = null;
  renderList();
  detailView.classList.add("hidden");
  recordingView.classList.remove("hidden");
  statusText.textContent = "Click to start recording";
});

// ── Import View ──────────────────────────────────────────────
const importView = document.getElementById("import-view");
const importCancelBtn = document.getElementById("import-cancel-btn");
const importSubmitBtn = document.getElementById("import-submit-btn");
const txInput = document.getElementById("transcript-input");
const fileInput = document.getElementById("file-input");
const wordCountEl = document.getElementById("word-count");
const importStatusEl = document.getElementById("import-status");
const importErrorEl = document.getElementById("import-error");
const fileNameEl = document.getElementById("file-name");

// Show import view
document.getElementById("import-btn").addEventListener("click", function () {
  recordingView.classList.add("hidden");
  detailView.classList.add("hidden");
  importView.classList.remove("hidden");
  txInput.value = "";
  fileInput.value = "";
  fileNameEl.textContent = "";
  wordCountEl.textContent = "";
  importStatusEl.textContent = "";
  importErrorEl.classList.add("hidden");
  importSubmitBtn.disabled = false;
  importSubmitBtn.textContent = "Analyse →";
  setTimeout(function () {
    txInput.focus();
  }, 50);
});

// Cancel → back to recording view
importCancelBtn.addEventListener("click", function () {
  importView.classList.add("hidden");
  recordingView.classList.remove("hidden");
  selectedId = null;
  renderList();
});

// File upload → populate textarea
fileInput.addEventListener("change", function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (ev) {
    txInput.value = ev.target.result;
    fileNameEl.textContent = file.name;
    updateImportWordCount();
    fileInput.value = "";
  };
  reader.readAsText(file);
});

txInput.addEventListener("input", function () {
  updateImportWordCount();
  importErrorEl.classList.add("hidden");
});
txInput.addEventListener("keydown", function (e) {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") doImportSubmit();
});

function updateImportWordCount() {
  var n = txInput.value.trim().split(/\s+/).filter(Boolean).length;
  wordCountEl.textContent = n > 0 ? n.toLocaleString() + " words" : "";
}

if (window.api.onImportProgress) {
  window.api.onImportProgress(function (msg) {
    importStatusEl.textContent = msg;
  });
}

importSubmitBtn.addEventListener("click", doImportSubmit);

async function doImportSubmit() {
  var text = txInput.value.trim();
  if (!text) {
    importErrorEl.textContent = "Please paste or upload a transcript first.";
    importErrorEl.classList.remove("hidden");
    return;
  }
  if (text.split(/\s+/).filter(Boolean).length < 10) {
    importErrorEl.textContent =
      "Transcript is too short — please paste the full text.";
    importErrorEl.classList.remove("hidden");
    return;
  }
  importSubmitBtn.disabled = true;
  importSubmitBtn.textContent = "Analysing…";
  importErrorEl.classList.add("hidden");
  try {
    var result = await window.api.analyseTranscript({ transcript: text });
    transcripts.unshift(result);
    renderList();
    importView.classList.add("hidden");
    showDetail(result.id);
  } catch (err) {
    importErrorEl.textContent =
      "⚠  " + (err.message || "Something went wrong.");
    importErrorEl.classList.remove("hidden");
    importStatusEl.textContent = "";
  } finally {
    importSubmitBtn.disabled = false;
    importSubmitBtn.textContent = "Analyse →";
  }
}

// ── Settings ───────────────────────────────────────────────────
settingsBtn.addEventListener("click", () => showSettings(hasKey));

function showSettings(canCancel) {
  settingsTitle.textContent = canCancel
    ? "Update Groq Key"
    : "Groq API Key Required";
  settingsDesc.textContent = canCancel
    ? "Enter a new Groq key to replace the current one."
    : "100% free — covers transcription and meeting analysis. No credit card needed.";
  settingsCancelBtn.classList.toggle("hidden", !canCancel);
  groqKeyInput.value = "";
  keyError.classList.add("hidden");
  settingsOverlay.classList.remove("hidden");
  setTimeout(() => groqKeyInput.focus(), 80);
}

settingsCancelBtn.addEventListener("click", () =>
  settingsOverlay.classList.add("hidden"),
);
saveKeyBtn.addEventListener("click", saveKey);
groqKeyInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveKey();
});
groqKeyInput.addEventListener("input", () => keyError.classList.add("hidden"));

async function saveKey() {
  const key = groqKeyInput.value.trim();
  if (!key.startsWith("gsk_")) {
    keyError.classList.remove("hidden");
    groqKeyInput.focus();
    return;
  }
  await window.api.saveKey(key);
  hasKey = true;
  settingsOverlay.classList.add("hidden");
}

// ── Helpers ────────────────────────────────────────────────────────
function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
function fmtDuration(s) {
  if (!s && s !== 0) return "";
  const m = Math.floor(s / 60),
    sec = s % 60;
  return m === 0 ? `${sec}s` : sec === 0 ? `${m}m` : `${m}m ${sec}s`;
}
function fmtDate(iso) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function relDate(iso) {
  const d = Date.now() - new Date(iso).getTime(),
    m = Math.floor(d / 60000),
    h = Math.floor(d / 3600000),
    days = Math.floor(d / 86400000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (days < 7) return `${days}d ago`;
  return fmtDate(iso).split(",")[0];
}
function esc(str) {
  // Guard against LLaMA returning objects instead of strings
  const s =
    str && typeof str === "object"
      ? str.action ||
        str.task ||
        str.description ||
        str.text ||
        JSON.stringify(str)
      : String(str || "");
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

init();
