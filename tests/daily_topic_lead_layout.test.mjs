import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dailySource = readFileSync(new URL("../site/app.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("daily topic lead markup uses the same card skeleton as other papers", () => {
  assert.match(dailySource, /function buildTopicLeadMarkup\(paper, topic, workspaceLookup\) \{/);
  assert.match(dailySource, /<div class="paper-card-top">/);
  assert.match(dailySource, /<div class="paper-links">/);
  assert.doesNotMatch(dailySource, /<div class="topic-lead-main">/);
  assert.doesNotMatch(dailySource, /<div class="topic-lead-side">/);
  assert.doesNotMatch(dailySource, /<span class="lead-badge">/);
});

test("daily topic lead card no longer relies on dedicated side-column layout", () => {
  assert.doesNotMatch(stylesSource, /:root\[data-page-view-mode="list"\] \.topic-lead-side,/);
  assert.doesNotMatch(stylesSource, /:root\[data-page-view-mode="list"\] \.page-cool-daily \.topic-lead-side \{/);
  assert.doesNotMatch(stylesSource, /\.topic-lead-side \.paper-links \{/);
});
