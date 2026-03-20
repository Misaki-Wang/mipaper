import { escapeAttribute, escapeHtml } from "./ui_utils.js?v=e2da3b3a11";

const BRANCH_NAV_ITEMS = [
  { key: "hf", href: "./hf-daily.html", label: "HF" },
  { key: "cool", href: "./cool-daily.html", label: "Cool" },
  { key: "conference", href: "./conference.html", label: "Conf" },
  { key: "direct", href: "./direct-add.html", label: "Direct" },
  { key: "trending", href: "./trending.html", label: "Trend" },
];

const LIBRARY_NAV_ITEMS = [
  { key: "home", href: "./library.html", label: "Home" },
  { key: "later", href: "./queue.html", label: "Later" },
  { key: "liked", href: "./like.html", label: "Liked" },
  { key: "unread", href: "./unread-snapshots.html", label: "Unread" },
];

export function mountAppToolbar(rootOrSelector, config = {}) {
  const root = resolveRoot(rootOrSelector);
  if (!root) {
    return null;
  }
  root.innerHTML = renderAppToolbar(config);
  enhanceFilterSelects(root);
  return root;
}

export function renderAppToolbar({
  prefix,
  filtersTemplateId,
  showFilters = Boolean(filtersTemplateId),
  branchActiveKey = null,
  libraryActiveKey = null,
  quickAddTarget = "later",
  settingsHref = "./settings.html",
  settingsActive = false,
} = {}) {
  if (!prefix) {
    throw new Error("renderAppToolbar requires a prefix");
  }

  const filtersContent = getTemplateContent(filtersTemplateId);

  return `
    <header class="app-toolbar">
      <div class="toolbar-start">
        ${showFilters
          ? `
            <div class="filters-menu-shell" id="${escapeAttribute(prefix)}-filters-menu-shell">
              <button id="${escapeAttribute(prefix)}-sidebar-toggle" class="toolbar-filter-toggle" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Open filters">
                <span id="${escapeAttribute(prefix)}-sidebar-toggle-icon" class="toolbar-filter-icon">☰</span>
                <span id="${escapeAttribute(prefix)}-sidebar-toggle-label" class="toolbar-filter-label">Filters</span>
              </button>
              <aside id="${escapeAttribute(prefix)}-filters-menu" class="filters-menu-panel glass-card" hidden>
                <div id="${escapeAttribute(prefix)}-sidebar-stack" class="sidebar-stack">
                  ${filtersContent}
                </div>
              </aside>
            </div>
          `
          : ""}
        <div class="page-nav">
          ${renderNavDropdown("branch", "Branches", BRANCH_NAV_ITEMS, branchActiveKey)}
          ${renderNavDropdown("library", "Lib", LIBRARY_NAV_ITEMS, libraryActiveKey)}
        </div>
      </div>
      <div class="toolbar-center">
        ${renderToolbarQuickAdd(prefix, quickAddTarget)}
      </div>
      <div class="toolbar-end">
        ${renderToolbarAutoHide(prefix)}
        ${renderAccountMenu(prefix, { settingsHref, settingsActive })}
      </div>
    </header>
  `;
}

function renderNavDropdown(kind, label, items, activeKey) {
  const activeItem = items.find((item) => item.key === activeKey) || null;
  const dataAttr = kind === "branch" ? "data-branch-nav" : "data-library-nav";
  const toggleAttr = kind === "branch" ? "data-branch-nav-toggle" : "data-library-nav-toggle";
  const toggleLabelAttr = kind === "branch" ? "data-branch-nav-toggle-label" : "data-library-nav-toggle-label";
  const menuAttr = kind === "branch" ? "data-branch-nav-menu" : "data-library-nav-menu";
  const linkAttr = kind === "branch" ? "data-branch-nav-link" : "data-library-nav-link";

  return `
    <div class="page-nav-dropdown" ${dataAttr}>
      <button class="page-nav-link page-nav-dropdown-toggle" type="button" aria-expanded="false" aria-haspopup="menu" ${toggleAttr}>
        <span ${toggleLabelAttr}>${escapeHtml(activeItem ? activeItem.label : label)}</span>
        <span class="page-nav-dropdown-caret" aria-hidden="true">▾</span>
      </button>
      <div class="page-nav-dropdown-menu" hidden ${menuAttr}>
        ${items
          .map((item) => {
            const active = item.key === activeKey;
            return `<a class="page-nav-link${active ? " active" : ""}" href="${escapeAttribute(item.href)}" ${linkAttr}${active ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderToolbarAutoHide(prefix) {
  const id = `${escapeAttribute(prefix)}-toolbar-autohide-toggle`;
  return `
    <button id="${id}" class="toolbar-autohide-toggle" type="button" aria-pressed="true" aria-label="Disable auto-hide toolbar" title="Disable auto-hide toolbar">
      <span class="toolbar-autohide-icon" aria-hidden="true">
        <svg class="toolbar-autohide-svg" viewBox="0 0 24 24" fill="none">
          <path class="toolbar-autohide-lock-body" d="M6.2 10.6h11.6A1.2 1.2 0 0 1 19 11.8v5.2a1.2 1.2 0 0 1-1.2 1.2H6.2A1.2 1.2 0 0 1 5 17V11.8a1.2 1.2 0 0 1 1.2-1.2Z" />
          <g class="toolbar-autohide-lock-state">
            <path class="toolbar-autohide-lock-shackle" d="M8 10.6V8.3a4 4 0 0 1 8 0v2.3" />
          </g>
          <g class="toolbar-autohide-unlock-state">
            <path class="toolbar-autohide-unlock-shackle" d="M8 10.6V8.2a4 4 0 0 1 6.1-3.4" />
          </g>
        </svg>
      </span>
    </button>
  `;
}

function renderToolbarQuickAdd(prefix, target) {
  const safePrefix = escapeAttribute(prefix);
  const safeTarget = escapeAttribute(target);
  return `
    <div class="toolbar-quick-add-shell" data-quick-add-target="${safeTarget}">
      <form id="${safePrefix}-quick-add-form" class="toolbar-quick-add" novalidate>
        <div class="toolbar-quick-add-control">
          <span class="toolbar-quick-add-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20" fill="none">
              <path d="M6 10h8M10 6v8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </span>
          <input
            id="${safePrefix}-quick-add-input"
            class="toolbar-quick-add-input"
            type="text"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="Paste arXiv / papers.cool URL"
            aria-label="Paste arXiv or papers.cool URL to add to Later"
            aria-describedby="${safePrefix}-quick-add-status"
          />
          <button id="${safePrefix}-quick-add-submit" class="toolbar-quick-add-submit" type="submit">Add</button>
        </div>
      </form>
      <p id="${safePrefix}-quick-add-status" class="toolbar-quick-add-status" aria-live="polite" hidden></p>
    </div>
  `;
}

function renderAccountMenu(prefix, { settingsHref = "./settings.html", settingsActive = false } = {}) {
  const safePrefix = escapeAttribute(prefix);
  const safeSettingsHref = escapeAttribute(settingsHref);
  return `
    <div class="account-menu-shell" id="${safePrefix}-account-menu-shell">
      <button id="${safePrefix}-account-menu-toggle" class="account-menu-toggle" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Sync account" title="Sync account">
        <span id="${safePrefix}-account-trigger-avatar" class="account-menu-avatar" aria-hidden="true">
          <span class="account-avatar-fallback">?</span>
        </span>
      </button>
      <div id="${safePrefix}-sync-menu" class="account-menu-panel" hidden>
        <section class="account-panel-section account-panel-preferences" data-account-preferences-section aria-label="Display preferences">
          <div class="account-panel-preference" data-account-preference-option="theme">
            <span class="account-panel-preference-label">Theme</span>
            <div class="hero-actions toolbar-theme-switch account-panel-switch">
              <button class="pill-button active" type="button" data-theme-toggle="auto" aria-pressed="true">Auto</button>
              <button class="pill-button" type="button" data-theme-toggle="light" aria-pressed="false">Day</button>
              <button class="pill-button" type="button" data-theme-toggle="dark" aria-pressed="false">Night</button>
            </div>
          </div>
          <div class="account-panel-preference" data-account-preference-option="view">
            <span class="account-panel-preference-label">View</span>
            <div class="section-view-toggle toolbar-view-switch" role="tablist" aria-label="Page view mode">
              <button class="pill-button" type="button" data-page-view-toggle="card" aria-pressed="true">Gallery</button>
              <button class="pill-button" type="button" data-page-view-toggle="list" aria-pressed="false">List</button>
            </div>
          </div>
          <div class="account-panel-preference" data-account-preference-option="toolbar">
            <span class="account-panel-preference-label">Toolbar</span>
            <div class="section-view-toggle toolbar-view-switch" role="tablist" aria-label="Toolbar auto-hide mode">
              <button class="pill-button" type="button" data-toolbar-autohide-mode-toggle="enabled" aria-pressed="true">Auto</button>
              <button class="pill-button" type="button" data-toolbar-autohide-mode-toggle="disabled" aria-pressed="false">Pinned</button>
            </div>
          </div>
          <div class="account-panel-preference" data-account-preference-option="workspace">
            <span class="account-panel-preference-label">Workspace</span>
            <div class="section-view-toggle toolbar-view-switch" role="tablist" aria-label="Workspace default panel state">
              <button class="pill-button" type="button" data-workspace-default-toggle="expanded" aria-pressed="true">Expanded</button>
              <button class="pill-button" type="button" data-workspace-default-toggle="collapsed" aria-pressed="false">Collapsed</button>
            </div>
          </div>
          <div class="account-panel-preference" data-account-preference-option="details">
            <span class="account-panel-preference-label">Details</span>
            <div class="section-view-toggle toolbar-view-switch" role="tablist" aria-label="Details default panel state">
              <button class="pill-button" type="button" data-detail-panel-default-toggle="expanded" aria-pressed="false">Expanded</button>
              <button class="pill-button active" type="button" data-detail-panel-default-toggle="collapsed" aria-pressed="true">Collapsed</button>
            </div>
          </div>
        </section>
        <div id="${safePrefix}-account-card" class="account-card is-empty">
          <div class="account-avatar-shell" aria-hidden="true">
            <div class="account-avatar-fallback">?</div>
          </div>
          <div class="account-card-copy">
            <strong class="account-card-name">Not signed in</strong>
            <span class="account-card-email">OAuth + Supabase</span>
          </div>
        </div>
        <div id="${safePrefix}-auth-warning" class="auth-warning" hidden></div>
        <p id="${safePrefix}-auth-status" class="auth-status">Supabase is not configured. Sync is currently disabled.</p>
        <div class="auth-actions">
          <button id="${safePrefix}-auth-button" class="link-chip button-link" type="button">Sign in</button>
          <button id="${safePrefix}-sync-now" class="link-chip button-link" type="button">Sync now</button>
        </div>
        <div class="account-settings-row">
          <a
            id="${safePrefix}-settings-link"
            class="link-chip button-link account-settings-link${settingsActive ? " active" : ""}"
            href="${safeSettingsHref}"
            ${settingsActive ? 'aria-current="page"' : ""}
          >Settings</a>
        </div>
      </div>
    </div>
  `;
}

function getTemplateContent(templateId) {
  if (!templateId) {
    return "";
  }
  const template = document.getElementById(templateId);
  return template ? template.innerHTML.trim() : "";
}

function resolveRoot(rootOrSelector) {
  if (!rootOrSelector) {
    return null;
  }
  if (typeof rootOrSelector === "string") {
    return document.querySelector(rootOrSelector);
  }
  return rootOrSelector;
}

function enhanceFilterSelects(root) {
  const selects = root.querySelectorAll(".filters-menu-panel .control-block > select.control-input");
  selects.forEach((select) => {
    if (select.parentElement?.classList.contains("filter-select-shell")) {
      return;
    }
    const shell = document.createElement("div");
    shell.className = "filter-select-shell";
    select.parentNode.insertBefore(shell, select);
    shell.appendChild(select);
  });
}
