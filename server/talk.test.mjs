import { test } from "node:test";
import assert from "node:assert/strict";
import { lastExchange, promptText, projectSlug } from "./talk.mjs";

const user = (content, over = {}) => ({ type: "user", message: { role: "user", content }, ...over });
const bot = (...blocks) => ({ type: "assistant", message: { role: "assistant", content: blocks } });
const text = (t) => ({ type: "text", text: t });

test("lastExchange joins the turn's text since the last real prompt and skips tool traffic", () => {
  const recs = [
    user("old question"), bot(text("old answer")),
    user("**배포** 해줘"),
    bot({ type: "thinking", thinking: "x" }, text("먼저 확인할게.")),
    bot({ type: "tool_use", id: "t1" }),
    user([{ type: "tool_result", tool_use_id: "t1", content: "ok" }]),
    user("<system-reminder>noise</system-reminder>", { isMeta: true }),
    bot(text("## 결과\n\n- 끝났어")),
    { type: "attachment" },
  ];
  assert.deepEqual(lastExchange(recs), { you: "**배포** 해줘", said: "먼저 확인할게.\n\n## 결과\n\n- 끝났어" });
});

test("a task notification ends the turn's text but the prompt shown is the person's", () => {
  const recs = [
    user("에픽 착수해줘", { origin: { kind: "human" } }), bot(text("first turn")),
    user("<task-notification><task-id>b1</task-id></task-notification>", { origin: { kind: "task-notification" } }),
    bot(text("검토 결과 반영할게.")),
    user("<task-notification><task-id>b2</task-id></task-notification>", { origin: { kind: "task-notification" } }),
    bot({ type: "tool_use", id: "t9" }),
  ];
  assert.deepEqual(lastExchange(recs), { you: "에픽 착수해줘", said: "검토 결과 반영할게." });
});

test("lastExchange ignores sidechains and returns null before any answer", () => {
  assert.equal(lastExchange([user("hi")]), null);
  assert.deepEqual(lastExchange([user("q"), bot(text("a")), { ...bot(text("side")), isSidechain: true }]), { you: "q", said: "a" });
});

test("promptText strips harness wrappers and keeps slash commands", () => {
  assert.equal(promptText(user("<command-message>verify</command-message>\n<command-name>/verify</command-name>\n<command-args>--quick</command-args>")), "/verify \n--quick");
  assert.equal(promptText(user("<local-command-stdout>x</local-command-stdout>")), null);
  assert.equal(promptText(user([text("look"), { type: "image" }])), "look");
  assert.equal(promptText(user("This session is being continued…", { isCompactSummary: true })), null);
});

test("projectSlug matches Claude Code's folder names", () => {
  assert.equal(projectSlug("/Users/me/Library/Mobile Documents/iCloud~md~obsidian"), "-Users-me-Library-Mobile-Documents-iCloud-md-obsidian");
});
