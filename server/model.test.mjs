import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScan, terminalsOf, bucketOf, buildKeys, accountsOf, liveWindowsOf, liveDetailOf, planOf, STALL_MS } from "./model.mjs";

const NOW = 1_800_000_000_000;
const s = (over) => ({ t: "s", sessionId: over.id ?? "x", cwd: "/Users/me/git-repo/proj", status: "idle", ...over });

test("parseScan keeps sessions and meta, skips junk lines", () => {
  const out = [JSON.stringify(s({ id: "a" })), "not json", JSON.stringify({ t: "meta", error: null }), ""].join("\n");
  const r = parseScan(out);
  assert.equal(r.sessions.length, 1);
  assert.deepEqual(r.meta, { t: "meta", error: null });
});

test("bucketOf follows the night-city rules", () => {
  assert.equal(bucketOf(s({ status: "waiting" }), NOW), "needs");
  assert.equal(bucketOf(s({ status: "busy", lastMeaningfulAt: NOW - STALL_MS - 1 }), NOW), "stalled");
  assert.equal(bucketOf(s({ status: "busy", lastMeaningfulAt: NOW - STALL_MS - 1, background: { total: 1 } }), NOW), "working");
  assert.equal(bucketOf(s({ status: "busy", lastMeaningfulAt: NOW - 1000 }), NOW), "working");
  assert.equal(bucketOf(s({ status: "shell", deadhd: { total: 3, counts: { blocked: 1 } } }), NOW), "needs");
  assert.equal(bucketOf(s({ status: "shell" }), NOW), "working");
  assert.equal(bucketOf(s({ status: "idle" }), NOW), "done");
});

test("buildKeys sorts by urgency and turns seen results idle", () => {
  const terminals = terminalsOf({ spaces: [{ id: "sp", name: "space", tabs: [{ id: "tb", name: "1", terminals: [{ terminal: "t1", pane: "p1" }, { terminal: "t2", pane: "p2" }] }] }] });
  const sessions = [
    s({ id: "work", status: "busy", lastMeaningfulAt: NOW, statusUpdatedAt: NOW - 5000, where: { terminalId: "t1" } }),
    s({ id: "old-wait", status: "waiting", statusUpdatedAt: NOW - 60_000, lastSentence: "Run it? Yes.", where: { terminalId: "t2" } }),
    s({ id: "new-wait", status: "waiting", statusUpdatedAt: NOW - 1000 }),
    s({ id: "fin", status: "idle", statusUpdatedAt: NOW - 2000, cwd: "/Users/me/git-repo/shop-CAS-101" }),
  ];
  const keys = buildKeys({ sessions, meta: null, terminals, now: NOW, seen: new Set() });
  assert.deepEqual(keys.map((k) => k.id), ["old-wait", "new-wait", "fin", "work"]);
  assert.equal(keys[0].terminal, "t2");
  assert.equal(keys[0].ask, "Run it?");
  assert.equal(keys[1].terminal, null, "a session whose terminal is not in the window has nothing to focus");
  assert.equal(keys[2].name, "CAS-101");

  const seen = new Set([keys[2].ackKey]);
  const again = buildKeys({ sessions, meta: null, terminals, now: NOW, seen });
  assert.equal(again.find((k) => k.id === "fin").status, "idle");
});

test("a session in a catch-all folder is named after its handoff", () => {
  const [k] = buildKeys({ sessions: [s({ id: "k", cwd: "/Users/me/git-repo", customTitle: "git-repo-1116-09", identity: { handoff: "Kinora — Screen Studio 같은 앱" } })], meta: null, terminals: new Map(), now: NOW, seen: new Set() });
  assert.equal(k.name, "Kinora");
  assert.equal(k.topic, "Screen Studio 같은 앱");
});

test("detail carries the conversation and facts, and drops placeholder text", () => {
  const terminals = terminalsOf({ spaces: [{ id: "sp", name: "CAS-101", tabs: [{ id: "tb", name: "1", terminals: [{ terminal: "t1", pane: "p1" }] }] }] });
  const [k] = buildKeys({
    sessions: [s({ id: "d", agent: "claude", startedAt: NOW - 3600_000, lastPrompt: "/Users/me/git-repo/x/.claude/handoff/CAS-101.md 를 먼저 읽고 이어서 해줘", lastAnswer: "null", lastSentence: "배포했어.", identity: { round: 6 }, background: { total: 2, shells: 1, agents: 1, monitors: 0 }, completed: ["a", "b"], pr: { number: 9649, url: "https://github.com/x/y/pull/9649" }, lastToolName: "Bash", lastToolAt: NOW - 1000, where: { terminalId: "t1" }, cwd: "/Users/me/git-repo/shop-CAS-101" })],
    meta: { objectives: { "CAS-101": "검색 색인 갱신" } }, terminals, now: NOW, seen: new Set(),
  });
  assert.deepEqual(k.detail, {
    agent: "Claude Code", startedAt: NOW - 3600_000, round: 6, objective: null, you: "CAS-101.md 를 먼저 읽고 이어서 해줘", agentSaid: "배포했어.", action: null,
    tool: { name: "Bash", at: NOW - 1000 }, bg: { shells: 1, agents: 1, monitors: 0 }, doneTasks: 2,
    pr: { number: 9649, url: "https://github.com/x/y/pull/9649" }, place: { space: "CAS-101", tab: "1" }, cwd: "~/git-repo/shop-CAS-101",
  });
});

test("accountsOf shows only the windows a plan has and puts the default account first", () => {
  const files = {
    default: { seven_day: { used: 84, resets_at: 999 }, fable: { used: 32, resets_at: 999 }, updated_at: 50 },
    personal: { five_hour: { used: 40, resets_at: 100 }, seven_day: { used: 74.4, resets_at: 999 } },
  };
  const out = accountsOf({ files, labels: { default: "work" }, plans: { default: "Ultra", personal: "Max 5x" }, live: {}, current: "personal", nowSec: 500 });
  assert.deepEqual(out.map((a) => [a.label, a.plan, a.current]), [["personal", "Max 5x", true], ["work", "Ultra", false]]);
  assert.deepEqual(out[0].windows.map((w) => [w.name, w.value, w.stale]), [["5시간", 40, true], ["주간", 74, false]]);
  assert.deepEqual(out[1].windows.map((w) => w.name), ["주간", "Fable 주간"], "Ultra has no 5-hour window");
});

test("live usage rows replace the caches while fresh", () => {
  const body = {
    limits: [
      { kind: "weekly_scoped", scope: { model: { display_name: "Fable" } }, percent: 22, resets_at: "2026-11-17T21:00:00Z" },
      { kind: "session", scope: null, percent: 3, resets_at: "2026-11-16T10:50:00Z" },
      { kind: "weekly_all", scope: null, percent: 77, resets_at: "2026-11-17T21:00:00Z" },
    ],
    weekly_scoped_shares: [{ used_percent_of_weekly: 11, allowance_percent_of_weekly: 50 }],
    seven_day_breakdown: { rows: [{ key: "claude_code", display_name: "Claude Code", percent: 100 }] },
    extra_usage: { is_enabled: false },
  };
  const live = { personal: { at: 1000, windows: liveWindowsOf(body), detail: liveDetailOf(body) } };
  const [a] = accountsOf({ files: { personal: {} }, labels: {}, plans: { personal: planOf({ oauthAccount: { organizationRateLimitTier: "default_claude_max_5x" } }) }, live, current: "default", nowSec: 1100 });
  assert.equal(a.plan, "Max 5x");
  assert.deepEqual(a.windows.map((w) => [w.name, w.value]), [["5시간", 3], ["주간", 77], ["Fable 주간", 22]]);
  assert.deepEqual(a.detail, { share: { used: 11, allowance: 50 }, breakdown: [{ name: "Claude Code", value: 100 }], extraUsage: false });
  const [old] = accountsOf({ files: { personal: {} }, labels: {}, plans: {}, live, current: "default", nowSec: 1000 + 16 * 60 });
  assert.equal(old.detail, null, "a live reading older than 15 minutes is dropped");
});
