// The last exchange of a Claude Code session, read straight from its transcript: the scan keeps only
// the last paragraph (160 chars), which cuts answers off on the long-press card.
import fs from "node:fs";
import path from "node:path";

const MAX = 20000;
const CHUNK = 2 * 1024 * 1024;
const LIMIT = 24 * 1024 * 1024;

/** ~/.claude/projects/<slug>/<id>.jsonl, the same slug rule Claude Code and scan.sh use. */
export const projectSlug = (cwd) => String(cwd).replace(/[^A-Za-z0-9]/g, "-");

export function findTranscript(roots, cwd, id) {
  const name = `${id}.jsonl`;
  for (const root of roots) {
    const direct = path.join(root, "projects", projectSlug(cwd ?? ""), name);
    if (cwd && fs.existsSync(direct)) return direct;
  }
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(path.join(root, "projects")); } catch { continue; }
    for (const d of dirs) {
      const p = path.join(root, "projects", d, name);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

/** Text a user record carries, without the harness wrappers; null for tool results and injected context. */
function userText(rec) {
  if (rec?.type !== "user" || rec.isSidechain || rec.isMeta || rec.isCompactSummary) return null;
  const c = rec.message?.content;
  let t = typeof c === "string" ? c
    : Array.isArray(c) && !c.some((b) => b?.type === "tool_result") ? c.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "";
  t = t.replace(/<(system-reminder|local-command-[a-z]+|command-message|task-notification)>[\s\S]*?<\/\1>/g, "")
    .replace(/<command-name>([\s\S]*?)<\/command-name>/g, "$1 ")
    .replace(/<\/?[a-z][a-z-]*>/g, "").trim();
  return t || null;
}

/** What the person typed: background-task notifications and other machine turns start a turn but are not prompts. */
export function promptText(rec) {
  const kind = rec?.origin?.kind;
  if (kind && kind !== "human") return null;
  return userText(rec);
}

/** A record that starts a new turn: a prompt, or a machine message such as a task notification. */
const turnStart = (rec) => userText(rec) != null || (rec?.type === "user" && !rec.isSidechain && rec.origin?.kind && rec.origin.kind !== "human");

const clipEnd = (s) => (s.length > MAX ? `…${s.slice(-MAX)}` : s);
const clipStart = (s) => (s.length > MAX ? `${s.slice(0, MAX)}…` : s);

/**
 * Walks records newest first: the assistant text of the newest turn that has any, and the last thing the
 * person typed. Returns null until an answer is found.
 */
export function lastExchange(records) {
  const said = [];
  let open = true; // still inside the newest turn
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r?.isSidechain) continue;
    if (r?.type === "assistant") {
      if (!open) continue;
      const c = r.message?.content;
      const t = Array.isArray(c) ? c.filter((b) => b?.type === "text" && b.text?.trim()).map((b) => b.text.trim()).join("\n\n") : "";
      if (t) said.unshift(t);
      continue;
    }
    const you = promptText(r);
    if (you != null && said.length) return { you: clipStart(you), said: clipEnd(said.join("\n\n")) };
    // a turn with no text yet (only tools so far) shows the turn before it
    if (turnStart(r) && said.length) open = false;
  }
  return said.length ? { you: null, said: clipEnd(said.join("\n\n")) } : null;
}

/** Reads the transcript from the end in chunks until the last exchange is complete. */
export function readLastExchange(file) {
  const size = fs.statSync(file).size;
  const fd = fs.openSync(file, "r");
  try {
    for (let len = Math.min(CHUNK, size); ; len = Math.min(len * 2, size)) {
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString("utf8").split("\n");
      if (len < size) lines.shift(); // the first line is likely cut
      const records = [];
      for (const l of lines) { if (l.trim()) try { records.push(JSON.parse(l)); } catch {} }
      const ex = lastExchange(records);
      if ((ex && ex.you != null) || len >= size || len >= LIMIT) return ex;
    }
  } finally {
    fs.closeSync(fd);
  }
}
