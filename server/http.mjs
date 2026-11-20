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

/** The byte range a Range header asks of a body of `size` bytes: null when there is none to honour, { start, end } (inclusive), or { unsatisfiable: true }. */
export function byteRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || !(m[1] || m[2]) || !size) return null;
  const suffix = m[1] === "";
  const start = Math.max(0, suffix ? size - Number(m[2]) : Number(m[1]));
  const end = Math.min(suffix || m[2] === "" ? size - 1 : Number(m[2]), size - 1);
  return start > end ? { unsatisfiable: true } : { start, end };
}
