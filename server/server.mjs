#!/usr/bin/env node
// Agent Deck: serves the deck page to devices on the same Wi-Fi and pushes session state every 3 s.
// A key press focuses that session's terminal in the Herdr window on this Mac.
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { byteRange, cookieValue, safeDecode } from "./http.mjs";
import { findTranscript, readLastExchange } from "./talk.mjs";
import { parseScan, terminalsOf, buildKeys, accountsOf, liveWindowsOf, liveDetailOf, planOf } from "./model.mjs";

const HOME = os.homedir();
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.AGENT_DECK_PORT ?? 8787);
const HOST = process.env.AGENT_DECK_HOST ?? "0.0.0.0";
const SCAN = process.env.AGENT_DECK_SCAN ?? path.join(HOME, ".config/herdr-app/mods/night-city-street/scan.sh");
const HERDR = process.env.AGENT_DECK_HERDR ?? path.join(HOME, ".local/bin/herdr-app");
const USAGE_DIR = path.join(HOME, ".local/state/herdr-tower/usage");
const LABELS = path.join(HOME, ".local/state/herdr-tower/labels");
const CURRENT = path.join(HOME, ".local/state/herdr-tower/current");
const CCA = process.env.AGENT_DECK_CCA ?? path.join(HOME, ".local/bin/cca");
const LIVE_MS = 5 * 60 * 1000;
const STATE_DIR = path.join(HOME, ".local/state/agent-deck");
const TOKEN_FILE = path.join(HOME, ".config/agent-deck/token");
const TICK_MS = 3000;
let HOSTNAME = os.hostname().split(".")[0];

fs.mkdirSync(STATE_DIR, { recursive: true });
fs.mkdirSync(path.dirname(TOKEN_FILE), { recursive: true });

function loadToken() {
  try {
    const t = fs.readFileSync(TOKEN_FILE, "utf8").trim();
    if (t.length >= 16) return t;
  } catch {}
  const t = crypto.randomBytes(18).toString("base64url");
  fs.writeFileSync(TOKEN_FILE, t + "\n", { mode: 0o600 });
  return t;
}
const TOKEN = loadToken();

const SEEN_FILE = path.join(STATE_DIR, "seen.json");
let seen = new Set();
try { seen = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, "utf8"))); } catch {}
const saveSeen = () => fs.writeFile(SEEN_FILE, JSON.stringify([...seen]), () => {});

function run(file, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err?.code ?? 0, stdout: String(stdout ?? ""), stderr: String(stderr ?? "") });
    });
  });
}

// ---- state ----
let scan = { sessions: [], meta: null, at: 0, error: null };
let terminals = new Map();
let accounts = [];
const live = {}; // account -> { at (s), windows, detail } from /api/oauth/usage
let plans = { at: 0, map: {} };
let state = null;
let scanning = false;

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

const configDirOf = (id) => (id === "default" ? HOME : path.join(HOME, ".claude-accounts", id));

function readUsage() {
  const files = {};
  let names = [];
  try { names = fs.readdirSync(USAGE_DIR); } catch {}
  for (const f of names) {
    const m = f.match(/^([A-Za-z0-9_-]+)(\.api)?\.json$/);
    if (!m) continue;
    const data = readJson(path.join(USAGE_DIR, f));
    if (data) files[m[1]] = { ...(files[m[1]] ?? {}), ...data };
  }
  const labels = {};
  try {
    for (const line of fs.readFileSync(LABELS, "utf8").split("\n")) {
      const [k, v] = line.split("\t");
      if (k && v) labels[k.trim()] = v.trim();
    }
  } catch {}
  // .claude.json is large; the plan changes rarely
  if (Date.now() - plans.at > 60_000) {
    const map = {};
    for (const id of Object.keys(files)) map[id] = planOf(readJson(path.join(configDirOf(id), ".claude.json")));
    plans = { at: Date.now(), map };
  }
  let current = "default";
  try { current = fs.readFileSync(CURRENT, "utf8").trim() || "default"; } catch {}
  if (!files[current]) current = "default";
  accounts = accountsOf({ files, labels, plans: plans.map, live, current, nowSec: Math.floor(Date.now() / 1000) });
}

// The usage endpoint /usage reads, with the token Claude Code keeps in the keychain for that config
// dir (the same lookup cca does). An expired token just leaves the caches in charge: refreshing it
// would spend that account's usage.
async function fetchLive(id) {
  const svc = id === "default" ? "Claude Code-credentials" : `Claude Code-credentials-${crypto.createHash("sha256").update(configDirOf(id)).digest("hex").slice(0, 8)}`;
  const r = await run("security", ["find-generic-password", "-s", svc, "-w"], 5000);
  if (!r.ok) return;
  let token;
  try { token = JSON.parse(r.stdout).claudeAiOauth.accessToken; } catch { return; }
  try {
    const res = await fetch("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return;
    const body = await res.json();
    live[id] = { at: Math.floor(Date.now() / 1000), windows: liveWindowsOf(body), detail: liveDetailOf(body) };
  } catch {}
}
async function refreshLive() {
  await Promise.all(accounts.map((a) => fetchLive(a.id)));
  readUsage();
  publish();
}

async function tick() {
  if (scanning) return;
  scanning = true;
  try {
    const [s, ls] = await Promise.all([run("sh", [SCAN]), run(HERDR, ["ls"], 8000)]);
    if (s.ok) {
      const parsed = parseScan(s.stdout);
      scan = { ...parsed, at: Date.now(), error: parsed.meta?.error ?? null };
    } else {
      scan = { ...scan, error: (s.stderr || s.stdout || `scan.sh exited ${s.code}`).trim().slice(0, 300) };
    }
    if (ls.ok) {
      try { terminals = terminalsOf(JSON.parse(ls.stdout)); } catch {}
    }
    readUsage();
    publish();
  } finally {
    scanning = false;
  }
}

function publish() {
  const now = Date.now();
  const keys = buildKeys({ sessions: scan.sessions, meta: scan.meta, terminals, now, seen });
  // forget acks of sessions that are gone
  const alive = new Set(keys.map((k) => k.ackKey));
  const kept = [...seen].filter((k) => alive.has(k));
  if (kept.length !== seen.size && scan.sessions.length) { seen = new Set(kept); saveSeen(); }
  state = { now, scannedAt: scan.at, error: scan.error, keys, accounts, host: HOSTNAME };
  const payload = `data: ${JSON.stringify(state)}\n\n`;
  for (const res of clients) res.write(payload);
}

// ---- focus ----
async function focus(terminal) {
  const key = state?.keys.find((k) => k.terminal === terminal);
  if (!key) return { ok: false, error: "unknown terminal" };
  const r = await run(HERDR, ["do", "pane.focus", JSON.stringify({ terminal })], 8000);
  if (!r.ok) return { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 300) };
  await run("open", ["-a", "Herdr"], 5000);
  if (key.status === "done") { seen.add(key.ackKey); saveSeen(); publish(); }
  return { ok: true };
}

// ---- the long-press card's full last exchange, read from the transcript on demand ----
const talkCache = new Map(); // session id -> { file, sig, value }
function claudeRoots() {
  const roots = [process.env.CLAUDE_CONFIG_DIR || path.join(HOME, ".claude")];
  try { for (const d of fs.readdirSync(path.join(HOME, ".claude-accounts"))) roots.push(path.join(HOME, ".claude-accounts", d)); } catch {}
  return roots;
}
function talkOf(id) {
  const raw = scan.sessions.find((x) => x.sessionId === id);
  if (!raw || raw.agent !== "claude") return null; // only sessions the scan reports; Codex keeps the scan's text
  const hit = talkCache.get(id);
  try {
    const file = hit?.file ?? findTranscript(claudeRoots(), raw.cwd, id);
    if (!file) return null;
    const st = fs.statSync(file);
    const sig = `${st.size}:${st.mtimeMs}`;
    if (hit?.sig === sig) return hit.value;
    const value = readLastExchange(file);
    talkCache.set(id, { file, sig, value });
    return value;
  } catch {
    talkCache.delete(id);
    return null;
  }
}

// ---- http ----
const clients = new Set();
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json", ".mp4": "video/mp4", ".webp": "image/webp" };

const safeEq = (a, b) => typeof a === "string" && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

function send(res, code, body, type = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 4096) { req.destroy(); resolve({}); } });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
    req.on("close", () => resolve({}));
  });
}

// a malformed request must not take the server down: launchd would restart it, but any device on the network could repeat it
const server = http.createServer((req, res) => {
  handle(req, res).catch(() => { if (!res.headersSent) send(res, 400, "bad request"); else res.destroy(); });
});

async function handle(req, res) {
  const url = new URL(req.url, "http://deck");
  const q = url.searchParams.get("t");
  if (q && safeEq(q, TOKEN)) {
    // trade the link token for a cookie, then drop it from the address bar
    return send(res, 302, "", "text/plain", {
      "Set-Cookie": `ad_token=${encodeURIComponent(TOKEN)}; Max-Age=31536000; Path=/; HttpOnly; SameSite=Strict`,
      Location: (() => { const p = new URLSearchParams(url.searchParams); p.delete("t"); const s = p.toString(); return "/" + url.pathname.replace(/^\/+/, "") + (s ? `?${s}` : ""); })(),
    });
  }
  if (!safeEq(cookieValue(req.headers.cookie, "ad_token"), TOKEN)) {
    return send(res, 401, "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Agent Deck</title><p style='font:16px system-ui;padding:24px'>맥 터미널에 찍힌 주소(토큰 포함)로 열어 주세요.</p>", "text/html; charset=utf-8");
  }

  if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("retry: 2000\n\n");
    if (state) res.write(`data: ${JSON.stringify(state)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => { clients.delete(res); clearInterval(ping); });
    return;
  }
  if (url.pathname === "/api/state") return send(res, 200, JSON.stringify(state), "application/json");
  // A home-screen web app keeps its own cookie jar, so its start URL carries the link token.
  // Only a device that already holds the cookie can read this.
  if (url.pathname === "/manifest.webmanifest") {
    return send(res, 200, JSON.stringify({
      name: "Agent Deck",
      short_name: "Deck",
      start_url: `/?t=${TOKEN}`,
      scope: "/",
      display: "fullscreen",
      orientation: "landscape",
      background_color: "#dedad4",
      theme_color: "#f3f1ed",
    }), "application/manifest+json");
  }
  if (url.pathname === "/api/talk") return send(res, 200, JSON.stringify(talkOf(url.searchParams.get("id"))), "application/json");
  if (url.pathname === "/api/focus" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.terminal !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.terminal)) return send(res, 400, JSON.stringify({ ok: false, error: "bad terminal" }), "application/json");
    const r = await focus(body.terminal);
    return send(res, r.ok ? 200 : 409, JSON.stringify(r), "application/json");
  }

  if (url.pathname === "/api/account" && req.method === "POST") {
    const body = await readBody(req);
    if (typeof body.account !== "string" || body.account.startsWith("-") || !accounts.some((a) => a.id === body.account)) return send(res, 400, JSON.stringify({ ok: false, error: "unknown account" }), "application/json");
    const r = await run(CCA, ["use", body.account], 5000);
    readUsage();
    publish();
    return send(res, r.ok ? 200 : 409, JSON.stringify(r.ok ? { ok: true } : { ok: false, error: (r.stderr || r.stdout).trim().slice(0, 200) }), "application/json");
  }

  // static
  const rel = url.pathname === "/" ? "index.html" : safeDecode(url.pathname)?.replace(/^\/+/, "");
  if (rel == null) return send(res, 400, "bad request");
  const file = path.resolve(PUBLIC, rel);
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 404, "not found");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "not found");
    const type = TYPES[path.extname(file)] ?? "application/octet-stream";
    // iOS Safari refuses to play a video unless the server answers byte ranges
    const range = byteRange(req.headers.range, data.length);
    if (range?.unsatisfiable) return send(res, 416, "", "text/plain", { "Content-Range": `bytes */${data.length}` });
    if (range) {
      const { start, end } = range;
      return send(res, 206, data.subarray(start, end + 1), type, {
        "Content-Range": `bytes ${start}-${end}/${data.length}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
      });
    }
    send(res, 200, data, type, { "Accept-Ranges": "bytes", "Content-Length": String(data.length) });
  });
}

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) out.push(a.address);
  }
  return out;
}

server.listen(PORT, HOST, () => {
  console.log(`agent-deck: listening on ${HOST}:${PORT}`);
  for (const ip of lanAddresses()) console.log(`  iPad: http://${ip}:${PORT}/?t=${TOKEN}`);
  console.log(`  this Mac: http://127.0.0.1:${PORT}/?t=${TOKEN}`);
});

run("scutil", ["--get", "ComputerName"], 3000).then((r) => { if (r.ok && r.stdout.trim()) HOSTNAME = r.stdout.trim(); });
tick().then(refreshLive);
setInterval(tick, TICK_MS);
setInterval(refreshLive, LIVE_MS);
