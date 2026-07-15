"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getTranscripts: () => ipcRenderer.invoke("get-transcripts"),
  deleteTranscript: (id) => ipcRenderer.invoke("delete-transcript", id),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveKey: (key) => ipcRenderer.invoke("save-key", key),
  processAudio: (data) => ipcRenderer.invoke("process-audio", data),
  analyseTranscript: (data) => ipcRenderer.invoke("analyse-transcript", data),
  onProgress: (cb) => ipcRenderer.on("progress", (_, msg) => cb(msg)),
  onImportProgress: (cb) =>
    ipcRenderer.on("import-progress", (_, msg) => cb(msg)),
  removeProgressListener: () => ipcRenderer.removeAllListeners("progress"),
});
