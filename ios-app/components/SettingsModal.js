import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Linking,
  ScrollView,
} from "react-native";
import { saveApiKey, hasKey } from "../utils/storage";

const C = {
  bg: "#0c0c1a",
  accent: "#7c5cbf",
  aLight: "#9b7fdb",
  red: "#e84545",
  text: "#e6e6f0",
  textSec: "#8888a8",
};

export default function SettingsModal({ visible, canClose, onClose, onSaved }) {
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    const k = key.trim();
    if (!k.startsWith("gsk_")) {
      setErr("Groq key should start with gsk_");
      return;
    }
    setBusy(true);
    try {
      await saveApiKey(k);
      setKey("");
      setErr("");
      onSaved();
    } catch (e) {
      setErr("Failed to save: " + e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => canClose && onClose()}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.root}>
          <View style={s.handle} />
          {canClose && (
            <TouchableOpacity style={s.cancelRow} onPress={onClose}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
          <ScrollView
            contentContainerStyle={s.body}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={s.emoji}>🔑</Text>
            <Text style={s.title}>
              {canClose ? "Update Groq Key" : "Groq API Key"}
            </Text>
            <Text style={s.desc}>
              {canClose
                ? "Enter a new Groq key to replace the current one."
                : "100% free — one key covers transcription and meeting analysis. No credit card needed."}
            </Text>
            <TextInput
              style={[s.input, err ? { borderColor: C.red } : null]}
              value={key}
              onChangeText={(v) => {
                setKey(v);
                setErr("");
              }}
              placeholder="gsk_…"
              placeholderTextColor="rgba(255,255,255,0.2)"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
            {!!err && <Text style={s.errText}>{err}</Text>}
            <TouchableOpacity
              style={[s.saveBtn, busy && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={s.saveBtnText}>{busy ? "Saving…" : "Save Key"}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Linking.openURL("https://console.groq.com/keys")}
            >
              <Text style={s.link}>
                Get your free key at console.groq.com →
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
  },
  cancelRow: {
    alignSelf: "flex-start",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  cancelText: { fontSize: 17, color: C.aLight },
  body: { padding: 28, alignItems: "center", paddingTop: 36 },
  emoji: { fontSize: 42, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: C.text,
    marginBottom: 10,
    textAlign: "center",
    letterSpacing: -0.4,
  },
  desc: {
    fontSize: 13,
    color: "#8888a8",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  input: {
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 10,
    padding: 13,
    color: C.text,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 8,
  },
  errText: {
    color: C.red,
    fontSize: 13,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  saveBtn: {
    width: "100%",
    backgroundColor: C.accent,
    borderRadius: 10,
    padding: 15,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 20,
  },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  link: { fontSize: 13, color: C.aLight, opacity: 0.8 },
});
