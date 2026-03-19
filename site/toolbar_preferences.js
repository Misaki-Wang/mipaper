const THEME_STORAGE_KEY = "cool-paper-theme";
const GLOBAL_VIEW_MODE_STORAGE_KEY = "cool-paper-page-view-mode-v1";
const LEGACY_PAGE_VIEW_MODE_KEY_PREFIX = "cool-paper-page-view-mode:";

const viewModeCallbacks = new Map();

let themeBindingInitialized = false;
let systemThemeQuery = null;

export function initToolbarPreferences({ pageKey, defaultViewMode = "card", fallbackViewKeys = [], onViewModeChange = null } = {}) {
  if (!pageKey) {
    throw new Error("initToolbarPreferences requires a pageKey");
  }

  if (typeof onViewModeChange === "function") {
    viewModeCallbacks.set(pageKey, onViewModeChange);
  } else {
    viewModeCallbacks.delete(pageKey);
  }

  ensureThemeBinding();
  bindViewButtons(pageKey);

  const initialViewMode = readPageViewMode(pageKey, { defaultViewMode, fallbackViewKeys });
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
  const normalizedDefault = normalizeViewMode(defaultViewMode);
  try {
    const stored = window.localStorage.getItem(GLOBAL_VIEW_MODE_STORAGE_KEY);
    if (stored) {
      return normalizeViewMode(stored);
    }
    const legacyStored = window.localStorage.getItem(getLegacyPageViewModeKey(pageKey));
    if (legacyStored) {
      return normalizeViewMode(legacyStored);
    }
    for (const fallbackKey of fallbackViewKeys) {
      const fallback = window.localStorage.getItem(String(fallbackKey || ""));
      if (fallback) {
        return normalizeViewMode(fallback);
      }
    }
  } catch (_error) {
    return normalizedDefault;
  }
  return normalizedDefault;
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

  document.documentElement.dataset.pageViewMode = mode;
  if (document.body) {
    document.body.classList.toggle("page-view-list", mode === "list");
    document.body.classList.toggle("page-view-card", mode !== "list");
  }

  if (persist) {
    try {
      window.localStorage.setItem(GLOBAL_VIEW_MODE_STORAGE_KEY, mode);
    } catch (_error) {
      // Ignore view preference persistence failures.
    }
  }

  document.querySelectorAll("[data-page-view-toggle]").forEach((button) => {
    const active = normalizeViewMode(button.dataset.pageViewToggle) === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  if (notify) {
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
    applyTheme(readThemeMode(), { persist: false });
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
    if (readThemeMode() === "auto") {
      applyTheme("auto", { persist: false });
    }
  };

  if (typeof systemThemeQuery.addEventListener === "function") {
    systemThemeQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof systemThemeQuery.addListener === "function") {
    systemThemeQuery.addListener(handleSystemThemeChange);
  }

  applyTheme(readThemeMode(), { persist: false });
}

function applyTheme(mode, options = {}) {
  const { persist = true } = options;
  const normalizedMode = normalizeThemeMode(mode);
  const resolvedTheme = normalizedMode === "auto" ? (systemThemeQuery?.matches ? "dark" : "light") : normalizedMode;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.dataset.themeMode = normalizedMode;

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalizedMode);
    } catch (_error) {
      // Ignore theme persistence failures.
    }
  }

  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const active = normalizeThemeMode(button.dataset.themeToggle) === normalizedMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function readThemeMode() {
  try {
    return normalizeThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY) || "auto");
  } catch {
    return "auto";
  }
}

function normalizeThemeMode(value) {
  return value === "light" || value === "dark" ? value : "auto";
}

function normalizeViewMode(value) {
  return String(value || "").trim().toLowerCase() === "list" ? "list" : "card";
}

function hasGlobalViewModePreference() {
  try {
    return Boolean(window.localStorage.getItem(GLOBAL_VIEW_MODE_STORAGE_KEY));
  } catch {
    return false;
  }
}

function getLegacyPageViewModeKey(pageKey) {
  return `${LEGACY_PAGE_VIEW_MODE_KEY_PREFIX}${pageKey}`;
}
