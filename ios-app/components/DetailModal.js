import React, { useState } from 'react'
import {
  Modal,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'

const C = {
  bg:      '#0c0c1a',
  border:  'rgba(255,255,255,0.08)',
  aLight:  '#9b7fdb',
  green:   '#4caf7d',
  blue:    '#4a8fe8',
  red:     '#e84545',
  text:    '#e6e6f0',
  textSec: '#8888a8',
  textDim: '#50506a',
}

// ── Collapsible section ────────────────────────────────────────────
function Section({ color, label, children }) {
  const [open, setOpen] = useState(true)
  return (
    <View style={sec.wrap}>
      <TouchableOpacity style={sec.header} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={[sec.dot, { backgroundColor: color }]} />
          <Text style={sec.label}>{label}</Text>
        </View>
        <Text style={sec.chevron}>{open ? '▾' : '›'}</Text>
      </TouchableOpacity>
      {open && <View style={sec.body}>{children}</View>}
    </View>
  )
}

const sec = StyleSheet.create({
  wrap:    { borderWidth: 1, borderColor: C.border, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  header:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, backgroundColor: 'rgba(255,255,255,0.025)' },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  label:   { fontSize: 14, fontWeight: '500', color: C.text },
  chevron: { fontSize: 17, color: C.textDim },
  body:    { padding: 14, paddingTop: 4 },
})

// ── Helpers ────────────────────────────────────────────────────────
function fmtDate(iso) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}
function fmtDur(s) {
  if (!s) return ''
  const m = Math.floor(s / 60), sec = s % 60
  return m === 0 ? `${sec}s` : sec === 0 ? `${m}m` : `${m}m ${sec}s`
}

// ── Component ─────────────────────────────────────────────────────
export default function DetailModal({ transcript, onClose, onDelete }) {
  if (!transcript) return null

  function handleDelete() {
    Alert.alert(
      'Delete Recording',
      'This recording will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(transcript.id) },
      ]
    )
  }

  return (
    <Modal
      visible={!!transcript}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={d.root}>
        <View style={d.handle} />

        {/* Top bar */}
        <View style={d.topBar}>
          <TouchableOpacity onPress={onClose} style={d.doneBtn}>
            <Text style={d.doneText}>Done</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete} style={d.delBtn}>
            <Text style={d.delText}>🗑  Delete</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={d.scroll} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Text style={d.title}>{transcript.title}</Text>
          <Text style={d.meta}>{fmtDate(transcript.date)}  ·  {fmtDur(transcript.duration)}</Text>

          <View style={{ marginTop: 20 }}>
            {/* Summary */}
            <Section color={C.aLight} label="Summary">
              <Text style={d.bodyText}>{transcript.summary || 'No summary available.'}</Text>
            </Section>

            {/* Action Points */}
            <Section color={C.green} label="Action Points">
              {transcript.actionPoints?.length
                ? transcript.actionPoints.map((a, i) => (
                    <View key={i} style={d.actionRow}>
                      <Text style={d.arrow}>→</Text>
                      <Text style={d.actionText}>{a}</Text>
                    </View>
                  ))
                : <Text style={d.dimText}>No action items identified.</Text>
              }
            </Section>

            {/* Full Transcript */}
            <Section color={C.blue} label="Full Transcript">
              <Text style={d.bodyText}>{transcript.transcript}</Text>
            </Section>
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const d = StyleSheet.create({
  root:    { flex: 1, backgroundColor: C.bg },
  handle:  { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  topBar:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  doneBtn: { padding: 4 },
  doneText:{ fontSize: 17, color: C.aLight },
  delBtn:  { padding: 4 },
  delText: { fontSize: 14, color: C.red },
  scroll:  { padding: 20, paddingBottom: 64 },
  title:   { fontSize: 22, fontWeight: '700', color: C.text, letterSpacing: -0.5, lineHeight: 28, marginBottom: 6 },
  meta:    { fontSize: 13, color: C.textDim },
  bodyText:{ fontSize: 14, color: C.textSec, lineHeight: 22 },
  actionRow:  { flexDirection: 'row', gap: 10, marginBottom: 9, alignItems: 'flex-start' },
  arrow:   { fontSize: 12, color: C.green, marginTop: 5, flexShrink: 0 },
  actionText: { flex: 1, fontSize: 14, color: C.textSec, lineHeight: 21 },
  dimText: { fontSize: 14, color: C.textDim, fontStyle: 'italic' },
})
