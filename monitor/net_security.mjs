/**
 * Shared Backend Network Security, SSRF Protection, Streaming Body Caps & Sanitization
 * Zero external dependencies — pure Node.js 22 built-ins.
 */

import dns from 'node:dns/promises';

const CONTROL_AND_BIDI_RE = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function stripControlAndBidi(str, maxLen = 500) {
  return String(str ?? '')
    .replace(CONTROL_AND_BIDI_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

export function isPrivateOrLocalIp(ipRaw) {
  const clean = String(ipRaw || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .split('%')[0];
  if (!clean) return true;

  // IPv4 dotted quad
  const v4 = clean.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b, c, d] = [Number(v4[1]), Number(v4[2]), Number(v4[3]), Number(v4[4])];
    if (a > 255 || b > 255 || c > 255 || d > 255) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a === 169 && b === 254) return true; // Link-local & cloud IMDS
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24 & TEST-NET-1
    if (a === 192 && b === 168) return true;
    if (a === 198 && (b === 18 || b === 19)) return true; // Benchmarking 198.18.0.0/15
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // Multicast & reserved/broadcast
    return false;
  }

  // IPv6
  if (clean.includes(':')) {
    if (
      clean === '::' ||
      clean === '::1' ||
      clean === '0:0:0:0:0:0:0:0' ||
      clean === '0:0:0:0:0:0:0:1'
    ) {
      return true;
    }
    // IPv4-mapped IPv6: ::ffff:127.0.0.1 OR WHATWG normalized ::ffff:7f00:1 / ::ffff:a9fe:a9fe
    if (clean.startsWith('::ffff:')) {
      const rest = clean.slice('::ffff:'.length);
      if (/^\d+\.\d+\.\d+\.\d+$/.test(rest)) return isPrivateOrLocalIp(rest);
      const hexPair = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexPair) {
        const hi = parseInt(hexPair[1], 16);
        const lo = parseInt(hexPair[2], 16);
        const mappedV4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
        return isPrivateOrLocalIp(mappedV4);
      }
      return true;
    }
    // IPv4-compatible IPv6 ::a.b.c.d or ::xxxx:xxxx
    if (/^::\d+\.\d+\.\d+\.\d+$/.test(clean) || /^::[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(clean)) {
      return true;
    }
    // ULA fc00::/7, Link-local fe80::/10, Multicast ff00::/8, NAT64 64:ff9b::/96, Discard 100::/64, Doc 2001:db8::/32
    if (
      /^f[cd][0-9a-f]{0,2}:/.test(clean) ||
      /^fe[89ab][0-9a-f]?:/.test(clean) ||
      /^ff[0-9a-f]{0,2}:/.test(clean) ||
      clean.startsWith('64:ff9b:') ||
      clean.startsWith('100::') ||
      clean.startsWith('2001:db8:')
    ) {
      return true;
    }
    return false;
  }

  return false;
}

export function isPrivateOrLocalHost(hostnameRaw) {
  const h = String(hostnameRaw || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.+$/, '');
  if (!h) return true;
  if (
    h === 'localhost' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.home.arpa') ||
    h.endsWith('.lan')
  ) {
    return true;
  }
  // Reject raw integer / hex / octal IPv4 obfuscation forms
  if (/^(0x[0-9a-f]+|\d+|0[0-7]+)$/i.test(h)) return true;
  if (h.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) {
    return isPrivateOrLocalIp(h);
  }
  // Reject non-dotted single-label intranet hostnames
  if (!h.includes('.')) return true;
  return false;
}

export async function assertSafeOutboundUrl(rawUrl, { allowedHosts = null, checkDns = false } = {}) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || trimmed.length > 2048 || CONTROL_AND_BIDI_RE.test(trimmed)) {
    throw new Error('Invalid outbound URL');
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Malformed outbound URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`Outbound URL must use https:// (got ${parsed.protocol})`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('Outbound URL must not contain embedded credentials');
  }
  const cleanHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  if (isPrivateOrLocalHost(cleanHost)) {
    throw new Error(`Refusing private/local outbound host: ${cleanHost}`);
  }
  if (allowedHosts) {
    const set = allowedHosts instanceof Set ? allowedHosts : new Set(allowedHosts.map((x) => x.toLowerCase()));
    if (!set.has(cleanHost)) {
      throw new Error(`Outbound host not allowlisted: ${cleanHost}`);
    }
  }
  if (checkDns && !cleanHost.includes(':') && !/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanHost)) {
    const records = await dns.lookup(cleanHost, { all: true, verbatim: true });
    if (!Array.isArray(records) || !records.length) {
      throw new Error(`DNS lookup returned no addresses for ${cleanHost}`);
    }
    for (const rec of records) {
      if (isPrivateOrLocalIp(rec.address)) {
        throw new Error(`Refusing DNS-resolved private IP for ${cleanHost}`);
      }
    }
  }
  return parsed;
}

export function sanitizePublicHttpsUrl(raw, { allowedHosts = null } = {}) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048 || CONTROL_AND_BIDI_RE.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const cleanHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
    if (isPrivateOrLocalHost(cleanHost)) return null;
    if (allowedHosts) {
      const set = allowedHosts instanceof Set ? allowedHosts : new Set(allowedHosts.map((x) => x.toLowerCase()));
      if (!set.has(cleanHost)) return null;
    }
    return parsed.href.length <= 2048 ? parsed.href : null;
  } catch {
    return null;
  }
}

export async function readResponseBufferWithLimit(res, maxBytes = 2 * 1024 * 1024) {
  const cl = Number(res?.headers?.get?.('content-length'));
  if (Number.isFinite(cl) && cl > maxBytes) {
    try { await res.body?.cancel?.(); } catch { /* ignore */ }
    throw new Error(`Response exceeded max size (${maxBytes} bytes)`);
  }
  if (res?.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error(`Response stream exceeded max size (${maxBytes} bytes)`);
        }
        chunks.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* ignore */ }
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    return merged.buffer;
  }
  // Fallback for lightweight unit-test mock Response objects without ReadableStream
  if (typeof res?.arrayBuffer === 'function') {
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) {
      throw new Error(`Response buffer exceeded max size (${maxBytes} bytes)`);
    }
    return buf;
  }
  const txt = await res.text();
  const enc = new TextEncoder().encode(txt);
  if (enc.byteLength > maxBytes) {
    throw new Error(`Response text exceeded max size (${maxBytes} bytes)`);
  }
  return enc.buffer;
}

export async function readResponseTextWithLimit(res, maxBytes = 2 * 1024 * 1024) {
  if (res?.body && typeof res.body.getReader === 'function') {
    const buf = await readResponseBufferWithLimit(res, maxBytes);
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  }
  const cl = Number(res?.headers?.get?.('content-length'));
  if (Number.isFinite(cl) && cl > maxBytes) {
    throw new Error(`Response exceeded max size (${maxBytes} bytes)`);
  }
  const txt = await res.text();
  if (txt.length > maxBytes) {
    throw new Error(`Response text exceeded max size (${maxBytes} bytes)`);
  }
  return txt;
}

export async function readResponseJsonWithLimit(res, maxBytes = 1024 * 1024) {
  if (res?.body && typeof res.body.getReader === 'function') {
    const txt = await readResponseTextWithLimit(res, maxBytes);
    return JSON.parse(txt);
  }
  if (typeof res?.text === 'function') {
    const txt = await readResponseTextWithLimit(res, maxBytes);
    return JSON.parse(txt);
  }
  return res.json();
}

export async function safeFetch(
  rawUrl,
  fetchOpts = {},
  {
    timeoutMs = 12000,
    maxRedirects = 0,
    allowedHosts = null,
    fetchImpl = globalThis.fetch,
    checkDns = fetchImpl === globalThis.fetch,
  } = {}
) {
  let currentUrl = (await assertSafeOutboundUrl(rawUrl, { allowedHosts, checkDns })).href;
  let headers = { ...(fetchOpts.headers || {}) };

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchImpl(currentUrl, {
      ...fetchOpts,
      headers,
      redirect: maxRedirects === 0 ? 'error' : 'manual',
      signal: fetchOpts.signal || AbortSignal.timeout(timeoutMs),
    });

    const isRedirect = res.status >= 300 && res.status < 400;
    if (!isRedirect) return res;

    if (hop >= maxRedirects) {
      try { await res.body?.cancel?.(); } catch { /* ignore */ }
      throw new Error(`Too many redirects (${maxRedirects}) fetching ${currentUrl}`);
    }

    const loc = res.headers?.get?.('location');
    try { await res.body?.cancel?.(); } catch { /* ignore */ }
    if (!loc) {
      throw new Error(`Redirect response ${res.status} missing Location header`);
    }
    const nextUrl = new URL(loc, currentUrl).href;
    const validated = await assertSafeOutboundUrl(nextUrl, { allowedHosts, checkDns });
    // Never forward sensitive auth headers across redirects
    const cleanHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      const kl = k.toLowerCase();
      if (kl === 'authorization' || kl === 'x-goog-api-key' || kl === 'cookie') continue;
      cleanHeaders[k] = v;
    }
    headers = cleanHeaders;
    currentUrl = validated.href;
  }
  throw new Error('Unreachable redirect termination');
}

export function isSaneSpotPrice(metal, price) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return false;
  return metal === 'silver' ? n >= 5 && n <= 2000 : n >= 500 && n <= 50000;
}

export function isSaneIsoDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

export function maskNtfyServerForLogs(serverUrl) {
  const clean = String(serverUrl || '').trim().replace(/\/+$/, '').toLowerCase();
  return clean === 'https://ntfy.sh' ? 'https://ntfy.sh' : '[redacted-ntfy-server]';
}
