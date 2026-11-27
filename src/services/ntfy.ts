import type { QuietHours } from '../types/bullion';
import { fetchWithTimeout, sanitizeNtfyTopic, sanitizeShortText } from '../utils/security';

export interface NtfyPublishParams {
  topic: string;
  title: string;
  message: string;
  priority?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
}

export function isInQuietHours(qh: QuietHours, now = new Date()): boolean {
  if (!qh.enabled) return false;
  const hour = now.getHours();
  if (qh.start === qh.end) return false;
  if (qh.start < qh.end) {
    return hour >= qh.start && hour < qh.end;
  }
  return hour >= qh.start || hour < qh.end;
}

export async function publishToNtfy(params: NtfyPublishParams): Promise<{ ok: boolean; error?: string }> {
  const topic = sanitizeNtfyTopic(params.topic);
  if (!topic) return { ok: false, error: 'Invalid or empty ntfy topic name.' };

  // v60 ASM hardening: send topic inside JSON POST body to root https://ntfy.sh (never expose topic in URL)
  try {
    const body = JSON.stringify({
      topic,
      title: sanitizeShortText(params.title || 'Bullion Pulse Alert', 140),
      message: sanitizeShortText(params.message || '', 500),
      priority: params.priority ?? 3,
      tags: (params.tags || ['bell']).slice(0, 6),
    });

    const res = await fetchWithTimeout(
      'https://ntfy.sh',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      7500
    );
    if (!res.ok) {
      return { ok: false, error: `ntfy.sh returned HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Network error publishing to ntfy.sh',
    };
  }
}
