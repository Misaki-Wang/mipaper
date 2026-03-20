import { DEVICE_ID_STORAGE_KEY, getSyncDeviceId } from "./sync_utils.js?v=8b7af265fa";

export const USER_SETTINGS_CHANGED_EVENT = "cool-paper:user-settings-changed";

const THEME_STORAGE_KEY = "cool-paper-theme";
const GLOBAL_VIEW_MODE_STORAGE_KEY = "cool-paper-page-view-mode-v1";
const LEGACY_PAGE_VIEW_MODE_KEY_PREFIX = "cool-paper-page-view-mode:";
const TOOLBAR_AUTO_HIDE_KEY = "cool-paper-toolbar-auto-hide";
const WORKSPACE_PANEL_DEFAULT_MODE_KEY = "cool-paper-workspace-panel-default-mode";
const DETAIL_PANEL_DEFAULT_MODE_KEY = "cool-paper-detail-panel-default-mode";
const ACCOUNT_PANEL_PREFERENCE_PINS_KEY = "cool-paper-account-panel-preference-pins";

export const ACCOUNT_PANEL_PREFERENCE_OPTIONS = ["theme", "view", "toolbar", "workspace", "details"];
export const DEFAULT_ACCOUNT_PANEL_PREFERENCE_PINS = ["theme", "view", "workspace"];

export function normalizeThemeMode(value) {
  return value === "light" || value === "dark" ? value : "auto";
}

export function normalizeViewMode(value) {
  return String(value || "").trim().toLowerCase() === "list" ? "list" : "card";
}

export function normalizeWorkspacePanelDefaultMode(value) {
  return String(value || "").trim().toLowerCase() === "collapsed" ? "collapsed" : "expanded";
}

export function normalizeDetailPanelDefaultMode(value) {
  return String(value || "").trim().toLowerCase() === "expanded" ? "expanded" : "collapsed";
}

export function normalizeAccountPanelPreferencePins(value) {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? parseStoredArray(value)
      : [];
  const seen = new Set();

  return candidates.reduce((result, item) => {
    const normalized = String(item || "").trim().toLowerCase();
    if (!ACCOUNT_PANEL_PREFERENCE_OPTIONS.includes(normalized) || seen.has(normalized)) {
      return result;
    }
    seen.add(normalized);
    result.push(normalized);
    return result;
  }, []);
}

export function getLegacyPageViewModeKey(pageKey) {
  return `${LEGACY_PAGE_VIEW_MODE_KEY_PREFIX}${pageKey}`;
}

export function readThemeMode() {
  return normalizeThemeMode(readStorage(THEME_STORAGE_KEY) || "auto");
}

export function setThemeMode(mode, options = {}) {
  const normalizedMode = normalizeThemeMode(mode);
  writeStorage(THEME_STORAGE_KEY, normalizedMode);
  if (options.emit !== false) {
    emitUserSettingsChanged();
  }
  return normalizedMode;
}

export function readGlobalViewMode(defaultViewMode = "card") {
  const stored = readStorage(GLOBAL_VIEW_MODE_STORAGE_KEY);
  if (!stored) {
    return normalizeViewMode(defaultViewMode);
  }
  return normalizeViewMode(stored);
}

export function setGlobalViewMode(mode, options = {}) {
  const normalizedMode = normalizeViewMode(mode);
  writeStorage(GLOBAL_VIEW_MODE_STORAGE_KEY, normalizedMode);
  if (options.emit !== false) {
    emitUserSettingsChanged();
  }
  return normalizedMode;
}

export function hasGlobalViewModePreference() {
  return Boolean(readStorage(GLOBAL_VIEW_MODE_STORAGE_KEY));
}

export function readPageViewMode(pageKey, { defaultViewMode = "card", fallbackViewKeys = [] } = {}) {
  const normalizedDefault = normalizeViewMode(defaultViewMode);
  const stored = readStorage(GLOBAL_VIEW_MODE_STORAGE_KEY);
  if (stored) {
    return normalizeViewMode(stored);
  }

  const legacyStored = readStorage(getLegacyPageViewModeKey(pageKey));
  if (legacyStored) {
    return normalizeViewMode(legacyStored);
  }

  for (const fallbackKey of fallbackViewKeys) {
    const fallback = readStorage(String(fallbackKey || ""));
    if (fallback) {
      return normalizeViewMode(fallback);
    }
  }

  return normalizedDefault;
}

export function readToolbarAutoHidePreference() {
  const stored = readStorage(TOOLBAR_AUTO_HIDE_KEY);
  if (stored === null) {
    return true;
  }
  return stored !== "0" && stored !== "false";
}

export function setToolbarAutoHidePreference(enabled, options = {}) {
  const nextEnabled = Boolean(enabled);
  writeStorage(TOOLBAR_AUTO_HIDE_KEY, nextEnabled ? "1" : "0");
  if (options.emit !== false) {
    emitUserSettingsChanged();
  }
  return nextEnabled;
}

export function readWorkspacePanelDefaultMode() {
  return normalizeWorkspacePanelDefaultMode(readStorage(WORKSPACE_PANEL_DEFAULT_MODE_KEY) || "expanded");
}

export function setWorkspacePanelDefaultMode(mode, options = {}) {
  const normalizedMode = normalizeWorkspacePanelDefaultMode(mode);
  writeStorage(WORKSPACE_PANEL_DEFAULT_MODE_KEY, normalizedMode);
  if (options.emit !== false) {
    emitUserSettingsChanged();
  }
  return normalizedMode;
}

export function readDetailPanelDefaultMode() {
  return normalizeDetailPanelDefaultMode(readStorage(DETAIL_PANEL_DEFAULT_MODE_KEY) || "collapsed");
}

export function setDetailPanelDefaultMode(mode, options = {}) {
  const normalizedMode = normalizeDetailPanelDefaultMode(mode);
  writeStorage(DETAIL_PANEL_DEFAULT_MODE_KEY, normalizedMode);
  if (options.emit !== false) {
    emitUserSettingsChanged();
  }
  return normalizedMode;
}

export function readAccountPanelPreferencePins() {
  const stored = readStorage(ACCOUNT_PANEL_PREFERENCE_PINS_KEY);
  if (stored === null) {
    return [...DEFAULT_ACCOUNT_PANEL_PREFERENCE_PINS];
  }

  return normalizeAccountPanelPreferencePins(stored);
}

export function setAccountPanelPreferencePins(pins, options = {}) {
  const normalizedPins = normalizeAccountPanelPreferencePins(pins);
  writeStorage(ACCOUNT_PANEL_PREFERENCE_PINS_KEY, JSON.stringify(normalizedPins));
  if (options.emit !== false) {
    emitUserSettingsChanged();
  }
  return normalizedPins;
}

export function getUserSettingsSnapshot() {
  return {
    themeMode: readThemeMode(),
    viewMode: readGlobalViewMode(),
    toolbarAutoHide: readToolbarAutoHidePreference(),
    workspacePanelDefaultMode: readWorkspacePanelDefaultMode(),
    detailPanelDefaultMode: readDetailPanelDefaultMode(),
    accountPanelPreferencePins: readAccountPanelPreferencePins(),
    syncDeviceId: getSyncDeviceId(),
  };
}

export function subscribeUserSettings(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }

  const eventTarget = getEventTarget();
  const handler = () => {
    callback(getUserSettingsSnapshot());
  };
  const storageHandler = (event) => {
    if (isTrackedStorageKey(event?.key)) {
      handler();
    }
  };

  if (eventTarget && typeof eventTarget.addEventListener === "function") {
    eventTarget.addEventListener(USER_SETTINGS_CHANGED_EVENT, handler);
    eventTarget.addEventListener("storage", storageHandler);
  }

  handler();

  return () => {
    if (eventTarget && typeof eventTarget.removeEventListener === "function") {
      eventTarget.removeEventListener(USER_SETTINGS_CHANGED_EVENT, handler);
      eventTarget.removeEventListener("storage", storageHandler);
    }
  };
}

function emitUserSettingsChanged() {
  const snapshot = getUserSettingsSnapshot();
  const eventTarget = getEventTarget();
  if (eventTarget && typeof eventTarget.dispatchEvent === "function" && typeof CustomEvent === "function") {
    eventTarget.dispatchEvent(new CustomEvent(USER_SETTINGS_CHANGED_EVENT, { detail: snapshot }));
  }
  return snapshot;
}

function getEventTarget() {
  if (typeof window !== "undefined") {
    return window;
  }
  if (typeof globalThis !== "undefined" && typeof globalThis.addEventListener === "function") {
    return globalThis;
  }
  return null;
}

function readStorage(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch (_error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
    return true;
  } catch (_error) {
    return false;
  }
}

function parseStoredArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function isTrackedStorageKey(key) {
  return (
    key === THEME_STORAGE_KEY ||
    key === GLOBAL_VIEW_MODE_STORAGE_KEY ||
    key === TOOLBAR_AUTO_HIDE_KEY ||
    key === WORKSPACE_PANEL_DEFAULT_MODE_KEY ||
    key === DETAIL_PANEL_DEFAULT_MODE_KEY ||
    key === ACCOUNT_PANEL_PREFERENCE_PINS_KEY ||
    key === DEVICE_ID_STORAGE_KEY
  );
}
