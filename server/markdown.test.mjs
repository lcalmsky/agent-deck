// public/markdown.js runs in the browser; load it into a bare context with a window object.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../public/markdown.js", import.meta.url), "utf8"), ctx);
const md = ctx.window.renderMarkdown;

test("inline marks, escaping and links", () => {
  assert.equal(md("**굵게** 와 `a<b>` 와 *기울임*"), "<p><strong>굵게</strong> 와 <code>a&lt;b&gt;</code> 와 <em>기울임</em></p>");
  assert.equal(md("<script>x</script>"), "<p>&lt;script&gt;x&lt;/script&gt;</p>");
  assert.equal(md("[PR](https://github.com/x/y/pull/1) [파일](file:///Users/me/a.md)"), '<p><a href="https://github.com/x/y/pull/1" target="_blank" rel="noopener">PR</a> 파일</p>');
  assert.equal(md("**커밋 `a*b*c` 로 push**"), "<p><strong>커밋 <code>a*b*c</code> 로 push</strong></p>");
  assert.ok(!md("[x](javascript:alert(1))").includes("href"), "only http(s) links become anchors");
});

test("blocks: headings, lists, code, tables, quotes", () => {
  assert.equal(md("## 결과\n\n- 하나\n  - 둘\n- 셋"), "<h3>결과</h3><ul><li>하나<ul><li>둘</li></ul></li><li>셋</li></ul>");
  assert.equal(md("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
  assert.equal(md("```sh\nnpm *test*\n```"), "<pre><code>npm *test*</code></pre>");
  assert.equal(md("| a | b |\n|---|---|\n| 1 | **2** |"), '<div class="md-table"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td><strong>2</strong></td></tr></tbody></table></div>');
  assert.equal(md("> 인용\n\n줄1\n줄2"), "<blockquote><p>인용</p></blockquote><p>줄1<br>줄2</p>");
});
