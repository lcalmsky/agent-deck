// Request parsing that must not throw on what an unauthenticated device sends.

/** decodeURIComponent that returns null on a malformed escape instead of throwing. */
export function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return null; }
}

/** The named cookie's value, or null when it is missing or malformed. */
export function cookieValue(header, name) {
  const m = String(header ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? safeDecode(m[1]) : null;
}
