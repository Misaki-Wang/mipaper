import test from "node:test";
import assert from "node:assert/strict";

import { bindBackToTop, bindFilterMenu } from "../site/page_shell.js";

class MockClassList {
  constructor() {
    this.names = new Set();
  }

  toggle(name, force) {
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
    this.hidden = false;
    this.textContent = "";
    this.title = "";
    this.attributes = new Map();
    this.classList = new MockClassList();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) || "";
  }

  contains(target) {
    return target === this;
  }
}

class MockWindow extends EventTarget {
  constructor() {
    super();
    this.scrollY = 0;
    this.scrollCalls = [];
  }

  scrollTo(options) {
    this.scrollCalls.push(options);
  }
}

test("bindFilterMenu toggles panel and closes on outside click", () => {
  const originalDocument = globalThis.document;
  const mockDocument = new EventTarget();
  globalThis.document = mockDocument;

  try {
    const button = new MockElement();
    const panel = new MockElement();
    const label = new MockElement();
    const icon = new MockElement();

    bindFilterMenu({
      button,
      panel,
      labelNode: label,
      iconNode: icon,
    });

    assert.equal(panel.hidden, true);
    assert.equal(button.getAttribute("aria-expanded"), "false");
    assert.equal(label.textContent, "Filters");
    assert.equal(icon.textContent, "☰");

    button.dispatchEvent(new Event("click"));
    assert.equal(panel.hidden, false);
    assert.equal(button.getAttribute("aria-expanded"), "true");

    mockDocument.dispatchEvent(new Event("click"));
    assert.equal(panel.hidden, true);
    assert.equal(button.getAttribute("aria-expanded"), "false");
  } finally {
    globalThis.document = originalDocument;
  }
});

test("bindFilterMenu closes other toolbar panels when a new one opens", () => {
  const originalDocument = globalThis.document;
  const mockDocument = new EventTarget();
  globalThis.document = mockDocument;

  try {
    const firstButton = new MockElement();
    const firstPanel = new MockElement();
    const secondButton = new MockElement();
    const secondPanel = new MockElement();

    bindFilterMenu({ button: firstButton, panel: firstPanel });
    bindFilterMenu({ button: secondButton, panel: secondPanel });

    firstButton.dispatchEvent(new Event("click"));
    assert.equal(firstPanel.hidden, false);
    assert.equal(secondPanel.hidden, true);

    secondButton.dispatchEvent(new Event("click"));
    assert.equal(firstPanel.hidden, true);
    assert.equal(secondPanel.hidden, false);
    assert.equal(firstButton.getAttribute("aria-expanded"), "false");
    assert.equal(secondButton.getAttribute("aria-expanded"), "true");
  } finally {
    globalThis.document = originalDocument;
  }
});

test("bindBackToTop updates visibility and scrolls to top", () => {
  const originalWindow = globalThis.window;
  const mockWindow = new MockWindow();
  globalThis.window = mockWindow;

  try {
    const button = new MockElement();
    bindBackToTop(button, { threshold: 100 });

    assert.equal(button.getAttribute("aria-hidden"), "true");
    assert.equal(button.classList.contains("is-visible"), false);

    mockWindow.scrollY = 120;
    mockWindow.dispatchEvent(new Event("scroll"));
    assert.equal(button.getAttribute("aria-hidden"), "false");
    assert.equal(button.classList.contains("is-visible"), true);

    button.dispatchEvent(new Event("click"));
    assert.deepEqual(mockWindow.scrollCalls, [{ top: 0, behavior: "smooth" }]);
  } finally {
    globalThis.window = originalWindow;
  }
});
