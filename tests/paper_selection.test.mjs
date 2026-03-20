import test from "node:test";
import assert from "node:assert/strict";

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}

test("moving a Later paper into Likes preserves the chosen workflow status", async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalCustomEvent = globalThis.CustomEvent;

  const mockWindow = new EventTarget();

  class MockCustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  }

  globalThis.window = mockWindow;
  globalThis.localStorage = new MemoryStorage();
  globalThis.CustomEvent = MockCustomEvent;

  try {
    const [queueModule, likesModule, paperSelectionModule] = await Promise.all([
      import("../site/paper_queue.js"),
      import("../site/likes.js"),
      import("../site/paper_selection.js"),
    ]);

    queueModule.addToQueue(
      {
        title: "Queued paper",
        paper_id: "2603.12345",
        authors: ["A. Researcher"],
        abstract: "Paper saved for later reading.",
        arxiv_url: "https://arxiv.org/abs/2603.12345",
        arxiv_pdf_url: "https://arxiv.org/pdf/2603.12345",
      },
      {
        sourceKind: "daily",
        sourceLabel: "Cool Daily",
      }
    );

    const queuedPaper = queueModule.readQueue("later")[0];
    assert.equal(queuedPaper.workflow_status, "inbox");

    paperSelectionModule.movePaperToLikes({
      ...queuedPaper,
      workflow_status: "reading",
    });

    const likedPaper = likesModule.readLikes()[0];
    assert.equal(likedPaper.workflow_status, "reading");
    assert.equal(queueModule.readQueue("later").length, 0);
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
    globalThis.CustomEvent = originalCustomEvent;
  }
});

test("updating a Later paper preserves workspace metadata before moving to Likes", async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalCustomEvent = globalThis.CustomEvent;

  const mockWindow = new EventTarget();

  class MockCustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  }

  globalThis.window = mockWindow;
  globalThis.localStorage = new MemoryStorage();
  globalThis.CustomEvent = MockCustomEvent;

  try {
    const [queueModule, likesModule, paperSelectionModule] = await Promise.all([
      import("../site/paper_queue.js?queue-workspace"),
      import("../site/likes.js?queue-workspace"),
      import("../site/paper_selection.js?queue-workspace"),
    ]);

    queueModule.addToQueue(
      {
        title: "Workspace queue paper",
        paper_id: "2603.54321",
        authors: ["B. Researcher"],
        abstract: "Paper saved for queue workspace editing.",
        arxiv_url: "https://arxiv.org/abs/2603.54321",
        arxiv_pdf_url: "https://arxiv.org/pdf/2603.54321",
      },
      {
        sourceKind: "daily",
        sourceLabel: "Cool Daily",
      }
    );

    const queuedPaper = queueModule.readQueue("later")[0];
    const updatedPaper = queueModule.updateQueuedPaper(queuedPaper.like_id, (record) => ({
      ...record,
      workflow_status: "digesting",
      priority_level: "high",
      one_line_takeaway: "Queue workspace note",
      next_action: "Promote after review",
      custom_tags: [{ key: "queue-test", label: "Queue Test", color: "#5c8f7b", order: 0 }],
    }));

    assert.equal(updatedPaper?.workflow_status, "digesting");
    assert.equal(updatedPaper?.priority_level, "high");
    assert.equal(updatedPaper?.custom_tags?.[0]?.label, "Queue Test");

    paperSelectionModule.movePaperToLikes(updatedPaper);

    const likedPaper = likesModule.readLikes()[0];
    assert.equal(likedPaper.workflow_status, "digesting");
    assert.equal(likedPaper.priority_level, "high");
    assert.equal(likedPaper.one_line_takeaway, "Queue workspace note");
    assert.equal(likedPaper.next_action, "Promote after review");
    assert.deepEqual(
      (likedPaper.custom_tags || []).map((tag) => tag.label),
      ["Queue Test"]
    );
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
    globalThis.CustomEvent = originalCustomEvent;
  }
});
