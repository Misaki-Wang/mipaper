import test from "node:test";
import assert from "node:assert/strict";

import {
  validateBranchCatalogManifest,
  validateDailyManifest,
  validateMagazineManifest,
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

test("validateMagazineManifest accepts the generated magazine manifest shape", () => {
  const manifest = {
    branch_key: "magazine",
    branch_label: "Magazine",
    generated_at: "2026-04-02T00:00:00Z",
    reports_count: 1,
    default_report_path: "data/magazine/reports/issue-390/magazine-issue-390.json",
    reports: [
      {
        branch_key: "magazine",
        branch_label: "Magazine",
        data_path: "data/magazine/reports/issue-390/magazine-issue-390.json",
        slug: "issue-390",
        issue_number: 390,
        issue_title: "科技爱好者周刊（第 390 期）",
        sync_date: "2026-04-02",
        sections_count: 2,
        generated_at: "2026-04-02T00:00:00Z",
        source_url: "https://github.com/ruanyf/weekly/blob/master/docs/issue-390.md",
        cover_image_url: "https://cdn.example.com/cover.webp",
        excerpt: "同步摘要",
        headings: [],
      },
    ],
  };

  assert.equal(validateMagazineManifest(manifest), manifest);
});
