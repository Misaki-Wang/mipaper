import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const likeHtml = readFileSync(new URL("../site/like.html", import.meta.url), "utf8");
const likeSource = readFileSync(new URL("../site/like.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("like page surfaces the liked paper results before saved views and grouped browse panels", () => {
  const resultsIndex = likeHtml.indexOf('id="like-results-section"');
  const browseIndex = likeHtml.indexOf('id="like-browse-section"');
  const savedViewsIndex = likeHtml.indexOf('id="like-saved-views-section"');

  assert.ok(resultsIndex >= 0, "expected results section");
  assert.ok(browseIndex >= 0, "expected browse section");
  assert.ok(savedViewsIndex >= 0, "expected saved views section");

  assert.ok(resultsIndex < savedViewsIndex, "results should appear before saved views");
  assert.ok(savedViewsIndex < browseIndex, "saved views should appear before the grouped liked cards");
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

test("like page exposes a sort control for Pub Date ordering", () => {
  assert.match(likeHtml, /id="like-sort-filter"/);
  assert.match(likeHtml, /value="arxiv_desc"[^>]*>Pub Date: newest</);
  assert.match(likeHtml, /value="arxiv_asc"[^>]*>Pub Date: oldest</);
  assert.match(likeSource, /state\.sortMode/);
  assert.match(likeSource, /sortLikes\(readLikes\(\), state\.sortMode\)/);
});

test("like page uses show-more controls for grouped papers instead of per-group pagination", () => {
  assert.doesNotMatch(likeSource, /data-branch-page=/);
  assert.doesNotMatch(likeSource, /const branchPages = new Map/);
  assert.match(likeSource, /createShowMoreAutoLoadController/);
  assert.match(likeSource, /data-like-source-action="more"/);
  assert.match(likeSource, /data-like-source-action="less"/);
  assert.match(likeSource, /function bindSourceSectionActions\(/);
  assert.match(likeSource, /data-show-more-auto-load="\$\{escapeAttribute\(key\)\}"/);
  assert.doesNotMatch(likeSource, /data-later-page=/);
  assert.doesNotMatch(likeSource, /data-to-read-page=/);
  assert.doesNotMatch(likeSource, /const LATER_PAGE_SIZE = 6/);
  assert.doesNotMatch(likeSource, /const TO_READ_PAGE_SIZE = 6/);
  assert.match(likeSource, /data-like-later-action="more"/);
  assert.match(likeSource, /data-like-to-read-action="more"/);
});

test("like list rows do not reuse abstract text as the summary note fallback", () => {
  assert.match(likeSource, /const takeawayText = view\.takeaway \|\| "";/);
  assert.match(likeSource, /const summaryText = takeawayText \|\| \(rowOpen \? view\.nextAction \|\| "" : ""\);/);
  assert.doesNotMatch(likeSource, /view\.takeaway \|\| view\.nextAction \|\| view\.paper\.abstract/);
});

test("compact like rows clamp summary notes to two lines", () => {
  assert.match(stylesSource, /\.liked-paper-row\.is-compact \.liked-paper-row-summary \{/);
  assert.match(stylesSource, /-webkit-line-clamp: 2;/);
  assert.match(stylesSource, /overflow: hidden;/);
});

test("liked papers summary uses compact chips instead of large dashboard cards", () => {
  assert.match(likeSource, /class="like-results-pill"/);
  assert.match(stylesSource, /\.like-results-pill \{/);
  assert.match(stylesSource, /\.page-like #like-results-section \.results-stats,/);
  assert.match(likeSource, /resetFiltersButton\.hidden = !activeFilters\.length;/);
  assert.doesNotMatch(likeSource, /No filters applied\. You are looking at the full liked set\./);
});

test("saved views section provides quick filters without duplicating group and topic controls", () => {
  assert.match(likeHtml, /id="like-inline-search-filter"/);
  assert.match(likeHtml, /id="like-inline-custom-tag-filter"/);
  assert.match(likeHtml, /id="like-inline-status-filter"/);
  assert.match(likeHtml, /id="like-inline-priority-filter"/);
  assert.match(likeHtml, /id="like-inline-sort-filter"/);
  assert.match(likeHtml, /id="like-inline-reset-filters"/);
  assert.doesNotMatch(likeHtml, /id="like-inline-source-filter"/);
  assert.doesNotMatch(likeHtml, /id="like-inline-topic-filter"/);
  assert.match(likeSource, /function clearQuickFilters\(\)/);
  assert.match(stylesSource, /\.saved-view-filter-grid \{/);
  assert.match(stylesSource, /\.saved-view-chip-state \{/);
});

test("like tag picker supports keyboard navigation and an active option state", () => {
  assert.match(likeSource, /function moveActiveTagOption\(likeId, direction\)/);
  assert.match(likeSource, /event\.key === "ArrowDown"/);
  assert.match(likeSource, /event\.key === "ArrowUp"/);
  assert.match(likeSource, /activeOption\.click\(\);/);
  assert.match(stylesSource, /\.custom-tag-options \.custom-tag-option\.is-active \{/);
});
