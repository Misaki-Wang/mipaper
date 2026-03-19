import test from "node:test";
import assert from "node:assert/strict";

import { escapeAttribute, escapeHtml, fetchJson, formatDateTime, formatZhTime, getErrorMessage } from "../site/ui_utils.js";

test("escapeHtml encodes reserved HTML characters", () => {
  assert.equal(escapeHtml(`<div class="x">'&</div>`), "&lt;div class=&quot;x&quot;&gt;&#39;&amp;&lt;/div&gt;");
});

test("escapeAttribute encodes backticks by default", () => {
  assert.equal(escapeAttribute('a`"b'), "a&#96;&quot;b");
});

test("formatZhTime returns placeholder for empty values", () => {
  assert.equal(formatZhTime(""), "-");
});

test("formatDateTime can suppress invalid timestamp fallback", () => {
  assert.equal(formatDateTime("not-a-date", { fallbackToOriginal: false }), "-");
});

test("getErrorMessage normalizes errors and nullish values", () => {
  assert.equal(getErrorMessage(new Error("boom")), "boom");
  assert.equal(getErrorMessage(null), "Unexpected error");
});

test("fetchJson uses default error formatter", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("missing", { status: 404 });

  try {
    await assert.rejects(fetchJson("/missing"), /Failed to load \/missing: 404/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
