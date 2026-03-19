import test from "node:test";
import assert from "node:assert/strict";

import { describeSavedView, normalizeFilterState } from "../site/like_page_saved_views.js";
import { collectCustomTagCatalog } from "../site/like_page_tags.js";
import { createSnapshotFromReport, formatWeekLabel, loadSnapshotQueueData } from "../site/like_page_snapshots.js";

test("normalizeFilterState trims values and rejects invalid workflow metadata", () => {
  assert.deepEqual(
    normalizeFilterState({
      source: " papers ",
      topic: " Agents ",
      customTag: "tag-1",
      workflowStatus: "unknown",
      priorityLevel: "urgent",
      query: "  RAG  ",
      viewMode: "LIST",
    }),
    {
      source: "papers",
      topic: "Agents",
      customTag: "tag-1",
      workflowStatus: "",
      priorityLevel: "",
      query: "rag",
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
      viewMode: "card",
    },
    likes
  );

  assert.equal(description, "Papers · Deep Dive · Reading · Gallery");
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
