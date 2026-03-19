import test from "node:test";
import assert from "node:assert/strict";

import { buildCadenceSummary } from "../site/daily_cadence.js";

test("buildCadenceSummary uses row label for daily cadence summaries", () => {
  const rows = [
    {
      rowKey: "2026-03-19",
      label: "03-19",
      entries: [{ category: "cs.AI", total_papers: 185 }],
    },
    {
      rowKey: "2026-03-18",
      label: "03-18",
      entries: [{ category: "cs.AI", total_papers: 256 }],
    },
  ];

  assert.equal(buildCadenceSummary(rows, "cs.AI"), "03-19 has 185 papers, decreased by 71 from the previous day.");
});

test("buildCadenceSummary uses week key for weekly cadence summaries", () => {
  const rows = [
    {
      rowKey: "2026-W12",
      label: "03-17",
      entries: [{ category: "cs.AI", total_papers: 880 }],
    },
    {
      rowKey: "2026-W11",
      label: "03-10",
      entries: [{ category: "cs.AI", total_papers: 810 }],
    },
  ];

  assert.equal(buildCadenceSummary(rows, "cs.AI", "weekly"), "2026-W12 has 880 papers, increased by 70 from the previous week.");
});
