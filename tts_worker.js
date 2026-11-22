/* Bullion Pulse — Client-Side Neural English Voice Worker (Piper VITS ONNX/WASM)
 * 100% private & local: runs on-device, caches model in browser OPFS after 1st download.
 */

const ALLOWED_VOICES = new Set([
  'en_US-lessac-medium',
  'en_US-ryan-medium',
  'en_US-amy-medium',
  'en_US-hfc_female-medium',
  'en_US-hfc_male-medium',
  'en_GB-alba-medium',
]);
const DEFAULT_VOICE = 'en_US-lessac-medium';
const MAX_TTS_TEXT_CHARS = 4000;

let piperMod = null;
let activeSession = null;
let activeVoiceId = null;

function sanitizeVoiceId(raw) {
  return typeof raw === 'string' && ALLOWED_VOICES.has(raw) ? raw : DEFAULT_VOICE;
}

function sanitizeSpeechText(raw) {
  return String(raw || '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, ' ')
    .trim()
    .slice(0, MAX_TTS_TEXT_CHARS);
}

async function loadPiper() {
  if (!piperMod) {
    piperMod = await import('https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm');
  }
  return piperMod;
}

async function getSession(voiceId, onProgress) {
  const safeVoiceId = sanitizeVoiceId(voiceId);
  const tts = await loadPiper();
  if (activeSession && activeVoiceId === safeVoiceId && activeSession.ready) {
    return activeSession;
  }
  // Reset singleton if switching to a different neural voice
  if (tts.TtsSession && activeVoiceId && activeVoiceId !== safeVoiceId) {
    tts.TtsSession._instance = null;
  }
  activeSession = await tts.TtsSession.create({
    voiceId: safeVoiceId,
    progress: (p) => {
      if (p && p.total > 0) {
        const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
        onProgress(pct);
      }
    },
  });
  activeVoiceId = safeVoiceId;
  return activeSession;
}

self.onmessage = async (event) => {
  const data = event?.data;
  if (!data || typeof data !== 'object') return;
  const { id, type, text, voiceId } = data;
  try {
    if (type === 'stored') {
      const tts = await loadPiper();
      const list = typeof tts.stored === 'function' ? await tts.stored() : [];
      const filtered = Array.isArray(list) ? list.filter((v) => ALLOWED_VOICES.has(v)) : [];
      self.postMessage({ id, type: 'stored', voices: filtered });
      return;
    }

    if (type === 'speak') {
      const targetVoice = sanitizeVoiceId(voiceId);
      const cleanText = sanitizeSpeechText(text);
      if (!cleanText) {
        self.postMessage({ id, type: 'error', message: 'Empty speech text' });
        return;
      }
      let lastPct = -1;
      const session = await getSession(targetVoice, (pct) => {
        if (pct !== lastPct && (pct % 5 === 0 || pct === 100)) {
          lastPct = pct;
          self.postMessage({ id, type: 'progress', pct });
        }
      });
      const wavBlob = await session.predict(cleanText);
      const buffer = await wavBlob.arrayBuffer();
      self.postMessage({ id, type: 'audio', buffer }, [buffer]);
    }
  } catch (err) {
    self.postMessage({
      id,
      type: 'error',
      message: err?.message || String(err || 'Neural voice synthesis failed'),
    });
  }
};
