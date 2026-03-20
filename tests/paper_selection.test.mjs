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
