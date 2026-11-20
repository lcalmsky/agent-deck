// Turns night-city scan.sh output, `herdr-app ls` and the usage cache into the deck's state.
// Bucket rules follow ~/.config/herdr-app/mods/night-city-street/model.js (bucketOf, buildItems, byUrgency).

export const STALL_MS = 10 * 60 * 1000;
const KEY_RE = /(?:^|[^A-Za-z0-9])((?:cas|imio|ieis)-\d{1,5})(?![0-9])/i;
const GENERIC = new Set(["git-repo", "workspaces", "orca", "Documents", "Desktop", "Users"]);
// "kinora-1115-03" -> "kinora": session titles carry a date and a counter the deck has no room for
const cleanTitle = (t) => String(t ?? "").replace(/-\d{4}-\d{1,3}$/, "").trim() || null;
const RANK = { needs: 0, done: 1, stalled: 2, working: 3, idle: 4 };

export function parseScan(output) {
  const sessions = [];
  let meta = null;
  for (const line of String(output ?? "").split("\n")) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch { continue; }
    if (value?.t === "s" && typeof value.sessionId === "string" && value.sessionId) sessions.push(value);
    else if (value?.t === "meta") meta = value;
  }
  return { sessions, meta };
}

/** terminal id -> { terminal, pane, space, tab, status, app } from `herdr-app ls`. */
export function terminalsOf(ls) {
  const out = new Map();
  for (const space of ls?.spaces ?? []) {
    for (const tab of space.tabs ?? []) {
      for (const t of tab.terminals ?? []) {
        if (t?.terminal) out.set(t.terminal, { ...t, space: space.name, spaceId: space.id, tab: tab.name, tabId: tab.id });
      }
    }
  }
  return out;
}

export const ticketOf = (text) => String(text ?? "").match(KEY_RE)?.[1]?.toUpperCase() ?? null;

export function firstSentence(text, max = 90) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const end = flat.search(/[.!?。](\s|$)/);
  const cut = end >= 0 && end < max ? flat.slice(0, end + 1) : flat;
  return cut.length > max ? `${cut.slice(0, max - 1).trimEnd()}…` : cut;
}

function checklistOf(raw) {
  const d = raw.deadhd;
  if (!d || d.off || !d.counts || !(d.total > 0)) return null;
  return { blocked: d.counts.blocked ?? 0, ask: d.blockedAsk ?? null };
}

export function bucketOf(raw, now) {
  if (raw.status === "waiting") return "needs";
  if (raw.status === "busy") {
    const quiet = raw.lastMeaningfulAt && now - raw.lastMeaningfulAt > STALL_MS;
    return !(raw.background?.total > 0) && quiet ? "stalled" : "working";
  }
  if (raw.status === "shell") return (checklistOf(raw)?.blocked ?? 0) > 0 ? "needs" : "working";
  if (raw.status === "idle") return "done";
  return "working";
}

function kindOf(raw) {
  const w = typeof raw.waitingFor === "string" ? raw.waitingFor : "";
  if (/permission|권한|approve/i.test(w)) return "권한 요청";
  if (checklistOf(raw)?.blocked) return "확인 요청";
  return "질문";
}

const AGENTS = { claude: "Claude Code", codex: "Codex" };
const said = (...xs) => xs.find((x) => typeof x === "string" && x.trim() && x.trim() !== "null") ?? null;
const clip = (s, max) => { const f = String(s ?? "").replace(/\s+/g, " ").trim(); return !f ? null : f.length > max ? `${f.slice(0, max - 1).trimEnd()}…` : f; };

/** What the long-press card shows: everything the scan knows about one session. Times stay in ms. */
export function detailOf(raw, term, objective, topic) {
  const bg = raw.background;
  return {
    agent: AGENTS[raw.agent] ?? raw.agent ?? null,
    startedAt: raw.startedAt ?? null,
    round: raw.identity?.round ?? null,
    objective: objective && objective !== topic ? clip(objective, 200) : null,
    // handoff prompts open with a long absolute path; the file name is enough on a card
    you: clip(said(raw.lastPrompt)?.replace(/(?:\/Users\/|~\/)\S*\/([^\s/]+)/g, "$1"), 220),
    agentSaid: clip(said(raw.lastSentence, raw.lastAnswer), 400),
    action: clip(raw.currentAction, 140),
    tool: raw.lastToolName ? { name: raw.lastToolName, at: raw.lastToolAt ?? null } : null,
    bg: bg?.total ? { shells: bg.shells ?? 0, agents: bg.agents ?? 0, monitors: bg.monitors ?? 0 } : null,
    doneTasks: Array.isArray(raw.completed) ? raw.completed.length : 0,
    pr: raw.pr?.number ? { number: raw.pr.number, url: /^https:\/\/github\.com\//.test(raw.pr.url ?? "") ? raw.pr.url : null } : null,
    place: term ? { space: term.space ?? null, tab: term.tab ?? null } : null,
    cwd: raw.cwd ? String(raw.cwd).replace(/^\/Users\/[^/]+/, "~") : null,
  };
}

/**
 * One deck key per scanned session. `seen` holds ack keys of results the person already opened,
 * so a finished session reads as "done" until it is opened from the deck, then as "idle".
 */
export function buildKeys({ sessions, meta, terminals, now, seen }) {
  const keys = [];
  for (const raw of sessions) {
    const terminalId = raw.where?.terminalId ?? null;
    const term = terminalId ? terminals.get(terminalId) : null;
    const bucket = bucketOf(raw, now);
    const since = raw.statusUpdatedAt ?? raw.startedAt ?? null;
    const ackKey = `${raw.sessionId}+${since != null ? Math.floor(since / 1000) : "none"}`;
    const status = bucket === "done" && seen.has(ackKey) ? "idle" : bucket;
    const parts = String(raw.cwd ?? "").split("/").filter(Boolean);
    const leaf = parts.at(-1) ?? null;
    const ticket = ticketOf(leaf) ?? ticketOf(parts.at(-2)) ?? ticketOf(term?.space);
    const check = checklistOf(raw);
    // a session started in a catch-all folder (~/git-repo) is named after what it works on
    const handoffHead = String(raw.identity?.handoff ?? "").split(/\s+[—(]/)[0].trim() || null;
    const title = cleanTitle(raw.customTitle);
    const name = ticket
      || (leaf && !GENERIC.has(leaf) && parts.length > 2 ? leaf : null)
      || handoffHead
      || (title && title !== leaf ? title : null)
      || term?.space || leaf || raw.sessionId.slice(0, 8);
    let topic = (ticket && meta?.objectives?.[ticket]) || raw.identity?.handoff || firstSentence(raw.identity?.firstPrompt, 60) || null;
    // "CAS-103 결제 오류 재현" under the name "CAS-103": drop the repeat
    if (topic && topic.toLowerCase().startsWith(name.toLowerCase())) topic = topic.slice(name.length).replace(/^[\s:·—-]+/, "") || null;
    keys.push({
      id: raw.sessionId,
      ackKey,
      status,
      since,
      terminal: term ? terminalId : null,
      name,
      topic,
      line: (status === "working" && raw.currentAction) || firstSentence(raw.lastSentence || raw.lastAnswer, 60) || null,
      ask: status === "needs" ? firstSentence(check?.ask || raw.lastSentence || raw.lastAnswer || raw.waitingFor || "", 120) || "" : "",
      kind: status === "needs" ? kindOf(raw) : null,
      background: raw.background?.total ?? 0,
      detail: detailOf(raw, term, ticket ? meta?.objectives?.[ticket] : null, topic),
    });
  }
  const at = (k) => k.since ?? 0;
  return keys.sort((a, b) => RANK[a.status] - RANK[b.status]
    || (a.status === "done" ? at(b) - at(a) : at(a) - at(b))
    || (a.id < b.id ? -1 : 1));
}

const TIERS = { default_claude_max_20x: "Max 20x", default_claude_max_5x: "Max 5x", default_claude_pro: "Pro" };
/** "Ultra", "Max 5x": the plan name Claude Code keeps in .claude.json, else read from the rate-limit tier. */
export function planOf(claudeJson) {
  const o = claudeJson?.oauthAccount;
  if (!o) return null;
  return o.planDisplayName || TIERS[o.organizationRateLimitTier] || (o.organizationType === "claude_max" ? "Max" : null);
}

const pct = (v) => (typeof v === "number" ? Math.round(v) : null);
const sec = (iso) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };

/** The `limits` rows of /api/oauth/usage as deck windows: only the windows the plan actually has. */
export function liveWindowsOf(body) {
  const out = [];
  for (const l of body?.limits ?? []) {
    const name = l?.kind === "session" ? "5시간" : l?.kind === "weekly_all" ? "주간"
      : l?.kind === "weekly_scoped" && l.scope?.model?.display_name ? `${l.scope.model.display_name} 주간` : null;
    if (name && typeof l.percent === "number") out.push({ name, value: pct(l.percent), resetsAt: sec(l.resets_at) });
  }
  const order = (n) => (n === "5시간" ? 0 : n === "주간" ? 1 : 2);
  return out.sort((a, b) => order(a.name) - order(b.name));
}

/** What the account card adds beyond the windows, from the same response. */
export function liveDetailOf(body) {
  const share = (body?.weekly_scoped_shares ?? [])[0];
  return {
    share: share ? { used: pct(share.used_percent_of_weekly), allowance: pct(share.allowance_percent_of_weekly) } : null,
    breakdown: (body?.seven_day_breakdown?.rows ?? []).filter((r) => typeof r.percent === "number").map((r) => ({ name: r.display_name ?? r.key, value: pct(r.percent) })),
    extraUsage: body?.extra_usage ? !!body.extra_usage.is_enabled : null,
  };
}

/**
 * One entry per account. Windows come from the live usage response when it is fresh, else from the
 * caches the status line tap writes (<account>.json: five_hour, seven_day; <account>.api.json: fable).
 * A window the plan does not have (Ultra has no 5-hour window) is simply absent from both.
 */
export function accountsOf({ files, labels, plans, live, current, nowSec }) {
  const out = [];
  for (const [id, data] of Object.entries(files)) {
    const l = live[id];
    const fresh = l && nowSec - l.at < 15 * 60;
    let windows;
    if (fresh) windows = l.windows.map((w) => ({ ...w, stale: false }));
    else {
      windows = [];
      for (const [k, name] of [["five_hour", "5시간"], ["seven_day", "주간"], ["fable", "Fable 주간"]]) {
        const w = data[k];
        if (!w || typeof w.used !== "number") continue;
        const reset = w.resets_at ?? null;
        windows.push({ name, value: pct(w.used), resetsAt: reset, stale: reset != null && reset < nowSec });
      }
    }
    out.push({
      id,
      label: labels[id] ?? id,
      plan: plans[id] ?? null,
      current: id === current,
      windows,
      updatedAt: fresh ? l.at : data.updated_at ?? data.fetched_at ?? null,
      detail: fresh ? l.detail : null,
    });
  }
  // the default account first, then by name
  return out.sort((a, b) => (b.current - a.current) || (a.id < b.id ? -1 : 1));
}
