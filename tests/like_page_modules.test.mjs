import test from "node:test";
import assert from "node:assert/strict";

import { describeSavedView, normalizeFilterState } from "../site/like_page_saved_views.js";
import { getPaperArxivSortKey, sortLikes } from "../site/like_page_sorting.js";
import {
  applyCustomTagToRecord,
  collectCustomTagCatalog,
  mergeCustomTagsInRecord,
  removeCustomTagFromRecord,
  reorderCustomTagsInRecord,
  updateCustomTagDefinitionInRecord,
} from "../site/like_page_tags.js";
import { createSnapshotFromReport, formatIssueLabel, formatWeekLabel, loadSnapshotQueueData } from "../site/like_page_snapshots.js";

test("normalizeFilterState trims values and rejects invalid workflow metadata", () => {
  assert.deepEqual(
    normalizeFilterState({
      source: " papers ",
      topic: " Agents ",
      customTag: "tag-1",
      workflowStatus: "unknown",
      priorityLevel: "urgent",
      query: "  RAG  ",
      sortMode: "by-month",
      viewMode: "LIST",
    }),
    {
      source: "papers",
      topic: "Agents",
      customTag: "tag-1",
      workflowStatus: "",
      priorityLevel: "",
      query: "rag",
      sortMode: "saved_desc",
      viewMode: "list",
    }
  );
});

test("describeSavedView resolves custom tag labels from the liked paper catalog", () => {
  const likes = [
    {
      custom_tags: [
        { key: "deep-dive", label: "Deep Dive", color: "#5c8f7b", order: 1 },
      ],
    },
  ];

  const description = describeSavedView(
    {
      source: "papers",
      customTag: "deep-dive",
      workflowStatus: "reading",
      sortMode: "arxiv_desc",
      viewMode: "card",
    },
    likes
  );

  assert.equal(description, "Papers · Deep Dive · Reading · Pub Date: newest · Gallery");
});

test("getPaperArxivSortKey extracts sortable chronology from arXiv URLs", () => {
  assert.equal(
    getPaperArxivSortKey({
      abs_url: "https://arxiv.org/abs/2603.05498v2",
    }),
    "20260305498"
  );

  assert.equal(
    getPaperArxivSortKey({
      pdf_url: "https://arxiv.org/pdf/cs/0601001.pdf",
    }),
    "20060100001"
  );
});

test("sortLikes can order liked papers by arXiv identifier date", () => {
  const likes = [
    {
      title: "Older arXiv id but newer save",
      abs_url: "https://arxiv.org/abs/2501.12345",
      saved_at: "2026-03-19T12:00:00.000Z",
    },
    {
      title: "Newer arXiv id but older save",
      abs_url: "https://arxiv.org/abs/2603.10001",
      saved_at: "2026-03-18T12:00:00.000Z",
    },
    {
      title: "Missing arXiv URL",
      detail_url: "https://example.com/paper",
      saved_at: "2026-03-20T12:00:00.000Z",
    },
  ];

  assert.deepEqual(
    sortLikes(likes, "arxiv_desc").map((item) => item.title),
    ["Newer arXiv id but older save", "Older arXiv id but newer save", "Missing arXiv URL"]
  );

  assert.deepEqual(
    sortLikes(likes, "arxiv_asc").map((item) => item.title),
    ["Older arXiv id but newer save", "Newer arXiv id but older save", "Missing arXiv URL"]
  );
});

test("collectCustomTagCatalog deduplicates tags and preserves stable order", () => {
  const catalog = collectCustomTagCatalog([
    {
      custom_tags: [
        { key: "alpha", label: "Alpha", color: "#111111", order: 2 },
        { key: "beta", label: "Beta", color: "#222222", order: 0 },
      ],
    },
    {
      custom_tags: [
        { key: "alpha", label: "Alpha", color: "#333333", order: 1 },
      ],
    },
  ]);

  assert.deepEqual(
    catalog.map((item) => ({
      key: item.key,
      label: item.label,
      color: item.color,
      order: item.order,
    })),
    [
      { key: "beta", label: "Beta", color: "#222222", order: 0 },
      { key: "alpha", label: "Alpha", color: "#111111", order: 1 },
    ]
  );
});

test("applyCustomTagToRecord preserves provided order metadata", () => {
  const nextRecord = applyCustomTagToRecord(
    {
      custom_tags: [
        { key: "alpha", label: "Alpha", color: "#111111", order: 0 },
      ],
    },
    { key: "beta", label: "Beta", color: "#222222", order: 2 }
  );

  assert.deepEqual(nextRecord.custom_tags, [
    { key: "alpha", label: "Alpha", color: "#111111", order: 0 },
    { key: "beta", label: "Beta", color: "#222222", order: 2 },
  ]);
});

test("removeCustomTagFromRecord drops only the matching tag", () => {
  const nextRecord = removeCustomTagFromRecord(
    {
      custom_tags: [
        { key: "alpha", label: "Alpha", color: "#111111", order: 0 },
        { key: "beta", label: "Beta", color: "#222222", order: 1 },
      ],
    },
    "alpha"
  );

  assert.deepEqual(nextRecord.custom_tags, [
    { key: "beta", label: "Beta", color: "#222222", order: 1 },
  ]);
});

test("updateCustomTagDefinitionInRecord renames and recolors a tag in place", () => {
  const nextRecord = updateCustomTagDefinitionInRecord(
    {
      custom_tags: [
        { key: "interpretability", label: "Interpretability", color: "#a66c96", order: 0 },
      ],
    },
    "interpretability",
    { label: "Interp Lab", color: "#6c7fd1" }
  );

  assert.deepEqual(nextRecord.custom_tags, [
    { key: "interpretability", label: "Interp Lab", color: "#6c7fd1", order: 0 },
  ]);
});

test("reorderCustomTagsInRecord applies the shared palette order", () => {
  const nextRecord = reorderCustomTagsInRecord(
    {
      custom_tags: [
        { key: "coding", label: "Coding", color: "#6b8fb8", order: 0 },
        { key: "baseline", label: "Baseline", color: "#7a87c2", order: 3 },
      ],
    },
    ["baseline", "coding", "interpretability"]
  );

  assert.deepEqual(nextRecord.custom_tags, [
    { key: "baseline", label: "Baseline", color: "#7a87c2", order: 0 },
    { key: "coding", label: "Coding", color: "#6b8fb8", order: 1 },
  ]);
});

test("mergeCustomTagsInRecord replaces the source tag and avoids duplicates", () => {
  const nextRecord = mergeCustomTagsInRecord(
    {
      custom_tags: [
        { key: "baseline", label: "Baseline", color: "#7a87c2", order: 3 },
        { key: "coding", label: "Coding", color: "#6b8fb8", order: 1 },
      ],
    },
    "baseline",
    { key: "coding", label: "Coding", color: "#6b8fb8", order: 1 }
  );

  assert.deepEqual(nextRecord.custom_tags, [
    { key: "coding", label: "Coding", color: "#6b8fb8", order: 1 },
  ]);
});

test("createSnapshotFromReport builds trending snapshots with ISO week labels", () => {
  const snapshot = createSnapshotFromReport({
    data_path: "data/trending/reports/2026-03-16.json",
    snapshot_date: "2026-03-16",
    total_repositories: 12,
    top_repositories: [{ full_name: "openai/codex" }],
    source_url: "https://github.com/trending",
  });

  assert.deepEqual(snapshot, {
    review_key: "trending::data/trending/reports/2026-03-16.json",
    branch_label: "Trending",
    branch_url: "./trending.html",
    snapshot_label: "2026-W12",
    title: "Trending 2026-W12",
    summary: "12 repos · Lead openai/codex",
    source_url: "https://github.com/trending",
    sort_key: "2026-03-16-0",
  });
  assert.equal(formatWeekLabel("2026-03-16"), "2026-W12");
});

test("createSnapshotFromReport builds magazine snapshots with issue labels", () => {
  const snapshot = createSnapshotFromReport({
    data_path: "data/magazine/reports/issue-390/magazine-issue-390.json",
    issue_number: 390,
    issue_title: "科技爱好者周刊（第 390 期）",
    sections_count: 6,
    sync_date: "2026-04-04",
    source_url: "https://github.com/ruanyf/weekly/blob/master/docs/issue-390.md",
  });

  assert.deepEqual(snapshot, {
    review_key: "magazine::data/magazine/reports/issue-390/magazine-issue-390.json",
    branch_label: "Magazine",
    branch_url: "./magazine.html",
    snapshot_label: "Issue 390",
    title: "Magazine Issue 390",
    summary: "6 sections · 科技爱好者周刊（第 390 期）",
    source_url: "https://github.com/ruanyf/weekly/blob/master/docs/issue-390.md",
    sort_key: "2026-04-04-1-000390",
  });
  assert.equal(formatIssueLabel(390), "Issue 390");
});

test("loadSnapshotQueueData prefers branch catalog and appends trending snapshots", async () => {
  const responses = new Map([
    [
      "./data/branches/manifest.json",
      {
        reports: [
          {
            data_path: "data/daily/reports/2026-03-19/cs.AI.json",
            report_date: "2026-03-19",
            category: "cs.AI",
            total_papers: 5,
            top_topics: [{ topic_label: "多模态代理" }],
            source_url: "https://example.com/daily",
          },
        ],
      },
    ],
    [
      "./data/trending/manifest.json",
      {
        reports: [
          {
            data_path: "data/trending/reports/2026-03-16.json",
            snapshot_date: "2026-03-16",
            total_repositories: 8,
            top_repositories: [{ full_name: "openai/codex" }],
            source_url: "https://example.com/trending",
          },
        ],
      },
    ],
  ]);

  const snapshots = await loadSnapshotQueueData(async (url) => {
    if (!responses.has(url)) {
      throw new Error(`Unexpected fetch: ${url}`);
    }
    return responses.get(url);
  });

  assert.deepEqual(
    snapshots.map((snapshot) => ({
      title: snapshot.title,
      summary: snapshot.summary,
      sort_key: snapshot.sort_key,
    })),
    [
      {
        title: "Cool Daily 2026-03-19 · cs.AI",
        summary: "5 papers · Top topic Multimodal Agents",
        sort_key: "2026-03-19-2-cs.AI",
      },
      {
        title: "Trending 2026-W12",
        summary: "8 repos · Lead openai/codex",
        sort_key: "2026-03-16-0",
      },
    ]
  );
});
