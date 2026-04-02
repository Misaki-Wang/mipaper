import {
  getAuthSnapshot,
  initLikesSync,
  readLikes,
  signIn,
  signOut,
  subscribeAuth,
  subscribeLikes,
  syncLikesNow,
} from "./likes.js?v=99ec863b62";
import { initReviewSync, subscribePageReviews, syncPageReviewsNow } from "./reading_state.js?v=3a706b914e";
import { initQueue, readQueue, subscribeQueue } from "./paper_queue.js?v=033bd186d1";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=66a12f1edc";
import { mountAppToolbar } from "./app_toolbar.js?v=a2626f682a";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=88024f7cbb";
import { initToolbarPreferences } from "./toolbar_preferences.js?v=c889d6e375";
import { bindBackToTop } from "./page_shell.js?v=b0d53b671d";
import { escapeAttribute, escapeHtml, fetchJson, formatDateTime } from "./ui_utils.js?v=e2da3b3a11";
import { getToReadSnapshots, loadSnapshotQueueData } from "./like_page_snapshots.js?v=30e01ecd4f";
import {
  initSavedViewsSync,
  readSavedViews as readSavedViewsStore,
  subscribeSavedViews,
  syncSavedViewsNow,
} from "./like_saved_views_store.js?v=90877ca133";
import {
  ACCOUNT_PANEL_PREFERENCE_OPTIONS,
  DEFAULT_ACCOUNT_PANEL_PREFERENCE_PINS,
  getUserSettingsSnapshot,
  setAccountPanelPreferencePins,
  setToolbarAutoHidePreference,
  subscribeUserSettings,
} from "./user_settings.js?v=6c7496f04b";

mountAppToolbar("#settings-toolbar-root", {
  prefix: "settings",
  showFilters: false,
  branchActiveKey: null,
  libraryActiveKey: null,
  quickAddTarget: "later",
  settingsActive: true,
});

const SYNC_TIME_FORMAT = {
  locale: "en-US",
  emptyValue: "-",
  fallbackToOriginal: true,
  formatOptions: {
    dateStyle: "medium",
    timeStyle: "short",
  },
};

const THEME_LABELS = {
  auto: "Auto",
  light: "Day",
  dark: "Night",
};

const VIEW_LABELS = {
  card: "Gallery",
  list: "List",
};

const WORKSPACE_PANEL_LABELS = {
  expanded: "Expanded",
  collapsed: "Collapsed",
};

const DETAIL_PANEL_LABELS = {
  expanded: "Expanded",
  collapsed: "Collapsed",
};

const QUICK_PANEL_PREFERENCE_LABELS = {
  theme: "Theme",
  view: "View",
  toolbar: "Toolbar",
  workspace: "Workspace",
  details: "Details",
};

const state = {
  authSnapshot: getAuthSnapshot(),
  userSettings: getUserSettingsSnapshot(),
  snapshots: [],
  manualSyncInFlight: false,
  manualSyncError: "",
};

const heroSignals = document.querySelector("#settings-hero-signals");
const heroStatus = document.querySelector("#settings-hero-status");
const heroTheme = document.querySelector("#settings-hero-theme");
const heroView = document.querySelector("#settings-hero-view");
const heroToolbar = document.querySelector("#settings-hero-toolbar");
const heroDevice = document.querySelector("#settings-hero-device");
const themeSummary = document.querySelector("#settings-theme-summary");
const viewSummary = document.querySelector("#settings-view-summary");
const autoHideSummary = document.querySelector("#settings-autohide-summary");
const workspaceSummary = document.querySelector("#settings-workspace-summary");
const detailSummary = document.querySelector("#settings-detail-summary");
const quickPanelSummary = document.querySelector("#settings-quick-panel-summary");
const autoHideToggle = document.querySelector("#settings-autohide-toggle");
const autoHideNote = document.querySelector("#settings-autohide-note");
const accountCard = document.querySelector("#settings-account-card");
const authWarning = document.querySelector("#settings-auth-warning");
const authStatus = document.querySelector("#settings-auth-status");
const authButton = document.querySelector("#settings-auth-button");
const syncNowButton = document.querySelector("#settings-sync-now");
const syncFactsRoot = document.querySelector("#settings-sync-facts");
const storageFactsRoot = document.querySelector("#settings-storage-facts");
const backToTopButton = document.querySelector("#settings-back-to-top");

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  initToolbarPreferences({ pageKey: "settings" });
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("settings", { target: "later" });
  bindBranchAuthToolbar("settings");
  bindBackToTop(backToTopButton);
  bindSettingsActions();

  subscribeUserSettings((snapshot) => {
    state.userSettings = snapshot;
    renderAppearanceSection();
    renderHero();
    renderStorageSection();
  });

  subscribeAuth((snapshot) => {
    state.authSnapshot = snapshot;
    if (!snapshot.syncError) {
      state.manualSyncError = "";
    }
    renderSyncSection();
    renderHero();
  });

  subscribeLikes(() => {
    renderStorageSection();
    renderHero();
  });
  subscribeQueue(() => renderStorageSection());
  subscribeSavedViews(() => renderStorageSection());
  subscribePageReviews(() => renderStorageSection());

  await Promise.all([initLikesSync(), initQueue(), initSavedViewsSync(), initReviewSync()]);

  try {
    state.snapshots = await loadSnapshotQueueData(fetchJson);
  } catch (error) {
    console.warn("Failed to load snapshot queue data for settings page", error);
    state.snapshots = [];
  }

  renderPage();
}

function bindSettingsActions() {
  document.addEventListener("click", (event) => {
    const quickPanelToggle = event.target instanceof Element ? event.target.closest("[data-quick-panel-pin-toggle]") : null;
    if (!quickPanelToggle) {
      return;
    }
    toggleQuickPanelPreference(quickPanelToggle.dataset.quickPanelPinToggle || "");
  });

  autoHideToggle?.addEventListener("click", () => {
    setToolbarAutoHidePreference(!state.userSettings.toolbarAutoHide);
  });

  authButton?.addEventListener("click", async () => {
    if (state.authSnapshot?.signedIn) {
      state.manualSyncError = "";
      await signOut();
      return;
    }
    if (authStatus) {
      authStatus.textContent = "Redirecting to sign-in. Sync will resume automatically when you return.";
    }
    await signIn();
  });

  syncNowButton?.addEventListener("click", async () => {
    if (state.manualSyncInFlight) {
      return;
    }

    state.manualSyncInFlight = true;
    state.manualSyncError = "";
    renderSyncSection();

    try {
      await Promise.all([syncLikesNow(), syncSavedViewsNow(), syncPageReviewsNow()]);
    } catch (error) {
      state.manualSyncError = error instanceof Error ? error.message : String(error);
    } finally {
      state.manualSyncInFlight = false;
      renderSyncSection();
      renderHero();
      renderStorageSection();
    }
  });
}

function renderPage() {
  renderAppearanceSection();
  renderSyncSection();
  renderStorageSection();
  renderHero();
}

function renderAppearanceSection() {
  const {
    themeMode,
    viewMode,
    toolbarAutoHide,
    workspacePanelDefaultMode,
    detailPanelDefaultMode,
    accountPanelPreferencePins,
  } = state.userSettings;

  if (themeSummary) {
    themeSummary.textContent = THEME_LABELS[themeMode] || THEME_LABELS.auto;
  }
  if (viewSummary) {
    viewSummary.textContent = VIEW_LABELS[viewMode] || VIEW_LABELS.card;
  }
  if (autoHideSummary) {
    autoHideSummary.textContent = toolbarAutoHide ? "Enabled" : "Disabled";
  }
  if (workspaceSummary) {
    workspaceSummary.textContent = WORKSPACE_PANEL_LABELS[workspacePanelDefaultMode] || WORKSPACE_PANEL_LABELS.expanded;
  }
  if (detailSummary) {
    detailSummary.textContent = DETAIL_PANEL_LABELS[detailPanelDefaultMode] || DETAIL_PANEL_LABELS.collapsed;
  }
  if (quickPanelSummary) {
    quickPanelSummary.textContent = describeQuickPanelPreferences(accountPanelPreferencePins);
  }
  if (autoHideToggle) {
    autoHideToggle.textContent = toolbarAutoHide ? "Enabled" : "Disabled";
    autoHideToggle.classList.toggle("active", toolbarAutoHide);
    autoHideToggle.setAttribute("aria-pressed", String(toolbarAutoHide));
  }
  if (autoHideNote) {
    autoHideNote.textContent = toolbarAutoHide
      ? "Hide the toolbar when scrolling down and reveal it again when scrolling up."
      : "Keep the toolbar pinned to the top for faster page switching and filtering.";
  }

  syncToggleButtons("[data-theme-toggle]", themeMode);
  syncToggleButtons("[data-page-view-toggle]", viewMode);
  syncToggleButtons("[data-workspace-default-toggle]", workspacePanelDefaultMode);
  syncToggleButtons("[data-detail-panel-default-toggle]", detailPanelDefaultMode);
  syncQuickPanelButtons(accountPanelPreferencePins);
}

function renderSyncSection() {
  const snapshot = state.authSnapshot || getAuthSnapshot();
  const identity = buildIdentitySnapshot(snapshot);
  const signedIn = identity.signedIn;
  const syncStatusLabel = getSyncStatusLabel(snapshot);
  const statusMessage = getSyncStatusMessage(snapshot);

  renderAccountCard(identity);

  if (authWarning) {
    const message = snapshot.unauthorized ? snapshot.unauthorizedMessage || "This account is not authorized for sync." : "";
    authWarning.hidden = !message;
    authWarning.textContent = message;
  }

  if (authStatus) {
    authStatus.textContent = state.manualSyncError ? `Sync failed: ${state.manualSyncError}` : statusMessage;
  }

  if (authButton) {
    authButton.hidden = !snapshot.configured;
    authButton.disabled = !snapshot.configured;
    authButton.textContent = snapshot.signedIn ? "Sign out" : "Sign in";
  }
  if (syncNowButton) {
    syncNowButton.disabled = !snapshot.configured || !signedIn || snapshot.unauthorized || state.manualSyncInFlight;
    syncNowButton.textContent = state.manualSyncInFlight ? "Syncing..." : "Sync now";
  }

  if (syncFactsRoot) {
    const facts = [
      {
        label: "Status",
        value: syncStatusLabel,
        meta: snapshot.configured
          ? signedIn
            ? "Likes, saved views, and reviewed snapshots can sync across devices."
            : "You are currently working with local-only data on this browser."
          : "Supabase runtime config is missing, so remote sync is unavailable.",
      },
      {
        label: "Account",
        value: identity.email,
        meta: signedIn ? identity.displayName : "Sign in to attach sync data to an account.",
      },
      {
        label: "Last Sync",
        value: snapshot.lastSyncedAt ? formatDateTime(snapshot.lastSyncedAt, SYNC_TIME_FORMAT) : "Not synced yet",
        meta: snapshot.lastSyncedAt ? "Based on the latest successful like sync cursor." : "A successful sync timestamp will appear here.",
      },
      {
        label: "Current Device",
        value: truncateMiddle(state.userSettings.syncDeviceId, 10, 8),
        meta: "Each local change is stamped with this device id before it is merged remotely.",
        monospace: true,
      },
    ];
    syncFactsRoot.innerHTML = facts.map((fact) => renderFactCard(fact)).join("");
  }
}

function renderStorageSection() {
  if (!storageFactsRoot) {
    return;
  }

  const likes = readLikes();
  const laterQueue = readQueue("later");
  const savedViews = readSavedViewsStore();
  const unreadSnapshots = getToReadSnapshots(state.snapshots);

  const facts = [
    {
      label: "Sync Device ID",
      value: truncateMiddle(state.userSettings.syncDeviceId, 12, 8),
      meta: "Stable per browser unless local storage is cleared.",
      monospace: true,
    },
    {
      label: "Liked Papers",
      value: String(likes.length),
      meta: state.authSnapshot?.signedIn ? "Part of your synced library state." : "Currently stored locally on this device.",
    },
    {
      label: "Later Queue",
      value: String(laterQueue.length),
      meta: "Works as your local short-term reading queue.",
    },
    {
      label: "Saved Views",
      value: String(savedViews.length),
      meta: "Reusable library filter presets.",
    },
    {
      label: "Unread Snapshots",
      value: String(unreadSnapshots.length),
      meta: "Derived from snapshot manifests plus your reviewed-state markers.",
    },
  ];

  storageFactsRoot.innerHTML = facts.map((fact) => renderFactCard(fact)).join("");
}

function renderHero() {
  const snapshot = state.authSnapshot || getAuthSnapshot();
  const likes = readLikes();
  const laterQueue = readQueue("later");
  const savedViews = readSavedViewsStore();
  const unreadSnapshots = getToReadSnapshots(state.snapshots);
  const syncStatusLabel = getSyncStatusLabel(snapshot);

  if (heroStatus) {
    heroStatus.textContent = syncStatusLabel;
  }
  if (heroTheme) {
    heroTheme.textContent = THEME_LABELS[state.userSettings.themeMode] || THEME_LABELS.auto;
  }
  if (heroView) {
    heroView.textContent = VIEW_LABELS[state.userSettings.viewMode] || VIEW_LABELS.card;
  }
  if (heroToolbar) {
    heroToolbar.textContent = state.userSettings.toolbarAutoHide ? "Auto-hide" : "Pinned";
  }
  if (heroDevice) {
    heroDevice.textContent = truncateMiddle(state.userSettings.syncDeviceId, 4, 4);
  }

  if (heroSignals) {
    heroSignals.innerHTML = [
      `<div class="signal-chip"><span>Theme</span><strong>${escapeHtml(THEME_LABELS[state.userSettings.themeMode] || THEME_LABELS.auto)}</strong></div>`,
      `<div class="signal-chip"><span>View</span><strong>${escapeHtml(VIEW_LABELS[state.userSettings.viewMode] || VIEW_LABELS.card)}</strong></div>`,
      `<div class="signal-chip"><span>Details</span><strong>${escapeHtml(DETAIL_PANEL_LABELS[state.userSettings.detailPanelDefaultMode] || DETAIL_PANEL_LABELS.collapsed)}</strong></div>`,
      `<div class="signal-chip"><span>Liked</span><strong>${likes.length}</strong></div>`,
      `<div class="signal-chip"><span>Later</span><strong>${laterQueue.length}</strong></div>`,
      `<div class="signal-chip"><span>Saved Views</span><strong>${savedViews.length}</strong></div>`,
      `<div class="signal-chip"><span>Unread</span><strong>${unreadSnapshots.length}</strong></div>`,
    ].join("");
  }
}

function renderAccountCard(identity) {
  if (!accountCard) {
    return;
  }

  accountCard.classList.toggle("is-empty", !identity.signedIn && !identity.unauthorized);
  accountCard.classList.toggle("is-unauthorized", identity.unauthorized);

  const avatarShell = accountCard.querySelector(".account-avatar-shell");
  const nameNode = accountCard.querySelector(".account-card-name");
  const emailNode = accountCard.querySelector(".account-card-email");

  if (nameNode) {
    nameNode.textContent = identity.unauthorized
      ? `Unauthorized · ${identity.displayName}`
      : identity.signedIn
        ? identity.displayName
        : "Not signed in";
  }

  if (emailNode) {
    emailNode.textContent = identity.email;
  }

  if (avatarShell) {
    if ((identity.signedIn || identity.unauthorized) && identity.avatarUrl) {
      avatarShell.innerHTML = `<img class="account-avatar-image" src="${escapeAttribute(identity.avatarUrl)}" alt="${escapeAttribute(identity.displayName)}" />`;
    } else {
      avatarShell.innerHTML = `<div class="account-avatar-fallback">${escapeHtml(identity.initial)}</div>`;
    }
  }
}

function buildIdentitySnapshot(snapshot) {
  const identitySource = snapshot?.unauthorized ? snapshot.blockedUser : snapshot?.user;
  const signedIn = Boolean(snapshot?.signedIn && snapshot?.user && !snapshot?.unauthorized);
  const metadata = identitySource?.user_metadata || {};
  const displayName =
    identitySource?.displayName ||
    metadata.full_name ||
    metadata.name ||
    metadata.preferred_username ||
    metadata.user_name ||
    "Not signed in";
  const email = identitySource?.email || identitySource?.id || identitySource?.userId || "OAuth + Supabase";
  const avatarUrl = identitySource?.avatarUrl || metadata.avatar_url || "";
  const initial = String(displayName || email || "?").trim().charAt(0).toUpperCase() || "?";

  return {
    signedIn,
    unauthorized: Boolean(snapshot?.unauthorized),
    displayName,
    email,
    avatarUrl,
    initial,
  };
}

function getSyncStatusLabel(snapshot) {
  if (!snapshot?.configured) {
    return "Sync Off";
  }
  if (snapshot.unauthorized) {
    return "Restricted";
  }
  if (state.manualSyncInFlight || snapshot.syncing) {
    return "Syncing";
  }
  if (snapshot.syncError || state.manualSyncError) {
    return "Needs Attention";
  }
  if (snapshot.signedIn) {
    return "Connected";
  }
  return "Local Only";
}

function getSyncStatusMessage(snapshot) {
  if (!snapshot?.configured) {
    return "Sync disabled. Supabase is not configured.";
  }
  if (snapshot.unauthorized) {
    return snapshot.unauthorizedMessage || "This account is not authorized for sync.";
  }
  if (state.manualSyncInFlight || snapshot.syncing) {
    return "Syncing workspace data now.";
  }
  if (snapshot.syncError) {
    return `Sync failed: ${snapshot.syncError}`;
  }
  if (snapshot.signedIn) {
    if (snapshot.lastSyncedAt) {
      return `Last synced ${formatDateTime(snapshot.lastSyncedAt, SYNC_TIME_FORMAT)}`;
    }
    return "Connected. Automatic sync is ready.";
  }
  return "Sign in to sync likes and library settings across devices.";
}

function syncToggleButtons(selector, activeValue) {
  document.querySelectorAll(selector).forEach((button) => {
    const nextValue = getToggleValue(selector, button);
    const active = nextValue === activeValue;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function getToggleValue(selector, button) {
  if (selector === "[data-theme-toggle]") {
    return button.dataset.themeToggle || "auto";
  }
  if (selector === "[data-page-view-toggle]") {
    return button.dataset.pageViewToggle || "card";
  }
  if (selector === "[data-workspace-default-toggle]") {
    return button.dataset.workspaceDefaultToggle || "expanded";
  }
  if (selector === "[data-detail-panel-default-toggle]") {
    return button.dataset.detailPanelDefaultToggle || "collapsed";
  }
  return "";
}

function toggleQuickPanelPreference(key) {
  const normalizedKey = String(key || "").trim().toLowerCase();
  if (!ACCOUNT_PANEL_PREFERENCE_OPTIONS.includes(normalizedKey)) {
    return;
  }

  const currentPins = Array.isArray(state.userSettings.accountPanelPreferencePins)
    ? state.userSettings.accountPanelPreferencePins
    : DEFAULT_ACCOUNT_PANEL_PREFERENCE_PINS;
  const nextPins = currentPins.includes(normalizedKey)
    ? currentPins.filter((item) => item !== normalizedKey)
    : [...currentPins, normalizedKey];

  setAccountPanelPreferencePins(nextPins);
}

function syncQuickPanelButtons(activePins = []) {
  const activeSet = new Set(Array.isArray(activePins) ? activePins : []);
  document.querySelectorAll("[data-quick-panel-pin-toggle]").forEach((button) => {
    const key = String(button.dataset.quickPanelPinToggle || "").trim().toLowerCase();
    const active = activeSet.has(key);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function describeQuickPanelPreferences(pins = []) {
  const labels = (Array.isArray(pins) ? pins : [])
    .map((key) => QUICK_PANEL_PREFERENCE_LABELS[key] || "")
    .filter(Boolean);

  return labels.length ? labels.join(", ") : "None";
}

function renderFactCard({ label, value, meta, monospace = false }) {
  return `
    <article class="settings-fact-card">
      <span class="settings-fact-label">${escapeHtml(label)}</span>
      <strong class="settings-fact-value${monospace ? " is-monospace" : ""}">${escapeHtml(value)}</strong>
      <span class="settings-fact-meta">${escapeHtml(meta)}</span>
    </article>
  `;
}

function truncateMiddle(value, head = 8, tail = 6) {
  const normalized = String(value || "");
  if (!normalized) {
    return "-";
  }
  if (normalized.length <= head + tail + 1) {
    return normalized;
  }
  return `${normalized.slice(0, head)}...${normalized.slice(-tail)}`;
}

function renderFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (heroStatus) {
    heroStatus.textContent = "Error";
  }
  if (authStatus) {
    authStatus.textContent = `Failed to load settings: ${message}`;
  }
}
