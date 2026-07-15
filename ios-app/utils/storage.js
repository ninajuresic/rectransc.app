import AsyncStorage from "@react-native-async-storage/async-storage";

const TRANSCRIPTS_KEY = "rectransc_transcripts";
const GROQ_KEY = "rectransc_groq_key";

export async function loadTranscripts() {
  try {
    const raw = await AsyncStorage.getItem(TRANSCRIPTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveTranscripts(list) {
  await AsyncStorage.setItem(TRANSCRIPTS_KEY, JSON.stringify(list));
}

export async function getApiKey() {
  return AsyncStorage.getItem(GROQ_KEY);
}
export async function saveApiKey(key) {
  return AsyncStorage.setItem(GROQ_KEY, key);
}

export async function hasKey() {
  const k = await AsyncStorage.getItem(GROQ_KEY);
  return !!k;
}
