import test from "node:test";
import assert from "node:assert/strict";

import { getStaleRemoteIds } from "../site/sync_utils.js";

test("getStaleRemoteIds returns remote ids missing from local state", () => {
  const staleIds = getStaleRemoteIds(
    ["like-1", "like-3"],
    [{ like_id: "like-1" }, { like_id: "like-2" }, { like_id: "like-3" }],
    "like_id"
  );

  assert.deepEqual(staleIds, ["like-2"]);
});

test("getStaleRemoteIds trims ids and de-duplicates stale rows", () => {
  const staleIds = getStaleRemoteIds(
    ["paper-1"],
    [{ paper_id: "paper-2" }, { paper_id: " paper-2 " }, { paper_id: " " }, {}],
    "paper_id"
  );

  assert.deepEqual(staleIds, ["paper-2"]);
});

test("getStaleRemoteIds returns an empty list when local and remote match", () => {
  const staleIds = getStaleRemoteIds(
    ["paper-1", "paper-2"],
    [{ paper_id: "paper-1" }, { paper_id: "paper-2" }],
    "paper_id"
  );

  assert.deepEqual(staleIds, []);
});
