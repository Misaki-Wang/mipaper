import {
  bindLikeButtons,
  getAuthSnapshot,
  getSourceLabel,
  initLikesSync,
  readLikes,
  signInWithGitHub,
  signOutFromGitHub,
  subscribeAuth,
  subscribeLikes,
  syncLikesNow,
} from "./likes.js";
import { getSupabaseClient, isAuthorizedUser, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js";
import { createPageReviewKey, initReviewSync, isPageReviewed, subscribePageReviews } from "./reading_state.js";
import { bindQueueButtons, initQueue, readQueue, subscribeQueue } from "./paper_queue.js";

const state = {
  likes: [],
  snapshots: [],
  source: "",
  year: "",
  month: "",
  day: "",
  topic: "",
  query: "",
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);

const sourceFilter = document.querySelector("#like-source-filter");
const yearFilter = document.querySelector("#like-year-filter");
const monthFilter = document.querySelector("#like-month-filter");
const dayFilter = document.querySelector("#like-day-filter");
const topicFilter = document.querySelector("#like-topic-filter");
const searchInput = document.querySelector("#like-search-input");
const resetFiltersButton = document.querySelector("#like-reset-filters");
const sidebarToggleButton = document.querySelector("#like-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#like-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#like-sidebar-toggle-icon");
const layoutRoot = document.querySelector(".layout");
const backToTopButton = document.querySelector("#like-back-to-top");
const likeRecords = new Map();
const authStatus = document.querySelector("#like-auth-status");
const signInButton = document.querySelector("#like-sign-in");
const signOutButton = document.querySelector("#like-sign-out");
const syncNowButton = document.querySelector("#like-sync-now");
const accountBanner = document.querySelector("#like-current-account");
const accountCard = document.querySelector("#like-account-card");
const authWarning = document.querySelector("#like-auth-warning");
let toReadSyncPromise = null;

const LATER_PAGE_SIZE = 6;
let laterPage = 0;
const TO_READ_PAGE_SIZE = 6;
let toReadPage = 0;
const BRANCH_PAGE_SIZE = 6;
const branchPages = new Map();

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  bindThemeToggle();
  bindSidebarToggle();
  bindBackToTop();
  bindFilters();
  bindAuthActions();
  subscribeAuth((snapshot) => {
    renderAuthState(snapshot);
    if (snapshot.configured && snapshot.signedIn && snapshot.authorized) {
      scheduleToReadSnapshotSync();
    }
  });
  subscribeLikes((likes) => {
    state.likes = likes;
    renderPage();
  });
  subscribeQueue(() => renderPage());
  subscribePageReviews(() => {
    renderPage();
    scheduleToReadSnapshotSync();
  });
  await Promise.all([initLikesSync(), initReviewSync(), initQueue()]);
  state.snapshots = await loadSnapshotQueueData();
  state.likes = readLikes();
  renderPage();
  scheduleToReadSnapshotSync();
}

function bindThemeToggle() {
  const toggles = [...document.querySelectorAll("[data-theme-toggle]")];
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const initial = localStorage.getItem("cool-paper-theme") || "auto";
  applyTheme(initial);

  toggles.forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.themeToggle));
  });

  const handleSystemThemeChange = () => {
    const current = localStorage.getItem("cool-paper-theme") || "auto";
    if (current === "auto") {
      applyTheme("auto", false);
    }
  };

  if (typeof systemQuery.addEventListener === "function") {
    systemQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof systemQuery.addListener === "function") {
    systemQuery.addListener(handleSystemThemeChange);
  }

  function applyTheme(mode, persist = true) {
    const resolvedTheme = mode === "auto" ? (systemQuery.matches ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = mode;
    if (persist) {
      localStorage.setItem("cool-paper-theme", mode);
    }
    toggles.forEach((button) => button.classList.toggle("active", button.dataset.themeToggle === mode));
  }
}

function bindSidebarToggle() {
  const initial = localStorage.getItem("cool-paper-sidebar") || "expanded";
  applySidebarState(initial === "collapsed");

  sidebarToggleButton.addEventListener("click", () => {
    const collapsed = !layoutRoot.classList.contains("sidebar-collapsed");
    applySidebarState(collapsed);
  });
}

function applySidebarState(collapsed) {
  layoutRoot.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggleButton.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggleButton.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  sidebarToggleButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
  sidebarToggleLabel.textContent = collapsed ? "Expand" : "Collapse";
  sidebarToggleIcon.textContent = collapsed ? "›" : "‹";
  localStorage.setItem("cool-paper-sidebar", collapsed ? "collapsed" : "expanded");
}

function bindBackToTop() {
  const threshold = 720;

  function updateVisibility() {
    const visible = window.scrollY > threshold;
    backToTopButton.classList.toggle("is-visible", visible);
    backToTopButton.setAttribute("aria-hidden", String(!visible));
  }

  backToTopButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
}

function bindFilters() {
  sourceFilter.addEventListener("change", (event) => {
    state.source = event.target.value;
    renderPage();
  });

  yearFilter.addEventListener("change", (event) => {
    state.year = event.target.value;
    state.month = "";
    state.day = "";
    renderPage();
  });

  monthFilter.addEventListener("change", (event) => {
    state.month = event.target.value;
    state.day = "";
    if (state.month) {
      state.year = state.month.slice(0, 4);
    }
    renderPage();
  });

  dayFilter.addEventListener("change", (event) => {
    state.day = event.target.value;
    if (state.day) {
      state.month = state.day.slice(0, 7);
      state.year = state.day.slice(0, 4);
    }
    renderPage();
  });

  topicFilter.addEventListener("change", (event) => {
    state.topic = event.target.value;
    renderPage();
  });

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderPage();
  });

  resetFiltersButton.addEventListener("click", () => {
    state.source = "";
    state.year = "";
    state.month = "";
    state.day = "";
    state.topic = "";
    state.query = "";
    sourceFilter.value = "";
    yearFilter.value = "";
    monthFilter.value = "";
    dayFilter.value = "";
    topicFilter.value = "";
    searchInput.value = "";
    renderPage();
  });
}

function bindAuthActions() {
  signInButton.addEventListener("click", async () => {
    authStatus.textContent = "Redirecting to GitHub sign-in. Likes will sync automatically when you return.";
    await signInWithGitHub();
  });

  signOutButton.addEventListener("click", async () => {
    await signOutFromGitHub();
  });

  syncNowButton.addEventListener("click", async () => {
    try {
      syncNowButton.disabled = true;
      await syncLikesNow();
    } catch (error) {
      console.error(error);
      authStatus.textContent = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      syncNowButton.disabled = false;
      renderAuthState(getAuthSnapshot());
    }
  });
}

function renderAuthState(snapshot) {
  renderAccountIdentity(snapshot);
  renderUnauthorizedState(snapshot);
  if (!snapshot.configured) {
    authStatus.textContent = "Supabase is not configured. Sync is currently disabled.";
    signInButton.disabled = true;
    signOutButton.disabled = true;
    syncNowButton.disabled = true;
    return;
  }

  signInButton.disabled = snapshot.signedIn;
  signOutButton.disabled = !snapshot.signedIn;
  syncNowButton.disabled = !snapshot.signedIn || snapshot.syncing || snapshot.unauthorized;
  if (snapshot.unauthorized) {
    authStatus.textContent = snapshot.unauthorizedMessage || "The current account is not authorized to use Like.";
    signInButton.disabled = false;
    signOutButton.disabled = true;
    return;
  }
  authStatus.textContent = snapshot.signedIn
    ? buildSignedInStatus(snapshot)
    : "Supabase is configured. Click GitHub Sign in to sync likes across devices.";
}

function buildSignedInStatus(snapshot) {
  const account = snapshot.user?.email || snapshot.user?.id || "-";
  if (snapshot.syncing) {
    return `Connected GitHub account ${account}, automatically syncing likes to Supabase.`;
  }
  if (snapshot.syncError) {
    return `Connected GitHub account ${account}, automatic sync failed: ${snapshot.syncError}`;
  }
  if (snapshot.lastSyncedAt) {
    return `Connected GitHub account ${account}, likes synced automatically. Last synced ${formatTime(snapshot.lastSyncedAt)}。`;
  }
  return `Connected GitHub account ${account}, likes will sync to Supabase automatically after sign-in.`;
}

function renderAccountIdentity(snapshot) {
  const identitySource = snapshot.unauthorized ? snapshot.blockedUser : snapshot.user;
  const signedIn = Boolean(snapshot.signedIn && snapshot.user && !snapshot.unauthorized);
  const metadata = identitySource?.user_metadata || {};
  const displayName =
    identitySource?.displayName ||
    metadata.full_name ||
    metadata.name ||
    metadata.preferred_username ||
    metadata.user_name ||
    "Not signed in";
  const email = identitySource?.email || identitySource?.id || identitySource?.userId || "Connect a GitHub account first";
  const avatarUrl = identitySource?.avatarUrl || metadata.avatar_url || "";

  const bannerValue = accountBanner?.querySelector(".account-banner-value");
  if (accountBanner && bannerValue) {
    accountBanner.classList.toggle("muted", !signedIn && !snapshot.unauthorized);
    accountBanner.classList.toggle("is-unauthorized", Boolean(snapshot.unauthorized));
    bannerValue.textContent = snapshot.unauthorized ? `Unauthorized · ${email}` : signedIn ? `${displayName} · ${email}` : "Not signed in";
  }

  if (!accountCard) {
    return;
  }

  accountCard.classList.toggle("is-empty", !signedIn && !snapshot.unauthorized);
  accountCard.classList.toggle("is-unauthorized", Boolean(snapshot.unauthorized));
  const avatarShell = accountCard.querySelector(".account-avatar-shell");
  const nameNode = accountCard.querySelector(".account-card-name");
  const emailNode = accountCard.querySelector(".account-card-email");
  if (nameNode) {
    nameNode.textContent = snapshot.unauthorized ? `Unauthorized account · ${displayName}` : displayName;
  }
  if (emailNode) {
    emailNode.textContent = email;
  }
  if (!avatarShell) {
    return;
  }

  const initial = String(displayName || email || "?").trim().charAt(0).toUpperCase() || "?";
  if (signedIn && avatarUrl) {
    avatarShell.innerHTML = `<img class="account-avatar-image" src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(
      displayName
    )}" />`;
    return;
  }

  avatarShell.innerHTML = `<div class="account-avatar-fallback">${escapeHtml(initial)}</div>`;
}

function renderUnauthorizedState(snapshot) {
  if (!authWarning) {
    return;
  }
  if (!snapshot.unauthorized) {
    authWarning.hidden = true;
    authWarning.textContent = "";
    return;
  }
  authWarning.hidden = false;
  authWarning.textContent = snapshot.unauthorizedMessage || "The current account is not on the allowlist. Like access is restricted.";
}

function renderPage() {
  try {
    const likes = readLikes();
    state.likes = likes;
    const laterQueue = readQueue("later");
    const toReadSnapshots = getToReadSnapshots(state.snapshots);
    populateFilters(likes, laterQueue, toReadSnapshots);
    renderHero(likes, laterQueue, toReadSnapshots);
    renderSourceCards(likes, laterQueue, toReadSnapshots);

    likeRecords.clear();
    renderLaterQueue(laterQueue);
    renderToReadList(toReadSnapshots);

    if (!likes.length) {
      renderEmpty(toReadSnapshots);
      bindQueueButtons(document, likeRecords);
      return;
    }

    const visibleLikes = getVisibleLikes(likes);
    const topicDistribution = computeTopicDistribution(visibleLikes);
    const sourceSections = groupBySource(visibleLikes);

    renderOverview(likes, visibleLikes, sourceSections, toReadSnapshots);
    renderTagMap(likes, topicDistribution);
    renderDistribution(topicDistribution);
    renderResults(likes, visibleLikes, sourceSections);
    renderSourceSections(sourceSections);
    bindLikeButtons(document, likeRecords);
    bindQueueButtons(document, likeRecords);
  } catch (error) {
    console.error('renderPage failed:', error);
  }
}

function populateFilters(likes, laterQueue, toReadSnapshots) {
  const currentSource = state.source;
  const currentYear = state.year;
  const currentMonth = state.month;
  const currentDay = state.day;
  const currentTopic = state.topic;
  const sources = [...new Set([
    ...likes.map((item) => item.source_kind),
    ...laterQueue.map((item) => item.source_kind),
    ...toReadSnapshots.map(getSnapshotSourceKind),
  ].filter(Boolean))];
  const topics = [...new Set(likes.map((item) => item.topic_label || "Other AI"))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const dateParts = likes.map(extractDateParts);
  const years = [...new Set(dateParts.map((item) => item.year).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const months = [...new Set(
    dateParts
      .filter((item) => item.month && (!currentYear || item.year === currentYear))
      .map((item) => item.month)
  )].sort((a, b) => b.localeCompare(a));
  const days = [...new Set(
    dateParts
      .filter((item) => {
        if (!item.day) {
          return false;
        }
        if (currentMonth) {
          return item.month === currentMonth;
        }
        if (currentYear) {
          return item.year === currentYear;
        }
        return true;
      })
      .map((item) => item.day)
  )].sort((a, b) => b.localeCompare(a));

  sourceFilter.innerHTML = [
    `<option value="">All Branches</option>`,
    ...sources.map((source) => `<option value="${escapeAttribute(source)}">${escapeHtml(getSourceLabel(source))}</option>`),
  ].join("");
  yearFilter.innerHTML = [
    `<option value="">All Years</option>`,
    ...years.map((year) => `<option value="${escapeAttribute(year)}">${escapeHtml(year)}</option>`),
  ].join("");
  monthFilter.innerHTML = [
    `<option value="">All Months</option>`,
    ...months.map((month) => `<option value="${escapeAttribute(month)}">${escapeHtml(month)}</option>`),
  ].join("");
  dayFilter.innerHTML = [
    `<option value="">All Days</option>`,
    ...days.map((day) => `<option value="${escapeAttribute(day)}">${escapeHtml(day)}</option>`),
  ].join("");
  topicFilter.innerHTML = [
    `<option value="">All Topics</option>`,
    ...topics.map((topic) => `<option value="${escapeAttribute(topic)}">${escapeHtml(topic)}</option>`),
  ].join("");

  sourceFilter.value = sources.includes(currentSource) ? currentSource : "";
  yearFilter.value = years.includes(currentYear) ? currentYear : "";
  monthFilter.value = months.includes(currentMonth) ? currentMonth : "";
  dayFilter.value = days.includes(currentDay) ? currentDay : "";
  topicFilter.value = topics.includes(currentTopic) ? currentTopic : "";
  state.source = sourceFilter.value;
  state.year = yearFilter.value;
  state.month = monthFilter.value;
  state.day = dayFilter.value;
  state.topic = topicFilter.value;
}

function renderHero(likes, laterQueue, toReadSnapshots) {
  const topTopic = computeTopicDistribution(likes)[0];
  const focusCount = likes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const sources = new Set([
    ...likes.map((item) => item.source_kind),
    ...laterQueue.map((item) => item.source_kind),
    ...toReadSnapshots.map(getSnapshotSourceKind),
  ].filter(Boolean));
  const latest = likes[0];

  document.querySelector("#like-hero-count").textContent =
    likes.length || laterQueue.length || toReadSnapshots.length
      ? `${likes.length} saved / ${laterQueue.length} later`
      : "0 items";
  document.querySelector("#like-hero-sources").textContent = String(sources.size);
  document.querySelector("#like-hero-focus").textContent = String(laterQueue.length);
  document.querySelector("#like-hero-latest").textContent = String(toReadSnapshots.length);
  document.querySelector("#like-hero-topic").textContent = topTopic?.topic_label || "-";

  document.querySelector("#like-hero-signals").innerHTML = [
    topTopic ? `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(topTopic.topic_label)}</strong></div>` : "",
    likes.length ? `<div class="signal-chip"><span>Saved Papers</span><strong>${likes.length}</strong></div>` : "",
    laterQueue.length ? `<div class="signal-chip"><span>Later Queue</span><strong>${laterQueue.length}</strong></div>` : "",
    toReadSnapshots.length ? `<div class="signal-chip"><span>To-Read</span><strong>${toReadSnapshots.length}</strong></div>` : "",
    latest ? `<div class="signal-chip"><span>Latest Save</span><strong>${escapeHtml(getSourceLabel(latest.source_kind))}</strong></div>` : "",
  ]
    .filter(Boolean)
    .join("");
}

function renderSourceCards(likes, laterQueue, toReadSnapshots) {
  const root = document.querySelector("#like-home-cards");
  const summary = document.querySelector("#like-board-summary");
  const sections = buildLibrarySourceSections(likes, laterQueue, toReadSnapshots);

  if (!sections.length) {
    summary.textContent = "No library activity yet.";
    root.innerHTML = `<div class="empty-state">Sources will appear here after you save papers, add Later items, or accumulate unread snapshots.</div>`;
    return;
  }

  summary.textContent = `Tracking ${likes.length} saved papers, ${laterQueue.length} Later items, and ${toReadSnapshots.length} unread snapshots across ${sections.length} branches.`;
  root.innerHTML = sections
    .map(
      (section) => `
        <button class="home-category-card library-home-card${state.source === section.source_kind ? " active" : ""}" type="button" data-like-source="${escapeAttribute(section.source_kind)}">
          <div class="home-category-card-top">
            <span class="home-category-label">${escapeHtml(section.source_label)}</span>
            <span class="home-category-date">${escapeHtml(section.latest_snapshot || "Workspace source")}</span>
          </div>
          <strong class="home-category-count">${section.saved_count} saved</strong>
          <p class="home-category-topic">${escapeHtml(section.lede)}</p>
          <div class="library-source-metrics">
            <span><strong>${section.saved_count}</strong><small>Saved</small></span>
            <span><strong>${section.later_count}</strong><small>Later</small></span>
            <span><strong>${section.to_read_count}</strong><small>To-Read</small></span>
          </div>
          <div class="home-category-meta">
            <span>${escapeHtml(section.top_topic || "No topic summary")}</span>
            <span>${escapeHtml(section.latest_saved || section.latest_snapshot || "-")}</span>
          </div>
        </button>
      `
    )
    .join("");

  root.querySelectorAll("[data-like-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.likeSource;
      state.source = state.source === next ? "" : next;
      sourceFilter.value = state.source;
      renderPage();
    });
  });
}

function renderOverview(likes, visibleLikes, sourceSections, toReadSnapshots) {
  const focusCount = visibleLikes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const focusShare = visibleLikes.length ? (focusCount / visibleLikes.length) * 100 : 0;
  const latest = visibleLikes[0] || likes[0];
  const topSource = sourceSections[0];

  document.querySelector("#like-overview-title").textContent = "Library Overview";
  document.querySelector("#like-overview-summary").textContent = `Currently saved: ${visibleLikes.length} papers for later deep reading and revisit. ${toReadSnapshots.length} fetched snapshots are still not reviewed.`;
  document.querySelector("#like-focus-summary").textContent = `${focusCount} papers hit your focus topics, accounting for ${focusShare.toFixed(2)}% of the current view.`;
  document.querySelector("#like-branch-summary").textContent = topSource
    ? `${escapeHtml(topSource.source_label)} currently has the most likes, with ${topSource.count} papers.`
    : "No visible branches yet.";
  document.querySelector("#like-latest-summary").textContent = latest
    ? `${formatTime(latest.saved_at)} saved from ${escapeHtml(getSourceLabel(latest.source_kind))}.`
    : "No latest save record yet.";
}

function renderTagMap(likes, topicDistribution) {
  const topTopic = topicDistribution[0]?.topic_label || "Other AI";
  const activeDate = state.day || state.month || state.year || (findLatestReportedDate(likes) || "No report date");
  document.querySelector("#like-tag-map").innerHTML = [
    {
      label: "Branch",
      value: state.source ? getSourceLabel(state.source) : "All branches",
      meta: state.source ? "current filtered branch" : "all liked sources",
    },
    {
      label: "Date",
      value: activeDate,
      meta: state.day ? "current day filter" : state.month ? "current month filter" : state.year ? "current year filter" : "latest report date",
    },
    {
      label: "Topic",
      value: state.topic || topTopic,
      meta: state.topic ? "current filtered topic" : "current dominant topic",
    },
    {
      label: "Search",
      value: state.query || "No query",
      meta: state.query ? "current search query" : "search disabled",
    },
  ]
    .map(
      (item) => `
        <article class="tag-card">
          <span class="tag-card-label">${escapeHtml(item.label)}</span>
          <strong class="tag-card-value">${escapeHtml(item.value)}</strong>
          <span class="tag-card-meta">${escapeHtml(item.meta)}</span>
        </article>
      `
    )
    .join("");
}

function renderLaterQueue(laterQueue) {
  const summary = document.querySelector("#like-later-summary");
  const root = document.querySelector("#like-later-list");

  if (!laterQueue.length) {
    summary.textContent = "No papers in Later queue.";
    root.innerHTML = `<div class="empty-state">Papers marked as Later will appear here.</div>`;
    document.querySelector("#like-later-pagination").innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(laterQueue.length / LATER_PAGE_SIZE);
  laterPage = Math.min(laterPage, totalPages - 1);
  const start = laterPage * LATER_PAGE_SIZE;
  const pageItems = laterQueue.slice(start, start + LATER_PAGE_SIZE);

  summary.textContent = `${laterQueue.length} papers marked for later reading.`;

  const cardsHtml = pageItems
    .map((paper) => {
      likeRecords.set(paper.like_id, {
        paper: paper,
        context: {
          sourceKind: paper.source_kind,
          sourceLabel: paper.source_label,
          sourcePage: paper.source_page,
          snapshotLabel: paper.snapshot_label,
        }
      });
      return `
        <article class="spotlight-card">
          <div class="spotlight-meta">
            <span class="paper-badge">${escapeHtml(paper.topic_label || "Other AI")}</span>
            <span class="paper-badge subdued">${escapeHtml(getSourceLabel(paper.source_kind))}</span>
          </div>
          <h3>${escapeHtml(paper.title)}</h3>
          <div class="paper-authors-box">
            <span class="paper-detail-label">Authors</span>
            <p class="paper-authors-line">${escapeHtml(paper.authors?.join(", ") || "Unknown")}</p>
          </div>
          ${paper.abstract ? `
          <details class="paper-abstract">
            <summary>
              <span class="paper-abstract-label">Abstract</span>
              <span class="paper-abstract-arrow" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="14" height="14">
                  <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
              </span>
            </summary>
            <p>${escapeHtml(paper.abstract)}</p>
          </details>
          ` : ""}
          <div class="spotlight-links">
            ${paper.pdf_url ? `<a class="paper-link brand-arxiv" href="${escapeAttribute(paper.pdf_url)}" target="_blank" rel="noreferrer">arXiv</a>` : ""}
            ${paper.detail_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(paper.detail_url)}" target="_blank" rel="noreferrer">Cool</a>` : ""}
            <button class="paper-link later-button is-later" type="button" data-later-id="${escapeAttribute(paper.like_id)}" aria-pressed="true">
              <span class="paper-link-icon later-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
              </span>
              <span class="paper-link-text">Later</span>
            </button>
            <button class="paper-link like-button" type="button" data-like-id="${escapeAttribute(paper.like_id)}" aria-pressed="false">
              <span class="paper-link-icon like-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path d="M10 16.3l-5.26-4.98A3.8 3.8 0 0 1 10 5.9a3.8 3.8 0 0 1 5.26 5.42z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="paper-link-text">Like</span>
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  root.innerHTML = cardsHtml;

  const pagRoot = document.querySelector("#like-later-pagination");
  pagRoot.innerHTML = totalPages > 1
    ? `<div class="pagination">
        <button class="pill-button" data-later-page="prev" ${laterPage === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="pagination-info">${laterPage + 1} / ${totalPages}</span>
        <button class="pill-button" data-later-page="next" ${laterPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
      </div>`
    : "";

  pagRoot.querySelectorAll("[data-later-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.laterPage === "prev" && laterPage > 0) laterPage--;
      else if (btn.dataset.laterPage === "next" && laterPage < totalPages - 1) laterPage++;
      renderLaterQueue(laterQueue);
      bindLikeButtons(document, likeRecords);
      bindQueueButtons(document, likeRecords);
    });
  });
}

function renderToReadList(toReadSnapshots) {
  const summary = document.querySelector("#like-to-read-summary");
  const root = document.querySelector("#like-to-read-list");

  if (!toReadSnapshots.length) {
    summary.textContent = "Every fetched snapshot has been reviewed.";
    root.innerHTML = `<div class="empty-state">No unread snapshots remain in your queue.</div>`;
    document.querySelector("#like-to-read-pagination").innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(toReadSnapshots.length / TO_READ_PAGE_SIZE);
  toReadPage = Math.min(toReadPage, totalPages - 1);
  const start = toReadPage * TO_READ_PAGE_SIZE;
  const pageItems = toReadSnapshots.slice(start, start + TO_READ_PAGE_SIZE);

  summary.textContent = `${toReadSnapshots.length} fetched snapshots are currently in your queue because they are not reviewed.`;

  const cardsHtml = pageItems
    .map(
      (snapshot) => `
        <article class="spotlight-card">
          <div class="spotlight-meta">
            <span>${escapeHtml(snapshot.branch_label)}</span>
            <span>${escapeHtml(snapshot.snapshot_label)}</span>
          </div>
          <h3>${escapeHtml(snapshot.title)}</h3>
          <p>${escapeHtml(snapshot.summary)}</p>
          <div class="spotlight-links">
            <a class="paper-link" href="${escapeAttribute(snapshot.branch_url)}">${escapeHtml(snapshot.branch_label)}</a>
            ${snapshot.source_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(snapshot.source_url)}" target="_blank" rel="noreferrer">Source</a>` : ""}
          </div>
        </article>
      `
    )
    .join("");

  root.innerHTML = cardsHtml;

  const pagRoot = document.querySelector("#like-to-read-pagination");
  pagRoot.innerHTML = totalPages > 1
    ? `<div class="pagination">
        <button class="pill-button" data-to-read-page="prev" ${toReadPage === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="pagination-info">${toReadPage + 1} / ${totalPages}</span>
        <button class="pill-button" data-to-read-page="next" ${toReadPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
      </div>`
    : "";

  pagRoot.querySelectorAll("[data-to-read-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.toReadPage === "prev" && toReadPage > 0) toReadPage--;
      else if (btn.dataset.toReadPage === "next" && toReadPage < totalPages - 1) toReadPage++;
      renderToReadList(toReadSnapshots);
    });
  });
}

function renderDistribution(distribution) {
  const root = document.querySelector("#like-distribution-list");
  if (!distribution.length) {
    root.innerHTML = `<div class="empty-state">No topic statistics are available.</div>`;
    return;
  }
  root.innerHTML = distribution
    .slice(0, 8)
    .map(
      (item) => `
        <div class="distribution-row">
          <div class="distribution-top">
            <span>${escapeHtml(item.topic_label)}</span>
            <strong>${item.share.toFixed(2)}%</strong>
          </div>
          <div class="distribution-bar">
            <span style="width: ${Math.max(item.share, 2)}%"></span>
          </div>
        </div>
      `
    )
    .join("");
}

function renderResults(likes, visibleLikes, sourceSections) {
  const activeFilters = getActiveFilters();
  document.querySelector("#like-results-title").textContent = activeFilters.length
    ? `${visibleLikes.length} papers visible after filtering`
    : `${likes.length} saved papers`;
  document.querySelector("#like-results-stats").innerHTML = [
    renderResultStat("Visible Saved", visibleLikes.length, activeFilters.length ? `of ${likes.length}` : "full saved set"),
    renderResultStat("Visible Branches", sourceSections.length, activeFilters.length ? "filtered" : "all branches"),
    renderResultStat(
      "View Mode",
      state.day || state.month || state.year || state.topic || "Full scan",
      state.query ? `search: ${state.query}` : "cross-branch browsing"
    ),
  ].join("");
  document.querySelector("#like-active-filters").innerHTML = activeFilters.length
    ? activeFilters.map((item) => `<span class="active-filter-pill">${escapeHtml(item)}</span>`).join("")
    : `<span class="active-filter-pill">No filters applied. You are looking at the full saved set.</span>`;
  resetFiltersButton.disabled = !activeFilters.length;
}

function renderSourceSections(sections) {
  const root = document.querySelector("#like-source-sections");
  if (!sections.length) {
    root.innerHTML = `<div class="glass-card empty-state">No saved papers match the current filters.</div>`;
    return;
  }

  root.innerHTML = sections
    .map(
      (section, index) => {
        const key = section.source_kind;
        const page = branchPages.get(key) || 0;
        const totalPages = Math.ceil(section.count / BRANCH_PAGE_SIZE);
        const safePage = Math.min(page, totalPages - 1);
        if (safePage !== page) branchPages.set(key, safePage);
        const start = safePage * BRANCH_PAGE_SIZE;
        const pageItems = section.papers.slice(start, start + BRANCH_PAGE_SIZE);

        const paginationHtml = totalPages > 1
          ? `<div class="pagination">
              <button class="pill-button" data-branch-page="prev" data-branch-key="${escapeAttribute(key)}" ${safePage === 0 ? 'disabled' : ''}>← Prev</button>
              <span class="pagination-info">${safePage + 1} / ${totalPages}</span>
              <button class="pill-button" data-branch-page="next" data-branch-key="${escapeAttribute(key)}" ${safePage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
            </div>`
          : "";

        return `
          <section class="glass-card conference-subject-card">
            <div class="conference-subject-header">
              <div>
                <p class="eyebrow">BRANCH</p>
                <h3>${index + 1}. ${escapeHtml(section.source_label)}</h3>
              </div>
              <div class="conference-subject-meta">
                <span>${section.count} papers</span>
                <span>${escapeHtml(section.latest_snapshot || "No snapshot")}</span>
              </div>
            </div>
            <div class="conference-paper-grid">
              ${pageItems.map((paper) => renderLikeCard(paper)).join("")}
            </div>
            ${paginationHtml}
          </section>
        `;
      }
    )
    .join("");

  root.querySelectorAll("[data-branch-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.branchKey;
      const current = branchPages.get(key) || 0;
      if (btn.dataset.branchPage === "prev" && current > 0) {
        branchPages.set(key, current - 1);
      } else if (btn.dataset.branchPage === "next") {
        branchPages.set(key, current + 1);
      }
      renderPage();
    });
  });
}

function renderLikeCard(paper) {
  likeRecords.set(paper.like_id, {
    paper: paper,
    context: {
      sourceKind: paper.source_kind,
      sourceLabel: getSourceLabel(paper.source_kind),
      sourcePage: paper.source_page,
      snapshotLabel: paper.snapshot_label,
    }
  });
  const authors = paper.authors?.length ? escapeHtml(paper.authors.join(", ")) : "Unknown";
  const abstract = paper.abstract
    ? `
      <details class="paper-abstract">
        <summary>
          <span class="paper-abstract-label">Abstract</span>
          <span class="paper-abstract-arrow" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="14" height="14">
              <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </span>
        </summary>
        <p>${escapeHtml(paper.abstract)}</p>
      </details>
    `
    : "";
  const metaBadges = [
    `<span class="paper-badge">${escapeHtml(paper.topic_label || "Other AI")}</span>`,
    `<span class="paper-badge subdued">${escapeHtml(getSourceLabel(paper.source_kind))}</span>`,
    paper.snapshot_label ? `<span class="paper-badge subdued">${escapeHtml(paper.snapshot_label)}</span>` : "",
  ]
    .filter(Boolean)
    .join("");
  const links = [
    paper.source_page ? `<a class="paper-link" href="${escapeAttribute(paper.source_page)}">Branch</a>` : "",
    paper.pdf_url ? `<a class="paper-link brand-arxiv" href="${escapeAttribute(paper.pdf_url)}" target="_blank" rel="noreferrer">arXiv</a>` : "",
    paper.detail_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(paper.detail_url)}" target="_blank" rel="noreferrer">Cool</a>` : "",
    paper.hf_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(paper.hf_url)}" target="_blank" rel="noreferrer">HF</a>` : "",
    paper.github_url ? renderExternalPaperLink({ href: paper.github_url, label: "GitHub", brand: "github" }) : "",
    renderLikeButton(paper),
  ]
    .filter(Boolean)
    .join("");

  return `
    <article class="conference-paper-card">
      <div class="conference-paper-top">${metaBadges}</div>
      <h4>${escapeHtml(paper.title)}</h4>
      <div class="paper-authors-box">
        <span class="paper-detail-label">Authors</span>
        <p class="paper-authors-line">${authors}</p>
      </div>
      ${abstract}
      <div class="paper-links">${links}</div>
    </article>
  `;
}

function renderLikeButton(paper) {
  const liked = true;
  return `
    <button class="paper-link like-button${liked ? " is-liked" : ""}" type="button" data-like-id="${escapeAttribute(paper.like_id)}" aria-pressed="${liked}">
      <span class="paper-link-icon like-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M10 16.3l-5.26-4.98A3.8 3.8 0 0 1 10 5.9a3.8 3.8 0 0 1 5.26 5.42z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
        </svg>
      </span>
      <span class="paper-link-text">Like</span>
    </button>
  `;
}

function renderExternalPaperLink({ href, label, brand }) {
  const iconSrc = brand === "github" ? "./assets/github-mark.svg" : "";
  return `
    <a class="paper-link brand-${escapeAttribute(brand)}" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">
      <span class="paper-link-icon" aria-hidden="true">${iconSrc ? `<img src="${iconSrc}" alt="" />` : ""}</span>
      <span class="paper-link-text">${escapeHtml(label)}</span>
    </a>
  `;
}

function getVisibleLikes(likes) {
  return likes.filter((paper) => {
    if (state.source && paper.source_kind !== state.source) {
      return false;
    }
    const dateParts = extractDateParts(paper);
    if (state.year && dateParts.year !== state.year) {
      return false;
    }
    if (state.month && dateParts.month !== state.month) {
      return false;
    }
    if (state.day && dateParts.day !== state.day) {
      return false;
    }
    if (state.topic && (paper.topic_label || "Other AI") !== state.topic) {
      return false;
    }
    if (!state.query) {
      return true;
    }
    const haystack = [paper.title, ...(paper.authors || [])].join(" ").toLowerCase();
    return haystack.includes(state.query);
  });
}

function groupBySource(likes) {
  const map = new Map();
  likes.forEach((paper) => {
    const source = paper.source_kind || "daily";
    if (!map.has(source)) {
      map.set(source, []);
    }
    map.get(source).push(paper);
  });
  return [...map.entries()]
    .map(([source_kind, papers]) => {
      const distribution = computeTopicDistribution(papers);
      return {
        source_kind,
        source_label: getSourceLabel(source_kind),
        count: papers.length,
        latest_snapshot: papers[0]?.snapshot_label || "",
        latest_saved: formatTime(papers[0]?.saved_at),
        top_topic: distribution[0]?.topic_label || "",
        papers,
      };
    })
    .sort((a, b) => b.count - a.count || a.source_label.localeCompare(b.source_label, "zh-CN"));
}

function buildLibrarySourceSections(likes, laterQueue, toReadSnapshots) {
  const likesBySource = groupBySource(likes);
  const laterBySource = new Map();
  laterQueue.forEach((paper) => {
    const sourceKind = paper.source_kind || "daily";
    laterBySource.set(sourceKind, (laterBySource.get(sourceKind) || 0) + 1);
  });
  const toReadBySource = new Map();
  toReadSnapshots.forEach((snapshot) => {
    const sourceKind = getSnapshotSourceKind(snapshot);
    toReadBySource.set(sourceKind, (toReadBySource.get(sourceKind) || 0) + 1);
  });

  const sourceKinds = new Set([
    ...likesBySource.map((section) => section.source_kind),
    ...laterBySource.keys(),
    ...toReadBySource.keys(),
  ]);

  return [...sourceKinds]
    .map((sourceKind) => {
      const likesSection = likesBySource.find((section) => section.source_kind === sourceKind);
      const savedCount = likesSection?.count || 0;
      const laterCount = laterBySource.get(sourceKind) || 0;
      const toReadCount = toReadBySource.get(sourceKind) || 0;
      const latestSnapshot = likesSection?.latest_snapshot || toReadSnapshots.find((snapshot) => getSnapshotSourceKind(snapshot) === sourceKind)?.snapshot_label || "";
      const topTopic = likesSection?.top_topic || "";
      const ledeParts = [
        savedCount ? `${savedCount} saved papers` : "No saved papers yet",
        laterCount ? `${laterCount} queued for later` : "Later queue empty",
        toReadCount ? `${toReadCount} unread snapshots` : "No unread snapshots",
      ];
      return {
        source_kind: sourceKind,
        source_label: getSourceLabel(sourceKind),
        saved_count: savedCount,
        later_count: laterCount,
        to_read_count: toReadCount,
        latest_snapshot: latestSnapshot,
        latest_saved: likesSection?.latest_saved || "",
        top_topic: topTopic,
        lede: ledeParts.join(" · "),
        sort_score: savedCount * 100 + laterCount * 10 + toReadCount,
      };
    })
    .sort((a, b) => b.sort_score - a.sort_score || a.source_label.localeCompare(b.source_label, "zh-CN"));
}

function getSnapshotSourceKind(snapshot) {
  const url = snapshot?.branch_url || "";
  if (url.includes("cool-daily")) {
    return "daily";
  }
  if (url.includes("conference")) {
    return "conference";
  }
  if (url.includes("trending")) {
    return "trending";
  }
  return "hf_daily";
}

function computeTopicDistribution(papers) {
  const counts = new Map();
  papers.forEach((paper) => {
    const topic = paper.topic_label || "Other AI";
    counts.set(topic, (counts.get(topic) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([topic_label, count]) => ({
      topic_label,
      count,
      share: papers.length ? (count / papers.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.topic_label.localeCompare(b.topic_label, "zh-CN"));
}

function getActiveFilters() {
  const filters = [];
  if (state.source) {
    filters.push(`Branch: ${getSourceLabel(state.source)}`);
  }
  if (state.day) {
    filters.push(`Day: ${state.day}`);
  } else if (state.month) {
    filters.push(`Month: ${state.month}`);
  } else if (state.year) {
    filters.push(`Year: ${state.year}`);
  }
  if (state.topic) {
    filters.push(`Topic: ${state.topic}`);
  }
  if (state.query) {
    filters.push(`Search: ${state.query}`);
  }
  return filters;
}

function renderResultStat(label, value, meta) {
  return `
    <article class="result-stat">
      <span class="result-stat-label">${escapeHtml(label)}</span>
      <strong class="result-stat-value">${escapeHtml(String(value))}</strong>
      <span class="result-stat-meta">${escapeHtml(meta)}</span>
    </article>
  `;
}

function renderEmpty(toReadSnapshots) {
  document.querySelector("#like-overview-summary").textContent = "No saved papers yet.";
  document.querySelector("#like-focus-summary").textContent = "This area will populate after you like papers.";
  document.querySelector("#like-branch-summary").textContent = "No branch distribution yet.";
  document.querySelector("#like-latest-summary").textContent = "No latest save record yet.";
  document.querySelector("#like-tag-map").innerHTML = "";
  document.querySelector("#like-distribution-list").innerHTML = `<div class="empty-state">No like statistics yet.</div>`;
  document.querySelector("#like-results-title").textContent = "No saved papers yet";
  document.querySelector("#like-results-stats").innerHTML = "";
  document.querySelector("#like-active-filters").innerHTML = `<span class="active-filter-pill">Like any paper and this area will update automatically.</span>`;
  document.querySelector("#like-source-sections").innerHTML =
    `<div class="glass-card empty-state">Click Like in Cool Daily, Conference, or HF Daily to add papers here.</div>`;
  resetFiltersButton.disabled = true;
}

function renderFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector("#like-source-sections").innerHTML =
    `<div class="glass-card empty-state">Like page failed to load: ${escapeHtml(message)}</div>`;
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date
    .toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(/\//g, "/");
}

function extractDateParts(paper) {
  const reportDate = typeof paper.report_date === "string" ? paper.report_date.trim() : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
    return {
      year: reportDate.slice(0, 4),
      month: reportDate.slice(0, 7),
      day: reportDate,
    };
  }
  const venueYear = String(paper.venue_year || "").trim();
  if (/^\d{4}$/.test(venueYear)) {
    return {
      year: venueYear,
      month: "",
      day: "",
    };
  }
  return {
    year: "",
    month: "",
    day: "",
  };
}

function findLatestReportedDate(likes) {
  return likes
    .map((paper) => extractDateParts(paper).day || extractDateParts(paper).month || extractDateParts(paper).year)
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a))[0] || "";
}

function extractDateLabel(paper) {
  const dateParts = extractDateParts(paper);
  return dateParts.day || dateParts.month || dateParts.year || "";
}

async function loadSnapshotQueueData() {
  const manifestUrls = [
    "./data/daily/manifest.json",
    "./data/hf-daily/manifest.json",
    "./data/conference/manifest.json",
    "./data/trending/manifest.json",
  ];

  const results = await Promise.allSettled(manifestUrls.map((url) => fetchJson(url)));
  const snapshots = [];

  for (const result of results) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const manifest = result.value;
    if (manifest?.reports?.[0]?.category) {
      snapshots.push(...manifest.reports.map((report) => createDailySnapshot(report)));
      continue;
    }
    if (manifest?.reports?.[0]?.venue) {
      snapshots.push(...manifest.reports.map((report) => createConferenceSnapshot(report)));
      continue;
    }
    if (manifest?.reports?.[0]?.since) {
      snapshots.push(...manifest.reports.map((report) => createTrendingSnapshot(report)));
      continue;
    }
    if (manifest?.reports?.[0]?.report_date) {
      snapshots.push(...manifest.reports.map((report) => createHfSnapshot(report)));
    }
  }

  return snapshots.sort((left, right) => right.sort_key.localeCompare(left.sort_key) || left.title.localeCompare(right.title));
}

function getToReadSnapshots(snapshots) {
  return snapshots.filter((snapshot) => !isPageReviewed(snapshot.review_key));
}

function scheduleToReadSnapshotSync() {
  if (!state.snapshots.length) {
    return;
  }
  syncToReadSnapshotsNow().catch((error) => {
    console.error("Failed to sync to-read snapshots to Supabase", error);
  });
}

async function syncToReadSnapshotsNow() {
  if (toReadSyncPromise) {
    return toReadSyncPromise;
  }
  toReadSyncPromise = performToReadSnapshotSync();
  try {
    return await toReadSyncPromise;
  } finally {
    toReadSyncPromise = null;
  }
}

async function performToReadSnapshotSync() {
  await loadRuntimeConfig();
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabaseClient = await getSupabaseClient();
  if (!supabaseClient) {
    return [];
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const user = session?.user || null;
  if (!user || !isAuthorizedUser(user)) {
    return [];
  }

  const snapshots = getToReadSnapshots(state.snapshots);
  const upsertRows = snapshots.map((snapshot) => ({
    user_id: user.id,
    snapshot_id: snapshot.review_key,
    queued_at: new Date().toISOString(),
    payload: snapshot,
  }));

  if (upsertRows.length) {
    const { error } = await supabaseClient.from("to_read_snapshots").upsert(upsertRows, {
      onConflict: "user_id,snapshot_id",
    });
    if (error) {
      throw error;
    }
  }

  const { data: remoteRows, error: remoteError } = await supabaseClient
    .from("to_read_snapshots")
    .select("snapshot_id")
    .eq("user_id", user.id);
  if (remoteError) {
    throw remoteError;
  }

  const localIds = new Set(snapshots.map((snapshot) => snapshot.review_key));
  const staleIds = (remoteRows || []).map((item) => item.snapshot_id).filter((snapshotId) => !localIds.has(snapshotId));
  if (staleIds.length) {
    const { error } = await supabaseClient
      .from("to_read_snapshots")
      .delete()
      .eq("user_id", user.id)
      .in("snapshot_id", staleIds);
    if (error) {
      throw error;
    }
  }

  return snapshots;
}

function createDailySnapshot(report) {
  return {
    review_key: createPageReviewKey("cool_daily", report.data_path),
    branch_label: "Cool Daily",
    branch_url: "./cool-daily.html",
    snapshot_label: `${report.report_date} · ${report.category}`,
    title: `Cool Daily ${report.report_date} · ${report.category}`,
    summary: `${report.total_papers} papers${report.top_topics?.[0] ? ` · Top topic ${report.top_topics[0].topic_label}` : ""}`,
    source_url: report.source_url || "",
    sort_key: `${report.report_date}-2-${report.category}`,
  };
}

function createHfSnapshot(report) {
  return {
    review_key: createPageReviewKey("hf_daily", report.data_path),
    branch_label: "HF Daily",
    branch_url: "./index.html",
    snapshot_label: report.report_date,
    title: `HF Daily ${report.report_date}`,
    summary: `${report.total_papers} papers${report.top_topics?.[0] ? ` · Top topic ${report.top_topics[0].topic_label}` : ""}`,
    source_url: report.source_url || "",
    sort_key: `${report.report_date}-3`,
  };
}

function createConferenceSnapshot(report) {
  return {
    review_key: createPageReviewKey("conference", report.data_path),
    branch_label: "Conference",
    branch_url: "./conference.html",
    snapshot_label: report.venue,
    title: `Conference ${report.venue}`,
    summary: `${report.total_papers} papers${report.top_topics?.[0] ? ` · Top topic ${report.top_topics[0].topic_label}` : ""}`,
    source_url: report.source_url || "",
    sort_key: `${report.venue_year || "0000"}-1-${report.venue}`,
  };
}

function createTrendingSnapshot(report) {
  const weekLabel = formatWeekLabel(report.snapshot_date);
  return {
    review_key: createPageReviewKey("trending", report.data_path),
    branch_label: "Trending",
    branch_url: "./trending.html",
    snapshot_label: weekLabel,
    title: `Trending ${weekLabel}`,
    summary: `${report.total_repositories} repos${report.top_repositories?.[0] ? ` · Lead ${report.top_repositories[0].full_name}` : ""}`,
    source_url: report.source_url || "",
    sort_key: `${report.snapshot_date}-0`,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

function formatWeekLabel(dateString) {
  if (!dateString) {
    return "-";
  }
  const week = getIsoWeekParts(dateString);
  if (!week) {
    return dateString;
  }
  return `${week.year}-W${String(week.week).padStart(2, "0")}`;
}

function getIsoWeekParts(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return { year, week };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
