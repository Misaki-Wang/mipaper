import test from "node:test";
import assert from "node:assert/strict";

import { createBranchReviewController } from "../site/branch_page.js";

class MockClassList {
  constructor() {
    this.names = new Set();
  }

  add(name) {
    this.names.add(name);
  }

  remove(name) {
    this.names.delete(name);
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.names.has(name)) {
        this.names.delete(name);
        return false;
      }
      this.names.add(name);
      return true;
    }
    if (force) {
      this.names.add(name);
      return true;
    }
    this.names.delete(name);
    return false;
  }

  contains(name) {
    return this.names.has(name);
  }
}

class MockElement extends EventTarget {
  constructor() {
    super();
    this.textContent = "";
    this.attributes = new Map();
    this.classList = new MockClassList();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || "";
  }
}

test("createBranchReviewController renders empty state without report", () => {
  const button = new MockElement();
  const meta = new MockElement();
  const hero = new MockElement();
  const controller = createBranchReviewController({
    reviewScope: "cool_daily",
    branchLabel: "Cool Daily",
    reviewToggleButton: button,
    reviewToggleMeta: meta,
    heroReviewStatus: hero,
    getCurrentReport: () => null,
    getCurrentPath: () => "",
    getSnapshotLabel: () => "",
  });

  controller.renderReviewState();

  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(meta.textContent, "Mark this snapshot as reviewed");
  assert.equal(hero.textContent, "Not reviewed");
});
