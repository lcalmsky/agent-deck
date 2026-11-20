import { test } from "node:test";
import assert from "node:assert/strict";
import { byteRange, cookieValue, safeDecode } from "./http.mjs";

test("cookieValue reads the named cookie and survives malformed escapes", () => {
  assert.equal(cookieValue("a=1; ad_token=x%2By", "ad_token"), "x+y");
  assert.equal(cookieValue("ad_token=%E0%A4%A", "ad_token"), null);
  assert.equal(cookieValue(undefined, "ad_token"), null);
  assert.equal(cookieValue("bad_token=1", "ad_token"), null);
});

test("safeDecode returns null instead of throwing", () => {
  assert.equal(safeDecode("/a%20b"), "/a b");
  assert.equal(safeDecode("/%zz"), null);
});

test("byteRange answers open, closed and suffix ranges and clamps to the body", () => {
  assert.deepEqual(byteRange("bytes=0-", 100), { start: 0, end: 99 });
  assert.deepEqual(byteRange("bytes=10-19", 100), { start: 10, end: 19 });
  assert.deepEqual(byteRange("bytes=-30", 100), { start: 70, end: 99 });
  assert.deepEqual(byteRange("bytes=-500", 100), { start: 0, end: 99 });
  assert.deepEqual(byteRange("bytes=90-500", 100), { start: 90, end: 99 });
});

test("byteRange ignores what it cannot honour and flags an empty range", () => {
  assert.equal(byteRange(undefined, 100), null);
  assert.equal(byteRange("bytes=-", 100), null);
  assert.equal(byteRange("bytes=0-1,5-9", 100), null);
  assert.equal(byteRange("bytes=0-", 0), null);
  assert.deepEqual(byteRange("bytes=200-", 100), { unsatisfiable: true });
});
