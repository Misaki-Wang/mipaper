import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const queueSource = readFileSync(new URL("../site/queue.js", import.meta.url), "utf8");

test("queue uses a dedicated compact row renderer in list mode", () => {
  assert.match(queueSource, /onViewModeChange:\s*\(mode\)\s*=>/);
  assert.match(queueSource, /viewMode === "list" \? renderLaterPaperRow\(paper\) : renderLaterPaperCard\(paper\)/);
  assert.match(queueSource, /function renderLaterPaperRow\(paper\)/);
  assert.match(queueSource, /function renderQueueLikeAction\(likeId, workflowStatus, workflowStatusLabel\)/);
  assert.match(queueSource, /function renderWorkspacePanel\(view, options = \{\}\)/);
  assert.match(queueSource, /data-workspace-status=/);
  assert.match(queueSource, /function bindTagComposer\(\)/);
});
