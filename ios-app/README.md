# RecTransc — iOS App

A native iOS app (built with React Native + Expo) that records meetings, transcribes them with OpenAI Whisper, and produces a summary + action points. All data stored locally on device.

---

## What you need

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Already installed (used for the desktop app) |
| **Xcode** | Free from the Mac App Store — needed for the iOS Simulator |
| **OpenAI API key** | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

---

## Install Xcode (one-time, ~10 GB)

1. Open the **Mac App Store** and search for **Xcode**
2. Click **Get / Install** (it's free, ~10 GB, takes 10–20 min)
3. Once installed, open it once and accept the licence agreement
4. Install command-line tools when prompted

---

## Setup & run

```bash
# 1 — navigate into the iOS app folder
cd "/Users/ninajuresic/Desktop/rectransc app/ios-app"

# 2 — install dependencies
npm install

# 3 — start Expo (opens a browser menu)
npx expo start

# 4 — press  i  in the terminal to open the iOS Simulator
```

That's it. The app will launch inside an iPhone Simulator on your laptop — no physical device needed.

---

## First launch

1. The app immediately asks for your **OpenAI API key**
2. Paste your key (starts with `sk-`) and tap **Save Key**
3. Tap **New Recording** (the purple button at the bottom)
4. Allow microphone access when prompted
5. Speak — a timer counts up
6. Tap the red stop button when done
7. Wait ~10–30 s while Whisper transcribes and GPT-4o analyses
8. The result opens automatically with **Summary**, **Action Points**, and **Full Transcript**

---

## Alternative: run on your real iPhone (no Xcode needed)

1. Install **Expo Go** from the App Store on your iPhone
2. Run `npx expo start` on your laptop
3. Scan the QR code shown in the terminal with your iPhone camera
4. The app opens in Expo Go

> Note: microphone recording in Expo Go works on real devices but not on the simulator without microphone hardware (simulator uses your Mac's mic).

---

## App structure

```
ios-app/
├── App.js                      ← main screen (list + FAB)
├── components/
│   ├── RecordingScreen.js      ← recording modal (mic → Whisper → GPT-4o)
│   ├── DetailModal.js          ← transcript detail (summary / actions / transcript)
│   └── SettingsModal.js        ← API key management
└── utils/
    ├── openai.js               ← Whisper + GPT-4o API calls
    └── storage.js              ← AsyncStorage helpers
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `command not found: expo` | Run `npx expo start` instead of `expo start` |
| Simulator doesn't open | Make sure Xcode is installed and you've launched it at least once |
| "Microphone access denied" | In the Simulator: Features → Microphone → Enabled |
| API errors | Check your key at [platform.openai.com](https://platform.openai.com) and verify you have credits |
| `npm install` version conflict | Run `npx expo install --fix` to auto-fix dependency versions |
