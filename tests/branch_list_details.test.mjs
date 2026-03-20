import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderBranchListDetails } from "../site/branch_details.js";

const helperSource = readFileSync(new URL("../site/branch_details.js", import.meta.url), "utf8");
const dailySource = readFileSync(new URL("../site/app.js", import.meta.url), "utf8");
const hfSource = readFileSync(new URL("../site/hf_daily.js", import.meta.url), "utf8");
const conferenceSource = readFileSync(new URL("../site/conference.js", import.meta.url), "utf8");
const trendingSource = readFileSync(new URL("../site/trending.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("branch list details helper exposes reusable compact detail renderers", () => {
  assert.match(helperSource, /export function renderBranchListDetails/);
  assert.match(helperSource, /export function renderBranchDetailSection/);
  assert.match(helperSource, /export function renderBranchDetailGroup/);
  assert.match(helperSource, /export function bindBranchListDetails/);
  assert.match(helperSource, /data-branch-card-details=/);
  assert.match(helperSource, /data-branch-card-details-body/);
  assert.match(helperSource, /collapsible = false/);
  assert.match(helperSource, /branch-card-detail-disclosure/);
});

test("renderBranchListDetails respects the global detail panel default mode", () => {
  const previousStorage = globalThis.localStorage;
  const storage = createStorageMock();
  globalThis.localStorage = storage;

  storage.setItem("cool-paper-detail-panel-default-mode", "expanded");
  const expandedMarkup = renderBranchListDetails("<p>Expanded</p>");
  assert.match(expandedMarkup, /\sopen/);
  assert.doesNotMatch(expandedMarkup, /data-branch-card-details-body hidden/);

  storage.setItem("cool-paper-detail-panel-default-mode", "collapsed");
  const collapsedMarkup = renderBranchListDetails("<p>Collapsed</p>");
  assert.doesNotMatch(collapsedMarkup, /\sopen/);
  assert.match(collapsedMarkup, /data-branch-card-details-body hidden/);

  if (previousStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = previousStorage;
  }
});

test("all branch pages add a collapsible details panel for list and gallery views", () => {
  assert.match(dailySource, /renderBranchListDetails/);
  assert.match(dailySource, /branch-card-inline-details/);
  assert.match(dailySource, /label: "Abstract", body: escapeHtml\(abstract\), muted: true, collapsible: true/);

  assert.match(hfSource, /renderBranchListDetails/);
  assert.match(hfSource, /branch-card-inline-details/);
  assert.match(hfSource, /label: "Abstract", body: escapeHtml\(paper\.abstract\), muted: true, collapsible: true/);

  assert.match(conferenceSource, /renderBranchListDetails/);
  assert.match(conferenceSource, /branch-card-inline-details/);
  assert.match(conferenceSource, /label: "Abstract", body: escapeHtml\(paper\.abstract\), muted: true, collapsible: true/);

  assert.match(trendingSource, /renderBranchListDetails/);
  assert.match(trendingSource, /branch-card-inline-details/);
});

test("styles use the same details toggle in list and gallery modes", () => {
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.branch-card-inline-details \{\s*\n  display: none;/m);
  assert.match(stylesSource, /:root:not\(\[data-page-view-mode="list"\]\) \.branch-card-inline-details \{\s*\n  display: none;/m);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.branch-card-details-shell \{\s*\n  display: contents;/m);
  assert.match(
    stylesSource,
    /:root:not\(\[data-page-view-mode="list"\]\) \.branch-card-details-shell \{\s*\n  display: grid;\s*\n  gap: 0\.56rem;\s*\n  justify-items: end;/m
  );
  assert.match(
    stylesSource,
    /:root\[data-page-view-mode="list"\] \.branch-card-details \{\s*\n  display: flex;\s*\n  grid-column: 2;\s*\n  grid-row: 2;\s*\n  justify-content: flex-end;/m
  );
  assert.match(
    stylesSource,
    /:root:not\(\[data-page-view-mode="list"\]\) \.branch-card-details \{\s*\n  justify-content: flex-end;\s*\n  width: 100%;/m
  );
  assert.match(
    stylesSource,
    /:root:not\(\[data-page-view-mode="list"\]\) \.branch-card-details-body \{\s*\n  width: 100%;/m
  );
  assert.match(
    stylesSource,
    /\.branch-card-details summary \{\s*\n  display: inline-flex;\s*\n  align-items: center;\s*\n  justify-content: center;/m
  );
  assert.match(stylesSource, /\.branch-card-detail-disclosure summary \{\s*\n  display: flex;\s*\n  align-items: center;\s*\n  justify-content: space-between;/m);
  assert.match(stylesSource, /\.branch-card-detail-disclosure\[open\] \.branch-card-details-arrow \{\s*\n  transform: rotate\(180deg\);/m);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.branch-card-details-body \{\s*\n  grid-column: 1 \/ -1;/m);
});

function createStorageMock() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
  };
}
