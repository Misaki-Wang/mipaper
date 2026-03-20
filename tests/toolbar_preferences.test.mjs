import test from "node:test";
import assert from "node:assert/strict";

import { initToolbarPreferences } from "../site/toolbar_preferences.js";
import {
  setDetailPanelDefaultMode,
  setGlobalViewMode,
  setThemeMode,
  setWorkspacePanelDefaultMode,
} from "../site/user_settings.js";

test.beforeEach(() => {
  const windowTarget = new EventTarget();
  windowTarget.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });

  globalThis.localStorage = createStorageMock();
  globalThis.window = windowTarget;
  globalThis.document = createDocumentMock();

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
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.window;
});

test("toolbar preferences react to user setting updates after initialization", () => {
  const seenViewModes = [];

  initToolbarPreferences({
    pageKey: "queue",
    onViewModeChange(mode) {
      seenViewModes.push(mode);
    },
  });

  setGlobalViewMode("list");
  setThemeMode("dark");
  setWorkspacePanelDefaultMode("collapsed");
  setDetailPanelDefaultMode("expanded");

  assert.equal(document.documentElement.dataset.pageViewMode, "list");
  assert.equal(document.documentElement.dataset.themeMode, "dark");
  assert.equal(document.documentElement.dataset.theme, "dark");
  assert.equal(document.documentElement.dataset.workspacePanelDefaultMode, "collapsed");
  assert.equal(document.documentElement.dataset.detailPanelDefaultMode, "expanded");
  assert.equal(document.body.classList.contains("page-view-list"), true);
  assert.equal(document.body.classList.contains("page-view-card"), false);
  assert.deepEqual(seenViewModes, ["list"]);

  const buttons = document.__buttons;
  assert.equal(buttons.view.card.getAttribute("aria-pressed"), "false");
  assert.equal(buttons.view.list.getAttribute("aria-pressed"), "true");
  assert.equal(buttons.theme.dark.getAttribute("aria-pressed"), "true");
  assert.equal(buttons.workspace.collapsed.getAttribute("aria-pressed"), "true");
  assert.equal(buttons.detail.expanded.getAttribute("aria-pressed"), "true");
});

function createDocumentMock() {
  const buttons = {
    theme: {
      auto: createButton({ themeToggle: "auto" }),
      light: createButton({ themeToggle: "light" }),
      dark: createButton({ themeToggle: "dark" }),
    },
    view: {
      card: createButton({ pageViewToggle: "card" }),
      list: createButton({ pageViewToggle: "list" }),
    },
    workspace: {
      expanded: createButton({ workspaceDefaultToggle: "expanded" }),
      collapsed: createButton({ workspaceDefaultToggle: "collapsed" }),
    },
    detail: {
      collapsed: createButton({ detailPanelDefaultToggle: "collapsed" }),
      expanded: createButton({ detailPanelDefaultToggle: "expanded" }),
    },
  };

  return {
    __buttons: buttons,
    documentElement: {
      dataset: {},
    },
    body: {
      classList: createClassList(),
    },
    addEventListener() {},
    querySelectorAll(selector) {
      if (selector === "[data-theme-toggle]") {
        return Object.values(buttons.theme);
      }
      if (selector === "[data-page-view-toggle]") {
        return Object.values(buttons.view);
      }
      if (selector === "[data-workspace-default-toggle]") {
        return Object.values(buttons.workspace);
      }
      if (selector === "[data-detail-panel-default-toggle]") {
        return Object.values(buttons.detail);
      }
      return [];
    },
  };
}

function createButton(dataset) {
  const attributes = new Map();
  return {
    dataset: { ...dataset },
    classList: createClassList(),
    addEventListener() {},
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    setAttribute(name, value) {
      attributes.set(String(name), String(value));
    },
  };
}

function createClassList() {
  const classes = new Set();
  return {
    add(value) {
      classes.add(String(value));
    },
    contains(value) {
      return classes.has(String(value));
    },
    toggle(value, force) {
      const key = String(value);
      if (force === true) {
        classes.add(key);
        return true;
      }
      if (force === false) {
        classes.delete(key);
        return false;
      }
      if (classes.has(key)) {
        classes.delete(key);
        return false;
      }
      classes.add(key);
      return true;
    },
  };
}

function createStorageMock() {
  const store = new Map();

  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
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
