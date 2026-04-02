import { createPageReviewKey, initReviewSync, isPageReviewed, setPageReviewed, subscribePageReviews } from "./reading_state.js?v=dd3f79ade0";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=66a12f1edc";
import { mountAppToolbar } from "./app_toolbar.js?v=c5124e8940";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=88024f7cbb";
import { bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { initToolbarPreferences } from "./toolbar_preferences.js?v=c889d6e375";
import { createShowMoreAutoLoadController } from "./show_more_autoload.js?v=5f324a6f25";
import { escapeAttribute, escapeHtml, fetchJson, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";

mountAppToolbar("#unread-toolbar-root", {
  prefix: "unread",
  showFilters: false,
  toolbarSearch: {
    inputId: "unread-search-input",
    placeholder: "Search title, branch, or snapshot",
    ariaLabel: "Search unread snapshots by title, branch, or snapshot",
  },
  branchActiveKey: null,
  libraryActiveKey: "unread",
  quickAddTarget: "later",
});

const UNREAD_INITIAL_SIZE = 6;
const UNREAD_LOAD_MORE_SIZE = 6;
const listRoot = document.querySelector("#unread-list");
const summaryNode = document.querySelector("#unread-summary");
const actionsNode = document.querySelector("#unread-actions");
const heroCountNode = document.querySelector("#unread-hero-count");
const heroBranchesNode = document.querySelector("#unread-hero-branches");
const heroLatestNode = document.querySelector("#unread-hero-latest");
const heroBranchNode = document.querySelector("#unread-hero-branch");
const heroReviewedNode = document.querySelector("#unread-hero-reviewed");
const searchInput = document.querySelector("#unread-search-input");
const sidebarToggleButton = document.querySelector("#unread-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#unread-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#unread-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#unread-filters-menu");

let visibleCount = UNREAD_INITIAL_SIZE;
let snapshots = [];
let searchQuery = "";
let viewMode = "card";
const showMoreAutoLoad = createShowMoreAutoLoadController({
  bindingFlag: "unreadShowMoreAutoLoadBound",
  onTrigger: ({ total }) => {
    if (!expandVisibleUnreadCount(total)) {
      return false;
    }
    renderPage();
    return true;
  },
});

const TOPIC_LABEL_TRANSLATIONS = new Map([
  ["多模态理解与视觉", "Multimodal Understanding and Vision"],
  ["多模态理解和视觉", "Multimodal Understanding and Vision"],
  ["多模态生成建模", "Multimodal Generative Modeling"],
  ["多模态生成与建模", "Multimodal Generative Modeling"],
  ["多模态代理", "Multimodal Agents"],
  ["代理与规划", "Agents and Planning"],
  ["生成基础", "Generative Foundations"],
  ["领域应用", "Domain Applications"],
  ["数据集与基准", "Datasets and Benchmarks"],
  ["推理、对齐与评估", "Reasoning, Alignment, and Evaluation"],
  ["LLMs与语言", "LLMs and Language"],
  ["LLM与语言", "LLMs and Language"],
  ["机器人与具身AI", "Robotics and Embodied AI"],
]);

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  showMoreAutoLoad.init();
  showMoreAutoLoad.bindUserScrollIntentTracking();
  viewMode = initToolbarPreferences({
    pageKey: "unread",
    onViewModeChange: (mode) => {
      viewMode = mode;
      renderPage();
    },
  });
  bindFilterMenu({
    button: sidebarToggleButton,
    panel: filterMenuPanel,
    labelNode: sidebarToggleLabel,
    iconNode: sidebarToggleIcon,
  });
  bindSearchInput();
  bindBranchAuthToolbar("unread");
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("unread", { target: "later" });
  subscribePageReviews(() => renderPage());
  await initReviewSync();
  snapshots = await loadSnapshotQueueData();
  renderPage();
}

function renderPage() {
  const unreadSnapshots = snapshots.filter((snapshot) => !isPageReviewed(snapshot.review_key));
  const visibleSnapshots = filterSnapshots(unreadSnapshots);
  const totalReviewed = snapshots.length - unreadSnapshots.length;
  const branchCounts = new Map();
  visibleSnapshots.forEach((snapshot) => {
    branchCounts.set(snapshot.branch_label, (branchCounts.get(snapshot.branch_label) || 0) + 1);
  });
  const topBranch = [...branchCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))[0] || null;

  if (heroCountNode && heroBranchesNode && heroLatestNode && heroBranchNode && heroReviewedNode) {
    heroCountNode.textContent = unreadSnapshots.length ? `${unreadSnapshots.length} unread` : "All clear";
    heroBranchesNode.textContent = String(new Set(unreadSnapshots.map((snapshot) => snapshot.branch_label)).size);
    heroLatestNode.textContent = unreadSnapshots[0]?.snapshot_label || "-";
    heroBranchNode.textContent = topBranch ? `${topBranch[0]} · ${topBranch[1]}` : "-";
    heroReviewedNode.textContent = String(totalReviewed);
  }

  if (!unreadSnapshots.length) {
    summaryNode.textContent = "Every fetched snapshot has been reviewed.";
    listRoot.innerHTML = `<div class="empty-state">No unread snapshots remain in your queue.</div>`;
    actionsNode.innerHTML = "";
    showMoreAutoLoad.refresh();
    return;
  }

  if (!visibleSnapshots.length) {
    summaryNode.textContent = "No unread snapshots match the current search.";
    listRoot.innerHTML = `<div class="empty-state">No unread snapshots match the current search.</div>`;
    actionsNode.innerHTML = "";
    showMoreAutoLoad.refresh();
    return;
  }

  const unreadVisibleCount = readVisibleUnreadCount(visibleSnapshots.length);
  const pageItems = visibleSnapshots.slice(0, unreadVisibleCount);
  const hasMore = unreadVisibleCount < visibleSnapshots.length;
  const canCollapse = unreadVisibleCount > Math.min(UNREAD_INITIAL_SIZE, visibleSnapshots.length);

  summaryNode.textContent = searchQuery
    ? `${visibleSnapshots.length} of ${unreadSnapshots.length} fetched snapshots match the current search.`
    : `${unreadSnapshots.length} fetched snapshots are currently waiting for review.`;

  listRoot.innerHTML = pageItems
    .map((snapshot) => (viewMode === "list" ? renderUnreadSnapshotRow(snapshot) : renderUnreadSnapshotCard(snapshot)))
    .join("");

  actionsNode.innerHTML = `
    <div class="conference-subject-footer">
      <span class="conference-subject-progress">Showing ${pageItems.length} of ${visibleSnapshots.length} snapshots</span>
      <div class="conference-subject-actions">
        ${canCollapse ? `<button class="link-chip button-link" type="button" data-unread-action="less">Show less</button>` : ""}
        ${
          hasMore
            ? `<button class="link-chip button-link" type="button" data-unread-action="more" data-show-more-auto-load="unread" data-show-more-total="${visibleSnapshots.length}">Show more</button>`
            : ""
        }
      </div>
    </div>
  `;
  showMoreAutoLoad.refresh();

  actionsNode.querySelectorAll("[data-unread-action]").forEach((button) => {
    button.addEventListener("click", () => {
      showMoreAutoLoad.suppress();
      if (button.dataset.unreadAction === "more") {
        expandVisibleUnreadCount(visibleSnapshots.length);
      } else if (button.dataset.unreadAction === "less") {
        visibleCount = Math.min(UNREAD_INITIAL_SIZE, visibleSnapshots.length);
      }
      renderPage();
    });
  });

  listRoot.querySelectorAll("[data-review-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const reviewKey = button.dataset.reviewKey;
      if (!reviewKey) {
        return;
      }
      setPageReviewed(reviewKey, true, {
        branch: button.dataset.branchLabel || "Library",
        snapshot_label: button.dataset.snapshotLabel || "",
      });
      renderPage();
    });
  });
}

function renderUnreadSnapshotCard(snapshot) {
  return `
    <article class="spotlight-card">
      <div class="spotlight-meta">
        <span>${escapeHtml(snapshot.branch_label)}</span>
        <span>${escapeHtml(snapshot.snapshot_label)}</span>
      </div>
      <h3>${escapeHtml(snapshot.title)}</h3>
      <p>${escapeHtml(snapshot.summary)}</p>
      <div class="paper-links">
        <a class="paper-link" href="${escapeAttribute(snapshot.branch_url)}">${escapeHtml(snapshot.branch_label)}</a>
        ${snapshot.source_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(snapshot.source_url)}" target="_blank" rel="noreferrer">Source</a>` : ""}
        ${renderReviewedButton(snapshot)}
      </div>
    </article>
  `;
}

function renderUnreadSnapshotRow(snapshot) {
  return `
    <article class="unread-snapshot-row">
      <div class="unread-snapshot-row-main">
        <div class="spotlight-meta unread-snapshot-row-meta">
          <span>${escapeHtml(snapshot.branch_label)}</span>
          <span>${escapeHtml(snapshot.snapshot_label)}</span>
        </div>
        <h3 class="unread-snapshot-row-title">${escapeHtml(snapshot.title)}</h3>
        <p class="unread-snapshot-row-summary">${escapeHtml(snapshot.summary)}</p>
      </div>
      <div class="paper-links unread-snapshot-row-actions">
        <a class="paper-link" href="${escapeAttribute(snapshot.branch_url)}">${escapeHtml(snapshot.branch_label)}</a>
        ${snapshot.source_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(snapshot.source_url)}" target="_blank" rel="noreferrer">Source</a>` : ""}
        ${renderReviewedButton(snapshot)}
      </div>
    </article>
  `;
}

function renderReviewedButton(snapshot) {
  return `
    <button
      class="paper-link review-button"
      type="button"
      data-review-key="${escapeAttribute(snapshot.review_key)}"
      data-branch-label="${escapeAttribute(snapshot.branch_label)}"
      data-snapshot-label="${escapeAttribute(snapshot.snapshot_label)}"
      aria-pressed="false"
    >
      <span class="paper-link-icon review-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M5 10.5l3.1 3.1L15 6.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
      <span class="paper-link-text">Reviewed</span>
    </button>
  `;
}

function bindSearchInput() {
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      visibleCount = UNREAD_INITIAL_SIZE;
      renderPage();
    });
  }
}

function readVisibleUnreadCount(totalSnapshots) {
  const minimum = Math.min(UNREAD_INITIAL_SIZE, totalSnapshots);
  visibleCount = Math.max(visibleCount, minimum);
  return Math.min(visibleCount, totalSnapshots);
}

function expandVisibleUnreadCount(totalSnapshots) {
  const current = readVisibleUnreadCount(totalSnapshots);
  const next = Math.min(current + UNREAD_LOAD_MORE_SIZE, totalSnapshots);
  if (next <= current) {
    return false;
  }
  visibleCount = next;
  return true;
}

function filterSnapshots(snapshotsToFilter) {
  const query = searchQuery.trim();
  if (!query) {
    return snapshotsToFilter;
  }
  return snapshotsToFilter.filter((snapshot) => {
    const haystack = [
      snapshot.title,
      snapshot.summary,
      snapshot.branch_label,
      snapshot.snapshot_label,
      snapshot.branch_url,
      snapshot.source_url,
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(query);
  });
}

function renderFatal(error) {
  const message = getErrorMessage(error);
  if (summaryNode) {
    summaryNode.textContent = "Unread snapshot page failed to load.";
  }
  if (listRoot) {
    listRoot.innerHTML = `<div class="empty-state">Unread snapshot page failed to load: ${escapeHtml(message)}</div>`;
  }
  if (actionsNode) {
    actionsNode.innerHTML = "";
  }
}

async function loadSnapshotQueueData() {
  const branchCatalog = await fetchJson("./data/branches/manifest.json").catch(() => null);
  const manifestUrls = ["./data/trending/manifest.json"];

  if (branchCatalog && Array.isArray(branchCatalog.reports)) {
    const snapshots = branchCatalog.reports.map((report) => createSnapshotFromReport(report)).filter(Boolean);
    const trendingResult = await Promise.allSettled([fetchJson("./data/trending/manifest.json")]);
    const combinedSnapshots = [...snapshots];
    if (trendingResult[0]?.status === "fulfilled" && Array.isArray(trendingResult[0].value?.reports)) {
      combinedSnapshots.push(...trendingResult[0].value.reports.map((report) => createSnapshotFromReport(report)).filter(Boolean));
    }
    return combinedSnapshots.sort((left, right) => right.sort_key.localeCompare(left.sort_key) || left.title.localeCompare(right.title));
  }

  manifestUrls.unshift("./data/daily/manifest.json", "./data/hf-daily/manifest.json", "./data/conference/manifest.json", "./data/magazine/manifest.json");
  const results = await Promise.allSettled(manifestUrls.map((url) => fetchJson(url)));
  const snapshots = [];

  for (const result of results) {
    if (result.status !== "fulfilled") {
      continue;
    }
    const manifest = result.value;
    if (Array.isArray(manifest?.reports)) {
      snapshots.push(...manifest.reports.map((report) => createSnapshotFromReport(report)).filter(Boolean));
    }
  }

  return snapshots.sort((left, right) => right.sort_key.localeCompare(left.sort_key) || left.title.localeCompare(right.title));
}

function createSnapshotFromReport(report) {
  if (!report || typeof report !== "object") {
    return null;
  }
  if (report.issue_number) {
    return createMagazineSnapshot(report);
  }
  if (report.snapshot_date || report.since) {
    return createTrendingSnapshot(report);
  }
  if (report.venue) {
    return createConferenceSnapshot(report);
  }
  if (report.category) {
    return createDailySnapshot(report);
  }
  if (report.report_date) {
    return createHfSnapshot(report);
  }
  return null;
}

function createDailySnapshot(report) {
  return {
    review_key: createPageReviewKey("cool_daily", report.data_path),
    branch_label: "Cool Daily",
    branch_url: "./cool-daily.html",
    snapshot_label: `${report.report_date} · ${report.category}`,
    title: `Cool Daily ${report.report_date} · ${report.category}`,
    summary: `${report.total_papers} papers${report.top_topics?.[0] ? ` · Top topic ${displayTopicLabel(report.top_topics[0].topic_label)}` : ""}`,
    source_url: report.source_url || "",
    sort_key: `${report.report_date}-2-${report.category}`,
  };
}

function createHfSnapshot(report) {
  return {
    review_key: createPageReviewKey("hf_daily", report.data_path),
    branch_label: "HF Daily",
    branch_url: "./hf-daily.html",
    snapshot_label: report.report_date,
    title: `HF Daily ${report.report_date}`,
    summary: `${report.total_papers} papers${report.top_topics?.[0] ? ` · Top topic ${displayTopicLabel(report.top_topics[0].topic_label)}` : ""}`,
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
    summary: `${report.total_papers} papers${report.top_topics?.[0] ? ` · Top topic ${displayTopicLabel(report.top_topics[0].topic_label)}` : ""}`,
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

function createMagazineSnapshot(report) {
  const issueLabel = formatIssueLabel(report.issue_number);
  return {
    review_key: createPageReviewKey("magazine", report.data_path),
    branch_label: "Magazine",
    branch_url: "./magazine.html",
    snapshot_label: issueLabel,
    title: `Magazine ${issueLabel}`,
    summary: `${report.sections_count} sections${report.issue_title ? ` · ${report.issue_title}` : ""}`,
    source_url: report.source_url || "",
    sort_key: `${report.sync_date || "0000-00-00"}-1-${String(report.issue_number).padStart(6, "0")}`,
  };
}

function formatIssueLabel(issueNumber) {
  const normalized = Number(issueNumber);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return "-";
  }
  return `Issue ${normalized}`;
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

function displayTopicLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "Other AI";
  }
  return TOPIC_LABEL_TRANSLATIONS.get(label) || label;
}
