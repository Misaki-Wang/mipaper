import test from "node:test";
import assert from "node:assert/strict";

import {
  validateBranchCatalogManifest,
  validateDailyManifest,
  validateTrendingManifest,
} from "../site/site_contract.js";

test("validateDailyManifest accepts the generated daily manifest shape", () => {
  const manifest = {
    branch_key: "daily",
    branch_label: "Cool Daily",
    generated_at: "2026-03-20T00:00:00Z",
    reports_count: 1,
    default_report_path: "data/daily/reports/2026-03-19/cs.AI.json",
    category_order: ["cs.AI"],
    latest_by_category: [
      {
        branch_key: "daily",
        branch_label: "Cool Daily",
        data_path: "data/daily/reports/2026-03-19/cs.AI.json",
        slug: "cs.AI-2026-03-19",
        report_date: "2026-03-19",
        category: "cs.AI",
        total_papers: 12,
        classifier: "codex",
        generated_at: "2026-03-20T00:00:00Z",
        source_url: "https://example.com/daily",
        focus_topics: [],
        top_topics: [],
      },
    ],
    reports: [
      {
        branch_key: "daily",
        branch_label: "Cool Daily",
        data_path: "data/daily/reports/2026-03-19/cs.AI.json",
        slug: "cs.AI-2026-03-19",
        report_date: "2026-03-19",
        category: "cs.AI",
        total_papers: 12,
        classifier: "codex",
        generated_at: "2026-03-20T00:00:00Z",
        source_url: "https://example.com/daily",
        focus_topics: [],
        top_topics: [],
      },
    ],
  };

  assert.equal(validateDailyManifest(manifest), manifest);
});

test("validateTrendingManifest rejects missing branch metadata", () => {
  assert.throws(
    () =>
      validateTrendingManifest({
        reports_count: 0,
        default_report_path: "",
        generated_at: "2026-03-20T00:00:00Z",
        reports: [],
      }),
    /branch_key must be a string/
  );
});

test("validateBranchCatalogManifest rejects report count drift", () => {
  assert.throws(
    () =>
      validateBranchCatalogManifest({
        generated_at: "2026-03-20T00:00:00Z",
        reports_count: 2,
        branches: [],
        reports: [
          {
            branch_key: "daily",
            branch_label: "Cool Daily",
            data_path: "data/daily/reports/2026-03-19/cs.AI.json",
            search_text: "daily cool",
          },
        ],
      }),
    /reports_count mismatch/
  );
});
