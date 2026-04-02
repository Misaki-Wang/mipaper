import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queueSource = readFileSync(new URL("../site/queue.js", import.meta.url), "utf8");
const queueHtml = readFileSync(new URL("../site/queue.html", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("queue uses a dedicated compact row renderer in list mode", () => {
  assert.match(queueSource, /onViewModeChange:\s*\(mode\)\s*=>/);
  assert.match(queueSource, /viewMode === "list" \? renderLaterPaperRow\(paper\) : renderLaterPaperCard\(paper\)/);
  assert.match(queueSource, /function renderLaterPaperRow\(paper\)/);
  assert.match(queueSource, /function renderQueueLikeAction\(likeId, workflowStatus, workflowStatusLabel\)/);
  assert.match(queueSource, /function renderWorkspacePanel\(view, options = \{\}\)/);
  assert.match(queueSource, /data-workspace-status=/);
  assert.match(queueSource, /function bindTagComposer\(\)/);
});

test("queue uses show-more controls instead of pagination", () => {
  assert.doesNotMatch(queueHtml, /id="later-pagination"/);
  assert.match(queueHtml, /id="later-actions"/);
  assert.doesNotMatch(queueSource, /data-later-page=/);
  assert.doesNotMatch(queueSource, /const PAGE_SIZE = 6/);
  assert.match(queueSource, /createShowMoreAutoLoadController/);
  assert.match(queueSource, /data-later-action="more"/);
  assert.match(queueSource, /data-later-action="less"/);
  assert.match(queueSource, /data-show-more-auto-load="later"/);
});

test("queue lifts workspace tag editors above neighboring cards", () => {
  assert.match(stylesSource, /\.paper-workspace-panel:has\(\.custom-tag-trigger\[aria-expanded="true"\]\),/);
  assert.match(stylesSource, /\.paper-workspace-panel:has\(\.custom-tag-composer:not\(\[hidden\]\)\) \{/);
  assert.match(stylesSource, /\.page-library-queue \.spotlight-card:has\(\.custom-tag-trigger\[aria-expanded="true"\]\),/);
  assert.match(stylesSource, /\.page-library-queue \.later-paper-row:has\(\.custom-tag-composer:not\(\[hidden\]\)\) \{/);
  assert.match(stylesSource, /z-index: 35;/);
});

test("queue tag picker supports keyboard navigation with a visible active state", () => {
  assert.match(queueSource, /function moveActiveTagOption\(likeId, direction\)/);
  assert.match(queueSource, /event\.key === "ArrowDown"/);
  assert.match(queueSource, /event\.key === "ArrowUp"/);
  assert.match(queueSource, /activeOption\.click\(\);/);
  assert.match(stylesSource, /\.custom-tag-options \.custom-tag-option\.is-active \{/);
});

test("queue workspace notes use inline typora-style markdown editing", () => {
  assert.match(queueSource, /renderWorkspaceMarkdownPreviewContent/);
  assert.match(queueSource, /data-workspace-editor-toggle/);
  assert.match(queueSource, /field: "takeaway"/);
  assert.match(queueSource, /field: "next-action"/);
  assert.match(queueSource, /wrapper\.classList\.add\("is-editing"\)/);
  assert.match(queueSource, /field\.addEventListener\("blur"/);
  assert.match(queueSource, /field\.addEventListener\("input"/);
  assert.match(stylesSource, /\.paper-workspace-markdown-display \{/);
});
