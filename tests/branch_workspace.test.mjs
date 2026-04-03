import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { renderBranchWorkspacePanel } from "../site/branch_workspace.js";

const helperSource = readFileSync(new URL("../site/branch_workspace.js", import.meta.url), "utf8");
const dailySource = readFileSync(new URL("../site/app.js", import.meta.url), "utf8");
const hfSource = readFileSync(new URL("../site/hf_daily.js", import.meta.url), "utf8");
const conferenceSource = readFileSync(new URL("../site/conference.js", import.meta.url), "utf8");
const trendingSource = readFileSync(new URL("../site/trending.js", import.meta.url), "utf8");
const branchPageSource = readFileSync(new URL("../site/branch_page.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("branch workspace helper exposes a tracked panel and an empty-state starter", () => {
  assert.match(helperSource, /export function createBranchWorkspaceLookup/);
  assert.match(helperSource, /export function initBranchWorkspace/);
  assert.match(helperSource, /export function renderBranchWorkspacePanel/);
  assert.match(helperSource, /export function bindBranchWorkspace/);
  assert.match(helperSource, /Start in Later/);
  assert.match(helperSource, /Save as Like/);
  assert.match(helperSource, /data-branch-workspace-start=/);
  assert.match(helperSource, /pendingWorkspaceEditorActivations/);
});

test("renderBranchWorkspacePanel falls back to a lightweight starter for unsaved items", () => {
  const markup = renderBranchWorkspacePanel("paper-1", {
    get() {
      return { sourceKind: "", record: null };
    },
  });

  assert.match(markup, /Workspace/);
  assert.match(markup, /Not saved/);
  assert.match(markup, /Start in Later/);
  assert.match(markup, /Save as Like/);
});

test("all branch pages render and bind the shared workspace panel", () => {
  [dailySource, hfSource, conferenceSource, trendingSource].forEach((source) => {
    assert.match(source, /createBranchWorkspaceLookup/);
    assert.match(source, /renderBranchWorkspacePanel/);
    assert.match(source, /bindBranchWorkspace\(document, \{ recordLookup: likeRecords \}\)/);
    assert.match(source, /onLibraryStateChange:/);
  });
});

test("branch page bootstrap can schedule a render refresh after library state changes", () => {
  assert.match(branchPageSource, /onLibraryStateChange/);
  assert.match(branchPageSource, /scheduleLibraryStateChange/);
  assert.match(branchPageSource, /subscribeLikes\(\(\) => \{/);
  assert.match(branchPageSource, /subscribeQueue\(\(\) => \{/);
});

test("styles keep the branch workspace panel stable in list and card layouts", () => {
  assert.match(stylesSource, /\.branch-workspace-panel \.paper-workspace-header \{/);
  assert.match(stylesSource, /\.branch-workspace-empty-actions \{/);
  assert.match(stylesSource, /\.workspace-origin-liked \{/);
  assert.match(stylesSource, /\.workspace-origin-later \{/);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-cool-daily \.paper-card \.paper-workspace-panel,/);
});
