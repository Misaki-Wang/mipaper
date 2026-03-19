import test from "node:test";
import assert from "node:assert/strict";

import { createLatestTaskRunner } from "../site/request_gate.js";

test("createLatestTaskRunner ignores stale completions", async () => {
  const runLatest = createLatestTaskRunner();
  let resolveFirst;
  let resolveSecond;

  const first = runLatest(
    () =>
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
  );
  const second = runLatest(
    () =>
      new Promise((resolve) => {
        resolveSecond = resolve;
      })
  );

  resolveFirst("first");
  resolveSecond("second");

  assert.deepEqual(await first, { stale: true });
  assert.deepEqual(await second, { stale: false, value: "second" });
});

test("createLatestTaskRunner suppresses stale failures", async () => {
  const runLatest = createLatestTaskRunner();
  let rejectFirst;
  let resolveSecond;

  const first = runLatest(
    () =>
      new Promise((_, reject) => {
        rejectFirst = reject;
      })
  );
  const second = runLatest(
    () =>
      new Promise((resolve) => {
        resolveSecond = resolve;
      })
  );

  rejectFirst(new Error("stale request failed"));
  resolveSecond("second");

  assert.deepEqual(await first, { stale: true });
  assert.deepEqual(await second, { stale: false, value: "second" });
});
