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

test("manual library cases can be seeded and cleared", async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalCrypto = globalThis.crypto;

  const mockWindow = new EventTarget();
  mockWindow.location = { search: "" };

  class MockCustomEvent extends Event {
    constructor(type, options = {}) {
      super(type);
      this.detail = options.detail;
    }
  }

  globalThis.window = mockWindow;
  globalThis.localStorage = new MemoryStorage();
  globalThis.CustomEvent = MockCustomEvent;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { randomUUID: () => "test-device-id" },
  });

  try {
    const [{ seedManualLibraryCases, clearManualLibraryCases }, likesModule, queueModule] = await Promise.all([
      import("../site/manual_test_cases.js"),
      import("../site/likes.js"),
      import("../site/paper_queue.js"),
    ]);

    const seeded = seedManualLibraryCases();
    assert.equal(seeded.seeded_like_cases, 4);
    assert.equal(seeded.seeded_later_cases, 4);
    assert.equal(likesModule.readLikes().length, 4);
    assert.equal(queueModule.readQueue("later").length, 4);
    assert.match(likesModule.readLikes()[0].title, /One-Eval|UTGen|VisualScratchpad|Cambrian-1/);

    const cleared = clearManualLibraryCases();
    assert.equal(cleared.seeded_like_cases, 0);
    assert.equal(cleared.seeded_later_cases, 0);
    assert.equal(likesModule.readLikes().length, 0);
    assert.equal(queueModule.readQueue("later").length, 0);
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
    globalThis.CustomEvent = originalCustomEvent;
    if (originalCrypto === undefined) {
      delete globalThis.crypto;
    } else {
      Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        value: originalCrypto,
      });
    }
  }
});

test("manual library cases are enabled by default for local testing without overwriting edits", async () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const originalCustomEvent = globalThis.CustomEvent;

  const mockWindow = new EventTarget();
  mockWindow.location = {
    search: "",
    hostname: "localhost",
    protocol: "http:",
  };

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
    const [{ installManualLibraryTestCases }, likesModule] = await Promise.all([
      import("../site/manual_test_cases.js?auto-seed"),
      import("../site/likes.js?auto-seed"),
    ]);

    installManualLibraryTestCases();
    assert.equal(likesModule.readLikes().length, 4);

    const storedLikes = JSON.parse(globalThis.localStorage.getItem("cool-paper-liked-papers-v1") || "[]");
    const editedLike = storedLikes.find((item) => item.title === "Cambrian-1: A Fully Open, Vision-Centric Exploration of Multimodal LLMs");
    editedLike.one_line_takeaway = "local edit survives";
    editedLike.abstract = "stale abstract";
    globalThis.localStorage.setItem("cool-paper-liked-papers-v1", JSON.stringify(storedLikes));

    installManualLibraryTestCases();
    const nextLikes = likesModule.readLikes();
    assert.equal(nextLikes.length, 4);
    const refreshedLike = nextLikes.find((item) => item.title === "Cambrian-1: A Fully Open, Vision-Centric Exploration of Multimodal LLMs");
    assert.equal(refreshedLike?.one_line_takeaway, "local edit survives");
    assert.match(refreshedLike?.abstract || "", /openly released multimodal stack/i);

    const deletedLikes = JSON.parse(globalThis.localStorage.getItem("cool-paper-liked-papers-v1") || "[]");
    const deletedLike = deletedLikes.find((item) => item.title === "Cambrian-1: A Fully Open, Vision-Centric Exploration of Multimodal LLMs");
    deletedLike.status = "later";
    deletedLike.deleted_at = "2026-03-20T10:00:00.000Z";
    globalThis.localStorage.setItem("cool-paper-liked-papers-v1", JSON.stringify(deletedLikes));

    installManualLibraryTestCases();
    const restoredLikes = likesModule.readLikes();
    assert.equal(restoredLikes.length, 4);
    const restoredLike = restoredLikes.find((item) => item.title === "Cambrian-1: A Fully Open, Vision-Centric Exploration of Multimodal LLMs");
    assert.equal(restoredLike?.status, "liked");
    assert.equal(restoredLike?.deleted_at, "");
    assert.equal(restoredLike?.one_line_takeaway, "local edit survives");
  } finally {
    globalThis.window = originalWindow;
    globalThis.localStorage = originalLocalStorage;
    globalThis.CustomEvent = originalCustomEvent;
  }
});
