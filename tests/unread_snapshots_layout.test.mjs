import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const unreadSource = readFileSync(new URL("../site/unread_snapshots.js", import.meta.url), "utf8");
const unreadHtml = readFileSync(new URL("../site/unread-snapshots.html", import.meta.url), "utf8");

test("unread snapshots uses a dedicated compact row renderer in list mode", () => {
  assert.match(unreadSource, /onViewModeChange:\s*\(mode\)\s*=>/);
  assert.match(unreadSource, /viewMode === "list" \? renderUnreadSnapshotRow\(snapshot\) : renderUnreadSnapshotCard\(snapshot\)/);
  assert.match(unreadSource, /function renderUnreadSnapshotRow\(snapshot\)/);
});

test("unread snapshots uses show-more controls instead of pagination", () => {
  assert.doesNotMatch(unreadHtml, /id="unread-pagination"/);
  assert.match(unreadHtml, /id="unread-actions"/);
  assert.doesNotMatch(unreadSource, /data-page=/);
  assert.doesNotMatch(unreadSource, /const PAGE_SIZE = 6/);
  assert.match(unreadSource, /createShowMoreAutoLoadController/);
  assert.match(unreadSource, /data-unread-action="more"/);
  assert.match(unreadSource, /data-unread-action="less"/);
  assert.match(unreadSource, /data-show-more-auto-load="unread"/);
});
