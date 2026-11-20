import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseScan, terminalsOf, buildKeys } from "./model.mjs";

const DEMO = path.join(import.meta.dirname, "../scripts/demo");

test("the demo scan and the demo Herdr CLI give a deck where every key can be pressed", () => {
  const { sessions, meta } = parseScan(execFileSync("sh", [path.join(DEMO, "scan.sh")], { encoding: "utf8" }));
  const terminals = terminalsOf(JSON.parse(execFileSync("sh", [path.join(DEMO, "herdr-app"), "ls"], { encoding: "utf8" })));
  assert.equal(meta?.error, null);
  const keys = buildKeys({ sessions, meta, terminals, now: Date.now(), seen: new Set() });
  assert.equal(keys.length, 7);
  assert.ok(keys.every((k) => k.terminal), "every demo session maps to a demo terminal");
  assert.deepEqual([...new Set(keys.map((k) => k.status))].sort(), ["done", "needs", "stalled", "working"]);
  assert.equal(execFileSync("sh", [path.join(DEMO, "herdr-app"), "do", "pane.focus", "{}"], { encoding: "utf8" }).trim(), "ok");
});

test("the demo runner points every Mac-specific input at the throwaway HOME or a stand-in", () => {
  const run = fs.readFileSync(path.join(DEMO, "run.sh"), "utf8");
  for (const v of ['HOME="$HOME_DIR"', 'CLAUDE_CONFIG_DIR="$HOME_DIR/.claude"', 'PATH="$DIR/bin:$PATH"', 'AGENT_DECK_SCAN="$DIR/scan.sh"', 'AGENT_DECK_HERDR="$DIR/herdr-app"', "AGENT_DECK_HOST=127.0.0.1"]) {
    assert.ok(run.includes(v), v);
  }
  for (const stub of ["open", "security", "scutil"]) assert.ok(fs.existsSync(path.join(DEMO, "bin", stub)), stub);
});
