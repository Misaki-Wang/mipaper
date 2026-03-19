import test from "node:test";
import assert from "node:assert/strict";

import { createLikeRecord, createLikedPaperSyncRow, hydrateLikedPaperSyncRow } from "../site/likes.js";

test("liked paper sync row keeps custom tags in Supabase payload", () => {
  const record = {
    ...createLikeRecord(
      {
        title: "Cambrian-1",
        paper_id: "2406.16860",
        authors: ["Te-Lin Wu"],
        abstract: "Vision-centric multimodal LLM exploration.",
        arxiv_url: "https://arxiv.org/abs/2406.16860",
        arxiv_pdf_url: "https://arxiv.org/pdf/2406.16860",
        papers_cool_url: "https://papers.cool/arxiv/2406.16860",
        custom_tags: [
          { key: "focus", label: "Focus", color: "#c46a6a", order: 0 },
          { key: "priority", label: "Priority", color: "#6c7fd1", order: 1 },
        ],
      },
      { sourceKind: "library", sourceLabel: "Library" }
    ),
    saved_at: "2026-03-19T10:00:00.000Z",
    updated_at: "2026-03-19T10:05:00.000Z",
    client_updated_at: "2026-03-19T10:05:00.000Z",
    deleted_at: "",
    device_id: "test-device",
    workflow_status: "reading",
    priority_level: "high",
    one_line_takeaway: "Useful multimodal baseline.",
    next_action: "Compare with Cambrian-2 notes.",
  };

  const row = createLikedPaperSyncRow("00000000-0000-4000-8000-000000000001", record);

  assert.equal(row.user_id, "00000000-0000-4000-8000-000000000001");
  assert.equal(row.like_id, record.like_id);
  assert.equal(row.payload.workflow_status, "reading");
  assert.equal(row.payload.priority_level, "high");
  assert.equal(row.payload.one_line_takeaway, "Useful multimodal baseline.");
  assert.equal(row.payload.next_action, "Compare with Cambrian-2 notes.");
  assert.deepEqual(row.payload.custom_tags, [
    { key: "focus", label: "Focus", color: "#c46a6a", order: 0 },
    { key: "priority", label: "Priority", color: "#6c7fd1", order: 1 },
  ]);
});

test("liked paper sync hydration restores custom tags from Supabase payload", () => {
  const hydrated = hydrateLikedPaperSyncRow({
    like_id: "papers-cool-arxiv-2406-16860",
    saved_at: "2026-03-19T10:00:00.000Z",
    updated_at: "2026-03-19T10:05:00.000Z",
    deleted_at: null,
    client_updated_at: "2026-03-19T10:05:00.000Z",
    device_id: "test-device",
    payload: {
      title: "Cambrian-1",
      paper_id: "2406.16860",
      workflow_status: "reading",
      priority_level: "high",
      one_line_takeaway: "Useful multimodal baseline.",
      next_action: "Compare with Cambrian-2 notes.",
      custom_tags: [
        { key: "focus", label: "Focus", color: "#c46a6a", order: 0 },
        { key: "priority", label: "Priority", color: "#6c7fd1", order: 1 },
      ],
    },
  });

  assert.equal(hydrated.like_id, "papers-cool-arxiv-2406-16860");
  assert.equal(hydrated.workflow_status, "reading");
  assert.equal(hydrated.priority_level, "high");
  assert.equal(hydrated.one_line_takeaway, "Useful multimodal baseline.");
  assert.equal(hydrated.next_action, "Compare with Cambrian-2 notes.");
  assert.deepEqual(hydrated.custom_tags, [
    { key: "focus", label: "Focus", color: "#c46a6a", order: 0 },
    { key: "priority", label: "Priority", color: "#6c7fd1", order: 1 },
  ]);
});

test("legacy later workflow status is migrated to inbox on hydration", () => {
  const hydrated = hydrateLikedPaperSyncRow({
    like_id: "papers-cool-arxiv-2501-00001",
    saved_at: "2026-03-19T10:00:00.000Z",
    updated_at: "2026-03-19T10:05:00.000Z",
    deleted_at: null,
    client_updated_at: "2026-03-19T10:05:00.000Z",
    device_id: "test-device",
    payload: {
      title: "Legacy queued paper",
      workflow_status: "later",
      priority_level: "medium",
      custom_tags: [],
    },
  });

  assert.equal(hydrated.workflow_status, "inbox");
});
