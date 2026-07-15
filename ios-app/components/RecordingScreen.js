import React, { useState, useRef, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from "react-native";
import { Audio } from "expo-av";
import { getApiKey, loadTranscripts, saveTranscripts } from "../utils/storage";
import { transcribeAudio, analyzeTranscript } from "../utils/openai";

const C = {
  bg: "#0c0c1a",
  accent: "#7c5cbf",
  aLight: "#9b7fdb",
  red: "#e84545",
  blue: "#4a8fe8",
  text: "#e6e6f0",
  textSec: "#8888a8",
  textDim: "#50506a",
};

const PHASE = {
  IDLE: "idle",
  RECORDING: "recording",
  PROCESSING: "processing",
  ERROR: "error",
};

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecordingScreen({ visible, onClose, onComplete }) {
  const [phase, setPhase] = useState(PHASE.IDLE);
  const [status, setStatus] = useState("Tap the button to start");
  const [secs, setSecs] = useState(0);

  const recRef = useRef(null);
  const timerRef = useRef(null);
  const secsRef = useRef(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const animLoop = useRef(null);
  const opacAnim = useRef(new Animated.Value(1)).current;

  // Pulse when recording, spin-fade when processing
  useEffect(() => {
    if (phase === PHASE.RECORDING) {
      animLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.14,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 1,
            duration: 700,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );
      animLoop.current.start();
    } else if (phase === PHASE.PROCESSING) {
      animLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(opacAnim, {
            toValue: 0.45,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(opacAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ]),
      );
      animLoop.current.start();
    } else {
      if (animLoop.current) animLoop.current.stop();
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
      opacAnim.setValue(1);
    }
  }, [phase]);

  useEffect(() => {
    if (!visible) reset();
  }, [visible]);

  const segmentsRef = useRef([]); // URIs of completed segments
  const segTimerRef = useRef(null);
  const SEGMENT_SECS = 20 * 60; // rotate every 20 minutes

  async function reset() {
    clearInterval(timerRef.current);
    clearInterval(segTimerRef.current);
    if (recRef.current) {
      try {
        await recRef.current.stopAndUnloadAsync();
      } catch {}
      recRef.current = null;
    }
    segmentsRef.current = [];
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {}
    setPhase(PHASE.IDLE);
    setSecs(0);
    secsRef.current = 0;
    setStatus("Tap the button to start");
  }

  async function handlePress() {
    if (phase === PHASE.PROCESSING) return;
    if (phase === PHASE.RECORDING) await stopAndProcess();
    else await beginRecording();
  }

  async function beginRecording() {
    try {
      const { status: perm } = await Audio.requestPermissionsAsync();
      if (perm !== "granted") {
        setStatus(
          "Microphone access denied.\nGo to Settings \u2192 Privacy \u2192 Microphone.",
        );
        setPhase(PHASE.ERROR);
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      segmentsRef.current = [];
      secsRef.current = 0;
      setSecs(0);

      // Start first segment
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recRef.current = recording;
      setPhase(PHASE.RECORDING);
      setStatus("Recording\u2026  tap to stop");

      timerRef.current = setInterval(() => {
        secsRef.current += 1;
        setSecs(secsRef.current);
      }, 1000);

      // Rotate to a new segment every SEGMENT_SECS
      segTimerRef.current = setInterval(async () => {
        if (!recRef.current) return;
        try {
          await recRef.current.stopAndUnloadAsync();
          const uri = recRef.current.getURI();
          if (uri) segmentsRef.current.push(uri);
          const { recording: next } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY,
          );
          recRef.current = next;
        } catch {}
      }, SEGMENT_SECS * 1000);
    } catch (err) {
      setStatus("\u26a0  " + err.message);
      setPhase(PHASE.ERROR);
    }
  }

  async function stopAndProcess() {
    clearInterval(timerRef.current);
    clearInterval(segTimerRef.current);
    const duration = secsRef.current;
    setPhase(PHASE.PROCESSING);
    setStatus("Finalising recording\u2026");
    try {
      // Save final segment
      await recRef.current.stopAndUnloadAsync();
      const uri = recRef.current.getURI();
      if (uri) segmentsRef.current.push(uri);
      recRef.current = null;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });

      const groqKey = await getApiKey();
      if (!groqKey) throw new Error("Groq key not set \u2014 open Settings.");

      const allSegments = segmentsRef.current;
      const total = allSegments.length;
      let fullTranscript = "";

      for (let i = 0; i < total; i++) {
        const part = total > 1 ? ` (part ${i + 1} of ${total})` : "";
        setStatus(`Transcribing${part}\u2026`);
        const text = await transcribeAudio(groqKey, allSegments[i]);
        if (text?.trim())
          fullTranscript += (fullTranscript ? " " : "") + text.trim();
      }

      if (!fullTranscript.trim())
        throw new Error("No speech detected in the recording.");

      setStatus("Analysing with LLaMA\u2026");
      const analysis = await analyzeTranscript(groqKey, fullTranscript);

      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        title: analysis.title || "Meeting",
        date: new Date().toISOString(),
        duration,
        transcript: fullTranscript,
        summary: analysis.summary || "",
        actionPoints: Array.isArray(analysis.actionPoints)
          ? analysis.actionPoints
          : [],
      };

      const list = await loadTranscripts();
      list.unshift(entry);
      await saveTranscripts(list);

      secsRef.current = 0;
      setSecs(0);
      segmentsRef.current = [];
      setPhase(PHASE.IDLE);
      setStatus("Tap the button to start");
      onComplete(entry);
    } catch (err) {
      setStatus("\u26a0  " + err.message);
      setPhase(PHASE.ERROR);
    }
  }

  const isProcessing = phase === PHASE.PROCESSING;
  const btnColor =
    phase === PHASE.RECORDING
      ? C.red
      : phase === PHASE.PROCESSING
        ? C.blue
        : C.accent;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => !isProcessing && onClose()}
    >
      <View style={s.root}>
        <View style={s.handle} />

        {/* Cancel row */}
        <TouchableOpacity
          style={s.cancelRow}
          onPress={() => !isProcessing && onClose()}
          disabled={isProcessing}
        >
          <Text style={[s.cancelText, isProcessing && { opacity: 0.3 }]}>
            Cancel
          </Text>
        </TouchableOpacity>

        {/* Screen title */}
        <Text style={s.title}>
          {phase === PHASE.RECORDING
            ? "Recording"
            : phase === PHASE.PROCESSING
              ? "Processing…"
              : "New Recording"}
        </Text>

        {/* Big animated record button */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Animated.View
            style={[
              s.btnOuter,
              { borderColor: btnColor + "44", opacity: opacAnim },
            ]}
          >
            <TouchableOpacity
              style={[s.btnInner, { backgroundColor: btnColor }]}
              onPress={handlePress}
              disabled={isProcessing}
              activeOpacity={0.82}
            >
              {phase === PHASE.RECORDING ? (
                <View style={s.stopIcon} />
              ) : (
                <Text style={s.micEmoji}>🎙</Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* Timer */}
        <Text style={s.timer}>{fmtTime(secs)}</Text>

        {/* Status */}
        <Text style={[s.statusTxt, phase === PHASE.ERROR && { color: C.red }]}>
          {status}
        </Text>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: "center" },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 2,
    marginTop: 10,
  },
  cancelRow: {
    alignSelf: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cancelText: { fontSize: 17, color: C.aLight },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.5,
    marginTop: 44,
    marginBottom: 52,
  },
  btnOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  btnInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#7c5cbf",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 20,
    elevation: 12,
  },
  stopIcon: { width: 38, height: 38, borderRadius: 6, backgroundColor: "#fff" },
  micEmoji: { fontSize: 46 },
  timer: {
    fontSize: 52,
    fontWeight: "200",
    color: C.text,
    letterSpacing: 2,
    marginTop: 36,
    marginBottom: 16,
    fontVariant: ["tabular-nums"],
  },
  statusTxt: {
    fontSize: 15,
    color: C.textSec,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 23,
  },
});
