import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const unreadSource = readFileSync(new URL("../site/unread_snapshots.js", import.meta.url), "utf8");

test("unread snapshots uses a dedicated compact row renderer in list mode", () => {
  assert.match(unreadSource, /onViewModeChange:\s*\(mode\)\s*=>/);
  assert.match(unreadSource, /viewMode === "list" \? renderUnreadSnapshotRow\(snapshot\) : renderUnreadSnapshotCard\(snapshot\)/);
  assert.match(unreadSource, /function renderUnreadSnapshotRow\(snapshot\)/);
});
