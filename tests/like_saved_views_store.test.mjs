import test from "node:test";
import assert from "node:assert/strict";

test.beforeEach(() => {
  globalThis.localStorage = createStorageMock();
  globalThis.window = new EventTarget();

  if (typeof globalThis.CustomEvent !== "function") {
    globalThis.CustomEvent = class CustomEvent extends Event {
      constructor(type, options = {}) {
        super(type, options);
        this.detail = options.detail;
      }
    };
  }
});

test.afterEach(() => {
  delete globalThis.localStorage;
  delete globalThis.window;
});

test("saved view store preserves sort mode in filters", async () => {
  const storeModule = await import(`../site/like_saved_views_store.js?sort-mode=${Date.now()}`);

  const nextView = storeModule.upsertSavedView({
    view_id: "view_sort_mode",
    name: "Oldest first",
    filters: {
      sortMode: "arxiv_asc",
      viewMode: "card",
    },
  });

  assert.equal(nextView?.filters?.sortMode, "arxiv_asc");
  assert.equal(storeModule.readSavedViews()[0]?.filters?.sortMode, "arxiv_asc");
});

function createStorageMock() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };
}
