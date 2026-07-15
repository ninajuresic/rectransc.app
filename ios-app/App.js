import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { loadTranscripts, saveTranscripts, hasKey } from "./utils/storage";
import RecordingScreen from "./components/RecordingScreen";
import DetailModal from "./components/DetailModal";
import SettingsModal from "./components/SettingsModal";

// ── Colours ──────────────────────────────────────────────────────
const C = {
  bg: "#0c0c1a",
  card: "#16162a",
  border: "rgba(255,255,255,0.08)",
  accent: "#7c5cbf",
  aLight: "#9b7fdb",
  text: "#e6e6f0",
  textSec: "#8888a8",
  textDim: "#50506a",
};

// ── Transcript card ───────────────────────────────────────────────
function relDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function fmtDur(s) {
  if (!s) return "";
  const m = Math.floor(s / 60),
    sec = s % 60;
  return m === 0 ? `${sec}s` : sec === 0 ? `${m}m` : `${m}m ${sec}s`;
}

function TranscriptCard({ item, onPress }) {
  return (
    <TouchableOpacity style={card.wrap} onPress={onPress} activeOpacity={0.7}>
      <View style={card.dot} />
      <View style={card.body}>
        <Text style={card.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={card.meta}>
          {relDate(item.date)} · {fmtDur(item.duration)}
        </Text>
      </View>
      <Text style={card.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const card = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.aLight,
    marginRight: 12,
    flexShrink: 0,
  },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: "500", color: C.text, marginBottom: 4 },
  meta: { fontSize: 12, color: C.textDim },
  chevron: { fontSize: 24, color: C.textDim, marginLeft: 6 },
});

// ── App ───────────────────────────────────────────────────────────
export default function App() {
  const [transcripts, setTranscripts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [showRecord, setShowRecord] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    (async () => {
      const ok = await hasKey();
      setHasKey(ok);
      if (!ok) setShowSettings(true);
      setTranscripts(await loadTranscripts());
    })();
  }, []);

  function handleComplete(entry) {
    setTranscripts((prev) => [entry, ...prev]);
    setShowRecord(false);
    setSelected(entry);
  }

  async function handleDelete(id) {
    const next = transcripts.filter((t) => t.id !== id);
    setTranscripts(next);
    await saveTranscripts(next);
    setSelected(null);
  }

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={s.header}>
        <Text style={s.headerTitle}>RecTransc</Text>
        <TouchableOpacity
          style={s.iconBtn}
          onPress={() => setShowSettings(true)}
        >
          <Text style={s.iconBtnTxt}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* ── List / empty state ── */}
      {transcripts.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🎙</Text>
          <Text style={s.emptyTitle}>No recordings yet</Text>
          <Text style={s.emptySub}>
            Tap the button below to record your first meeting
          </Text>
        </View>
      ) : (
        <FlatList
          data={transcripts}
          keyExtractor={(t) => t.id}
          renderItem={({ item }) => (
            <TranscriptCard item={item} onPress={() => setSelected(item)} />
          )}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Floating action button ── */}
      <View style={s.fab}>
        <TouchableOpacity
          style={s.fabBtn}
          onPress={() => setShowRecord(true)}
          activeOpacity={0.85}
        >
          <Text style={s.fabIcon}>🎙</Text>
          <Text style={s.fabTxt}>New Recording</Text>
        </TouchableOpacity>
      </View>

      {/* ── Modals ── */}
      <RecordingScreen
        visible={showRecord}
        onClose={() => setShowRecord(false)}
        onComplete={handleComplete}
      />
      <DetailModal
        transcript={selected}
        onClose={() => setSelected(null)}
        onDelete={handleDelete}
      />
      <SettingsModal
        visible={showSettings}
        canClose={hasKey}
        onClose={() => setShowSettings(false)}
        onSaved={() => {
          setHasKey(true);
          setShowSettings(false);
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: C.text,
    letterSpacing: -0.5,
  },
  iconBtn: { padding: 8 },
  iconBtnTxt: { fontSize: 20, color: C.textSec },

  list: { padding: 16, paddingBottom: 110 },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  emptyIcon: { fontSize: 54, marginBottom: 18 },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "600",
    color: C.text,
    marginBottom: 8,
    textAlign: "center",
  },
  emptySub: {
    fontSize: 14,
    color: C.textSec,
    textAlign: "center",
    lineHeight: 21,
  },

  fab: {
    position: "absolute",
    bottom: 34,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.accent,
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 100,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 8,
  },
  fabIcon: { fontSize: 18 },
  fabTxt: { fontSize: 16, fontWeight: "600", color: "#fff" },
});
