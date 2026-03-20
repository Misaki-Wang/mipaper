import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const likeHtml = readFileSync(new URL("../site/like.html", import.meta.url), "utf8");
const likeSource = readFileSync(new URL("../site/like.js", import.meta.url), "utf8");

test("like page surfaces the liked paper results before secondary panels", () => {
  const resultsIndex = likeHtml.indexOf('id="like-results-section"');
  const browseIndex = likeHtml.indexOf('id="like-browse-section"');
  const savedViewsIndex = likeHtml.indexOf('id="like-saved-views-section"');

  assert.ok(resultsIndex >= 0, "expected results section");
  assert.ok(browseIndex >= 0, "expected browse section");
  assert.ok(savedViewsIndex >= 0, "expected saved views section");

  assert.ok(resultsIndex < browseIndex, "results should appear before the grouped liked cards");
  assert.ok(browseIndex < savedViewsIndex, "grouped liked cards should appear before saved views");
});

test("like page focuses on liked-paper actions instead of library-wide dashboards", () => {
  assert.doesNotMatch(likeHtml, /id="like-groups-section"/);
  assert.doesNotMatch(likeHtml, /id="like-insights-section"/);
  assert.doesNotMatch(likeHtml, /id="like-tag-map-section"/);
  assert.doesNotMatch(likeHtml, /id="like-later-section"/);
  assert.doesNotMatch(likeHtml, /id="like-to-read-section"/);
  assert.doesNotMatch(likeHtml, /id="like-floating-toc"/);
});

test("like page exposes direct links back to library home and liked content", () => {
  assert.match(likeHtml, /href="\.\/library\.html"[^>]*>Open Lib Home</);
  assert.match(likeHtml, /href="#like-results-section"[^>]*>Jump to liked papers</);
  assert.match(likeHtml, /href="#like-browse-section"[^>]*>Browse by group</);
  assert.match(likeHtml, /href="#like-saved-views-section"[^>]*>Saved views</);
});

test("like page uses show-more controls for grouped papers instead of per-group pagination", () => {
  assert.doesNotMatch(likeSource, /data-branch-page=/);
  assert.doesNotMatch(likeSource, /const branchPages = new Map/);
  assert.match(likeSource, /data-like-source-action="more"/);
  assert.match(likeSource, /data-like-source-action="less"/);
  assert.match(likeSource, /function bindSourceSectionActions\(/);
});
