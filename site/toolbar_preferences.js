import {
  hasGlobalViewModePreference,
  normalizeDetailPanelDefaultMode,
  normalizeThemeMode,
  normalizeViewMode,
  normalizeWorkspacePanelDefaultMode,
  readDetailPanelDefaultMode as readStoredDetailPanelDefaultMode,
  readPageViewMode as readUserPageViewMode,
  readThemeMode as readStoredThemeMode,
  readWorkspacePanelDefaultMode as readStoredWorkspacePanelDefaultMode,
  setDetailPanelDefaultMode,
  setGlobalViewMode,
  setThemeMode,
  setWorkspacePanelDefaultMode,
  subscribeUserSettings,
} from "./user_settings.js?v=0f028ca95d";

const viewModeCallbacks = new Map();

let themeBindingInitialized = false;
let systemThemeQuery = null;
let workspaceBindingInitialized = false;
let detailBindingInitialized = false;
let userSettingsBindingInitialized = false;
let userSettingsInitialSnapshotHandled = false;
let activeViewContext = null;

export function initToolbarPreferences({ pageKey, defaultViewMode = "card", fallbackViewKeys = [], onViewModeChange = null } = {}) {
  if (!pageKey) {
    throw new Error("initToolbarPreferences requires a pageKey");
  }

  if (typeof onViewModeChange === "function") {
    viewModeCallbacks.set(pageKey, onViewModeChange);
  } else {
    viewModeCallbacks.delete(pageKey);
  }

  activeViewContext = {
    pageKey,
    defaultViewMode,
    fallbackViewKeys: Array.isArray(fallbackViewKeys) ? [...fallbackViewKeys] : [],
  };

  ensureThemeBinding();
  ensureWorkspaceBinding();
  ensureDetailBinding();
  ensureUserSettingsBinding();
  bindViewButtons(pageKey);

  const initialViewMode = readUserPageViewMode(pageKey, { defaultViewMode, fallbackViewKeys });
  applyPageViewMode(pageKey, initialViewMode, { persist: !hasGlobalViewModePreference(), notify: false });
  return initialViewMode;
}

export function setPageViewMode(pageKey, nextMode, options = {}) {
  return applyPageViewMode(pageKey, nextMode, {
    persist: options.persist !== false,
    notify: options.notify !== false,
  });
}

export function readPageViewMode(pageKey, { defaultViewMode = "card", fallbackViewKeys = [] } = {}) {
  return readUserPageViewMode(pageKey, { defaultViewMode, fallbackViewKeys });
}

function bindViewButtons(pageKey) {
  document.querySelectorAll("[data-page-view-toggle]").forEach((button) => {
    if (button.dataset.pageViewBound === "true") {
      return;
    }
    button.dataset.pageViewBound = "true";
    button.addEventListener("click", () => {
      const mode = button.dataset.pageViewToggle || "card";
      setPageViewMode(pageKey, mode);
    });
  });
}

function applyPageViewMode(pageKey, nextMode, options = {}) {
  const mode = normalizeViewMode(nextMode);
  const { persist = true, notify = true } = options;
  const previousMode = normalizeViewMode(document.documentElement?.dataset?.pageViewMode || "");
  const modeChanged = previousMode !== mode;

  document.documentElement.dataset.pageViewMode = mode;
  if (document.body) {
    document.body.classList.toggle("page-view-list", mode === "list");
    document.body.classList.toggle("page-view-card", mode !== "list");
  }

  if (persist) {
    setGlobalViewMode(mode);
  }

  document.querySelectorAll("[data-page-view-toggle]").forEach((button) => {
    const active = normalizeViewMode(button.dataset.pageViewToggle) === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (notify && modeChanged) {
    const callback = viewModeCallbacks.get(pageKey);
    if (typeof callback === "function") {
      callback(mode);
    }
    window.dispatchEvent(new CustomEvent("cool-paper:view-mode-changed", { detail: { pageKey, mode } }));
  }

  return mode;
}

function ensureThemeBinding() {
  if (themeBindingInitialized) {
    applyTheme(readStoredThemeMode(), { persist: false });
    return;
  }

  themeBindingInitialized = true;
  systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-theme-toggle]") : null;
    if (!button) {
      return;
    }
    applyTheme(button.dataset.themeToggle || "auto");
  });

  const handleSystemThemeChange = () => {
    if (readStoredThemeMode() === "auto") {
      applyTheme("auto", { persist: false });
    }
  };

  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof systemThemeQuery.addListener === "function") {
    systemThemeQuery.addListener(handleSystemThemeChange);
  }

  applyTheme(readStoredThemeMode(), { persist: false });
}

function ensureWorkspaceBinding() {
  if (workspaceBindingInitialized) {
    applyWorkspacePanelDefaultMode(readStoredWorkspacePanelDefaultMode(), { persist: false });
    return;
  }

  workspaceBindingInitialized = true;

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-workspace-default-toggle]") : null;
    if (!button) {
      return;
    }
    applyWorkspacePanelDefaultMode(button.dataset.workspaceDefaultToggle || "expanded");
  });

  applyWorkspacePanelDefaultMode(readStoredWorkspacePanelDefaultMode(), { persist: false });
}

function ensureDetailBinding() {
  if (detailBindingInitialized) {
    applyDetailPanelDefaultMode(readStoredDetailPanelDefaultMode(), { persist: false });
    return;
  }

  detailBindingInitialized = true;

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("[data-detail-panel-default-toggle]") : null;
    if (!button) {
      return;
    }
    applyDetailPanelDefaultMode(button.dataset.detailPanelDefaultToggle || "collapsed");
  });

  applyDetailPanelDefaultMode(readStoredDetailPanelDefaultMode(), { persist: false });
}

function ensureUserSettingsBinding() {
  if (userSettingsBindingInitialized) {
    return;
  }

  userSettingsBindingInitialized = true;

  subscribeUserSettings((snapshot) => {
    applyTheme(snapshot?.themeMode, { persist: false });
    applyWorkspacePanelDefaultMode(snapshot?.workspacePanelDefaultMode, { persist: false });
    applyDetailPanelDefaultMode(snapshot?.detailPanelDefaultMode, { persist: false });

    if (activeViewContext?.pageKey) {
      const nextMode = normalizeViewMode(snapshot?.viewMode);
      applyPageViewMode(activeViewContext.pageKey, nextMode, {
        persist: false,
        notify: userSettingsInitialSnapshotHandled,
      });
    }

    userSettingsInitialSnapshotHandled = true;
  });
}

function applyTheme(mode, options = {}) {
  const { persist = true } = options;
  const normalizedMode = normalizeThemeMode(mode);
  const resolvedTheme = normalizedMode === "auto" ? (systemThemeQuery?.matches ? "dark" : "light") : normalizedMode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themeMode = normalizedMode;

  if (persist) {
    setThemeMode(normalizedMode);
  }

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const active = normalizeThemeMode(button.dataset.themeToggle) === normalizedMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function applyWorkspacePanelDefaultMode(mode, options = {}) {
  const { persist = true } = options;
  const normalizedMode = normalizeWorkspacePanelDefaultMode(mode);

  document.documentElement.dataset.workspacePanelDefaultMode = normalizedMode;

  if (persist) {
    setWorkspacePanelDefaultMode(normalizedMode);
  }

  document.querySelectorAll("[data-workspace-default-toggle]").forEach((button) => {
    const active = normalizeWorkspacePanelDefaultMode(button.dataset.workspaceDefaultToggle) === normalizedMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  return normalizedMode;
}

function applyDetailPanelDefaultMode(mode, options = {}) {
  const { persist = true } = options;
  const normalizedMode = normalizeDetailPanelDefaultMode(mode);

  document.documentElement.dataset.detailPanelDefaultMode = normalizedMode;

  if (persist) {
    setDetailPanelDefaultMode(normalizedMode);
  }

  document.querySelectorAll("[data-detail-panel-default-toggle]").forEach((button) => {
    const active = normalizeDetailPanelDefaultMode(button.dataset.detailPanelDefaultToggle) === normalizedMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  return normalizedMode;
}
