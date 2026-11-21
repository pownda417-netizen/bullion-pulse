/* Bullion Pulse — Client-Side Neural English Voice Worker (Piper VITS ONNX/WASM)
 * 100% private & local: runs on-device, caches model in browser OPFS after 1st download.
 */

let piperMod = null;
let activeSession = null;
let activeVoiceId = null;

async function loadPiper() {
  if (!piperMod) {
    piperMod = await import('https://cdn.jsdelivr.net/npm/@mintplex-labs/piper-tts-web@1.0.4/+esm');
  }
  return piperMod;
}

async function getSession(voiceId, onProgress) {
  const tts = await loadPiper();
  if (activeSession && activeVoiceId === voiceId && activeSession.ready) {
    return activeSession;
  }
  // Reset singleton if switching to a different neural voice
  if (tts.TtsSession && activeVoiceId && activeVoiceId !== voiceId) {
    tts.TtsSession._instance = null;
  }
  activeSession = await tts.TtsSession.create({
    voiceId,
    progress: (p) => {
      if (p && p.total > 0) {
        const pct = Math.min(100, Math.round((p.loaded / p.total) * 100));
        onProgress(pct);
      }
    },
  });
  activeVoiceId = voiceId;
  return activeSession;
}

self.onmessage = async (event) => {
  const { id, type, text, voiceId } = event.data || {};
  try {
    if (type === 'stored') {
      const tts = await loadPiper();
      const list = typeof tts.stored === 'function' ? await tts.stored() : [];
      self.postMessage({ id, type: 'stored', voices: Array.isArray(list) ? list : [] });
      return;
    }

    if (type === 'speak') {
      const targetVoice = voiceId || 'en_US-lessac-medium';
      let lastPct = -1;
      const session = await getSession(targetVoice, (pct) => {
        if (pct !== lastPct && (pct % 5 === 0 || pct === 100)) {
          lastPct = pct;
          self.postMessage({ id, type: 'progress', pct });
        }
      });
      const wavBlob = await session.predict(String(text || ''));
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
