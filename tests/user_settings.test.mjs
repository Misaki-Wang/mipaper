import test from "node:test";
import assert from "node:assert/strict";

import {
  getUserSettingsSnapshot,
  readAccountPanelPreferencePins,
  readDetailPanelDefaultMode,
  readPageViewMode,
  readToolbarAutoHidePreference,
  readWorkspacePanelDefaultMode,
  setAccountPanelPreferencePins,
  setDetailPanelDefaultMode,
  setGlobalViewMode,
  setThemeMode,
  setToolbarAutoHidePreference,
  setWorkspacePanelDefaultMode,
  subscribeUserSettings,
} from "../site/user_settings.js";

test.beforeEach(() => {
  const storage = createStorageMock();
  const eventTarget = new EventTarget();

  globalThis.localStorage = storage;
  globalThis.window = eventTarget;

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

test("readPageViewMode prefers the global view mode before legacy and fallback keys", () => {
  globalThis.localStorage.setItem("cool-paper-page-view-mode-v1", "list");
  globalThis.localStorage.setItem("cool-paper-page-view-mode:like", "card");
  globalThis.localStorage.setItem("cool-paper-like-view-mode-v1", "card");

  assert.equal(
    readPageViewMode("like", {
      defaultViewMode: "card",
      fallbackViewKeys: ["cool-paper-like-view-mode-v1"],
    }),
    "list"
  );
});

test("toolbar auto-hide preference defaults to enabled and can be persisted", () => {
  assert.equal(readToolbarAutoHidePreference(), true);
  setToolbarAutoHidePreference(false);
  assert.equal(readToolbarAutoHidePreference(), false);
});

test("workspace panel default mode defaults to expanded and can be persisted", () => {
  assert.equal(readWorkspacePanelDefaultMode(), "expanded");
  setWorkspacePanelDefaultMode("collapsed");
  assert.equal(readWorkspacePanelDefaultMode(), "collapsed");
});

test("detail panel default mode defaults to collapsed and can be persisted", () => {
  assert.equal(readDetailPanelDefaultMode(), "collapsed");
  setDetailPanelDefaultMode("expanded");
  assert.equal(readDetailPanelDefaultMode(), "expanded");
});

test("account panel preference pins default to theme, view, and workspace and can be persisted", () => {
  assert.deepEqual(readAccountPanelPreferencePins(), ["theme", "view", "workspace"]);
  setAccountPanelPreferencePins(["theme", "toolbar", "details"]);
  assert.deepEqual(readAccountPanelPreferencePins(), ["theme", "toolbar", "details"]);
  setAccountPanelPreferencePins([]);
  assert.deepEqual(readAccountPanelPreferencePins(), []);
});

test("getUserSettingsSnapshot includes persisted theme, view mode, and sync device id", () => {
  setThemeMode("dark");
  setGlobalViewMode("list");
  setToolbarAutoHidePreference(false);
  setWorkspacePanelDefaultMode("collapsed");
  setDetailPanelDefaultMode("expanded");
  setAccountPanelPreferencePins(["theme", "toolbar", "details"]);

  const snapshot = getUserSettingsSnapshot();

  assert.equal(snapshot.themeMode, "dark");
  assert.equal(snapshot.viewMode, "list");
  assert.equal(snapshot.toolbarAutoHide, false);
  assert.equal(snapshot.workspacePanelDefaultMode, "collapsed");
  assert.equal(snapshot.detailPanelDefaultMode, "expanded");
  assert.deepEqual(snapshot.accountPanelPreferencePins, ["theme", "toolbar", "details"]);
  assert.match(snapshot.syncDeviceId, /.+/);
});

test("subscribeUserSettings emits initial and updated snapshots", () => {
  const seen = [];
  const unsubscribe = subscribeUserSettings((snapshot) => {
    seen.push(snapshot);
  });

  setThemeMode("dark");
  setToolbarAutoHidePreference(false);
  setWorkspacePanelDefaultMode("collapsed");
  setDetailPanelDefaultMode("expanded");
  setAccountPanelPreferencePins(["view", "toolbar"]);
  unsubscribe();

  assert.equal(seen[0].themeMode, "auto");
  assert.equal(seen.at(-1).themeMode, "dark");
  assert.equal(seen.at(-1).toolbarAutoHide, false);
  assert.equal(seen.at(-1).workspacePanelDefaultMode, "collapsed");
  assert.equal(seen.at(-1).detailPanelDefaultMode, "expanded");
  assert.deepEqual(seen.at(-1).accountPanelPreferencePins, ["view", "toolbar"]);
});

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
