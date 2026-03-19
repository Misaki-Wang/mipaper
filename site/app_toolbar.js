const BRANCH_NAV_ITEMS = [
  { key: "hf", href: "./index.html", label: "HF" },
  { key: "cool", href: "./cool-daily.html", label: "Cool" },
  { key: "conference", href: "./conference.html", label: "Conf" },
  { key: "trending", href: "./trending.html", label: "Trend" },
];

const LIBRARY_NAV_ITEMS = [
  { key: "liked", href: "./like.html", label: "Liked" },
  { key: "later", href: "./queue.html", label: "Later" },
  { key: "unread", href: "./unread-snapshots.html", label: "Unread" },
];

export function mountAppToolbar(rootOrSelector, config = {}) {
  const root = resolveRoot(rootOrSelector);
  if (!root) {
    return null;
  }
  root.innerHTML = renderAppToolbar(config);
  return root;
}

export function renderAppToolbar({
  prefix,
  filtersTemplateId,
  branchActiveKey = null,
  libraryActiveKey = null,
} = {}) {
  if (!prefix) {
    throw new Error("renderAppToolbar requires a prefix");
  }

  const filtersContent = getTemplateContent(filtersTemplateId);

  return `
    <header class="app-toolbar">
      <div class="toolbar-start">
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
        <div class="page-nav">
          ${renderNavDropdown("branch", "Branches", BRANCH_NAV_ITEMS, branchActiveKey)}
          ${renderNavDropdown("library", "Lib", LIBRARY_NAV_ITEMS, libraryActiveKey)}
        </div>
      </div>
      <div class="toolbar-end">
        ${renderToolbarAutoHide(prefix)}
        <div class="hero-actions toolbar-theme-switch">
          <button class="pill-button active" type="button" data-theme-toggle="auto">Auto</button>
          <button class="pill-button" type="button" data-theme-toggle="light">Day</button>
          <button class="pill-button" type="button" data-theme-toggle="dark">Night</button>
        </div>
        ${renderAccountMenu(prefix)}
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

function renderAccountMenu(prefix) {
  const safePrefix = escapeAttribute(prefix);
  return `
    <div class="account-menu-shell" id="${safePrefix}-account-menu-shell">
      <button id="${safePrefix}-account-menu-toggle" class="account-menu-toggle" type="button" aria-expanded="false" aria-haspopup="menu" aria-label="Sync account" title="Sync account">
        <span id="${safePrefix}-account-trigger-avatar" class="account-menu-avatar" aria-hidden="true">
          <span class="account-avatar-fallback">?</span>
        </span>
      </button>
      <div id="${safePrefix}-sync-menu" class="account-menu-panel" hidden>
        <div id="${safePrefix}-account-card" class="account-card is-empty">
          <div class="account-avatar-shell" aria-hidden="true">
            <div class="account-avatar-fallback">?</div>
          </div>
          <div class="account-card-copy">
            <strong class="account-card-name">Not signed in</strong>
            <span class="account-card-email">GitHub + Supabase</span>
          </div>
        </div>
        <div id="${safePrefix}-auth-warning" class="auth-warning" hidden></div>
        <p id="${safePrefix}-auth-status" class="auth-status">Supabase is not configured. Sync is currently disabled.</p>
        <div class="auth-actions">
          <button id="${safePrefix}-sign-in" class="link-chip button-link" type="button">GitHub Sign in</button>
          <button id="${safePrefix}-sync-now" class="link-chip button-link" type="button">Sync now</button>
          <button id="${safePrefix}-sign-out" class="link-chip button-link" type="button">Sign out</button>
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
