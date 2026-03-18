import test from "node:test";
import assert from "node:assert/strict";

import {
  compareSyncTimestamps,
  getInitialSyncRecords,
  getLatestTimestamp,
  getPendingSyncRecords,
  mergeSyncRecords,
} from "../site/sync_utils.js";

test("compareSyncTimestamps orders ISO timestamps", () => {
  assert.equal(compareSyncTimestamps("2026-03-18T00:00:00.000Z", "2026-03-17T23:59:59.000Z") > 0, true);
  assert.equal(compareSyncTimestamps("", "2026-03-17T23:59:59.000Z") < 0, true);
  assert.equal(compareSyncTimestamps("", ""), 0);
});

test("getPendingSyncRecords returns only locally changed rows after cursor", () => {
  const pending = getPendingSyncRecords(
    [
      { like_id: "like-1", client_updated_at: "2026-03-17T12:00:00.000Z" },
      { like_id: "like-2", client_updated_at: "2026-03-18T12:00:00.000Z" },
    ],
    "2026-03-18T00:00:00.000Z"
  );

  assert.deepEqual(
    pending.map((item) => item.like_id),
    ["like-2"]
  );
});

test("mergeSyncRecords keeps the newest version of each record", () => {
  const merged = mergeSyncRecords(
    [
      { like_id: "like-1", updated_at: "2026-03-17T12:00:00.000Z", title: "Local older" },
      { like_id: "like-2", updated_at: "2026-03-18T08:00:00.000Z", title: "Local only" },
    ],
    [
      { like_id: "like-1", updated_at: "2026-03-18T09:00:00.000Z", title: "Remote newer" },
      { like_id: "like-3", updated_at: "2026-03-18T07:00:00.000Z", title: "Remote only" },
    ],
    "like_id"
  );

  assert.deepEqual(
    merged
      .sort((left, right) => left.like_id.localeCompare(right.like_id))
      .map((item) => [item.like_id, item.title]),
    [
      ["like-1", "Remote newer"],
      ["like-2", "Local only"],
      ["like-3", "Remote only"],
    ]
  );
});

test("getInitialSyncRecords only keeps local rows missing remotely or newer than remote", () => {
  const initialRecords = getInitialSyncRecords(
    [
      { like_id: "like-1", updated_at: "2026-03-18T08:00:00.000Z" },
      { like_id: "like-2", updated_at: "2026-03-18T10:00:00.000Z" },
      { like_id: "like-3", updated_at: "2026-03-18T09:00:00.000Z" },
    ],
    [
      { like_id: "like-1", updated_at: "2026-03-18T09:00:00.000Z" },
      { like_id: "like-2", updated_at: "2026-03-18T09:00:00.000Z" },
    ],
    "like_id"
  );

  assert.deepEqual(
    initialRecords.map((item) => item.like_id).sort(),
    ["like-2", "like-3"]
  );
});

test("getLatestTimestamp returns the newest non-empty timestamp", () => {
  const latest = getLatestTimestamp("", "2026-03-17T10:00:00.000Z", "2026-03-18T10:00:00.000Z");

  assert.equal(latest, "2026-03-18T10:00:00.000Z");
});
