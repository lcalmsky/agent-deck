import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieValue, safeDecode } from "./http.mjs";

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
