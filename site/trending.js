import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js?v=3b466b6556";
import { bindQueueButtons, initQueue, isInQueue, subscribeQueue } from "./paper_queue.js?v=8b696292c3";
import { mountAppToolbar } from "./app_toolbar.js?v=90ae25c72d";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { buildBranchReviewKey, createBranchReviewController, initBranchReportPage } from "./branch_page.js?v=f27a328acc";
import { bindBranchListDetails, renderBranchDetailGroup, renderBranchDetailSection, renderBranchListDetails } from "./branch_details.js?v=22d7e0f349";
import { createLatestTaskRunner } from "./request_gate.js?v=f527e8e81d";
import { createFloatingTocController } from "./floating_toc.js?v=a9ffd5aa93";
import { validateTrendingManifest, validateTrendingReport } from "./site_contract.js?v=12344e596d";
import { escapeAttribute, escapeHtml, fetchJson, formatZhTime, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";

mountAppToolbar("#trending-toolbar-root", {
  prefix: "trending",
  filtersTemplateId: "trending-toolbar-filters",
  branchActiveKey: "trending",
  libraryActiveKey: null,
});

const manifestUrl = "./data/trending/manifest.json";

const state = {
  manifest: null,
  report: null,
  currentPath: "",
  query: "",
};

const TRENDING_ARCHIVE_MAX_CARDS = 6;
const TRENDING_CADENCE_MAX_DATES = 6;

const reportSelect = document.querySelector("#trending-report-select");
const searchInput = document.querySelector("#trending-search-input");
const resetFiltersButton = document.querySelector("#trending-reset-filters");
const sidebarToggleButton = document.querySelector("#trending-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#trending-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#trending-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#trending-filters-menu");
const backToTopButton = document.querySelector("#trending-back-to-top");
const floatingTocRoot = document.querySelector("#trending-floating-toc");
const reviewToggleButton = document.querySelector("#trending-review-toggle");
const reviewToggleMeta = document.querySelector("#trending-review-toggle-meta");
const heroReviewStatus = document.querySelector("#trending-hero-review-status");
const likeRecords = new Map();
const runLatestReportLoad = createLatestTaskRunner();
const floatingToc = createFloatingTocController(floatingTocRoot, {
  rootMargin: "-18% 0px -60% 0px",
  threshold: [0.1, 0.3, 0.55],
});
const reviewController = createBranchReviewController({
  reviewScope: "trending",
  branchLabel: "Trending",
  reviewToggleButton,
  reviewToggleMeta,
  heroReviewStatus,
  getCurrentReport: () => state.report,
  getCurrentPath: () => state.currentPath,
  getSnapshotLabel: (report) => formatWeekLabel(report.snapshot_date),
});
const { bindReviewToggle, renderReviewState } = reviewController;

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  await initBranchReportPage({
    pageKey: "trending",
    toolbarPrefix: "trending",
    manifestUrl,
    sidebarToggleButton,
    sidebarToggleLabel,
    sidebarToggleIcon,
    filterMenuPanel,
    backToTopButton,
    likeRecords,
    bindPageControls: () => {
      bindFilters();
      bindReviewToggle();
    },
    renderReviewState,
    onManifestLoaded: (manifest) => {
      state.manifest = manifest;
      populateReportSelect(manifest.reports || []);
      renderHomeCards(manifest);
    },
    onEmptyManifest: () => {
      renderEmpty();
    },
    getInitialReportPath: (manifest) => manifest.default_report_path || manifest.reports[0]?.data_path || "",
    manifestValidator: validateTrendingManifest,
    loadReport,
  });
}
function bindFilters() {
  reportSelect.addEventListener("change", async (event) => {
    const path = event.target.value;
    if (path && path !== state.currentPath) {
      await loadReport(path);
    }
  });

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderReport();
  });

  resetFiltersButton.addEventListener("click", () => {
    if (!hasActiveFilters()) {
      return;
    }
    state.query = "";
    searchInput.value = "";
    renderReport();
  });
}

async function loadReport(path) {
  const result = await runLatestReportLoad(() => fetchJson(path, { validator: validateTrendingReport }));
  if (result.stale) {
    return;
  }
  const report = result.value;
  state.report = report;
  state.currentPath = path;
  state.query = "";
  reportSelect.value = path;
  searchInput.value = "";
  renderHomeCards(state.manifest, path);
  renderReviewState();
  renderReport();
}

function populateReportSelect(reports) {
  reportSelect.innerHTML = reports
    .map(
      (report) =>
        `<option value="${escapeAttribute(report.data_path)}">${escapeHtml(formatWeekLabel(report.snapshot_date))} · ${report.total_repositories} repos</option>`
    )
    .join("");
}

function renderHomeCards(manifest, activePath = "") {
  const root = document.querySelector("#trending-home-cards");
  const summary = document.querySelector("#trending-board-summary");
  const reports = manifest?.reports || [];
  const visibleReports = reports.slice(0, TRENDING_ARCHIVE_MAX_CARDS);

  if (!reports.length) {
    summary.textContent = "No trending snapshots are available yet.";
    root.innerHTML = `<div class="empty-state">Generate the trending reports first, then refresh the page.</div>`;
    return;
  }

  const totalRepos = reports.reduce((sum, report) => sum + (report.total_repositories || 0), 0);
  summary.textContent = `Currently indexed: ${reports.length} weekly snapshots with ${totalRepos} repositories in total. Showing the latest ${visibleReports.length} snapshots.`;
  root.innerHTML = visibleReports
    .map((report) => {
      const topLanguage = report.top_languages?.[0];
      const topRepo = report.top_repositories?.[0];
      return `
        <button
          class="home-category-card ${report.data_path === activePath ? "active" : ""}"
          type="button"
          data-trending-report="${escapeAttribute(report.data_path)}"
        >
          <div class="home-category-card-top">
            <span class="home-category-label">Trending</span>
            <span class="home-category-date">${escapeHtml(formatWeekLabel(report.snapshot_date))}</span>
          </div>
          <strong class="home-category-count">${report.total_repositories} repos</strong>
          <p class="home-category-topic">${escapeHtml(topRepo?.full_name || "No summary yet")}</p>
          <div class="home-category-meta">
            <span>${report.total_repositories} repos</span>
            <span>${escapeHtml(report.since || "weekly")}</span>
          </div>
        </button>
      `;
    })
    .join("");

  root.querySelectorAll("[data-trending-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.trendingReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });
}

function renderReport() {
  if (!state.report) {
    renderEmpty();
    return;
  }

  const report = state.report;
  const visibleRepos = getVisibleRepos(report);
  likeRecords.clear();
  renderHero(report, visibleRepos);
  renderOverview(report, visibleRepos);
  renderTagMap(report);
  renderCadence(report);
  renderResults(report, visibleRepos);
  renderRepositorySections(visibleRepos);
  floatingToc.render([
    { id: "trending-overview-section", label: "Overview" },
    { id: "trending-tags-section", label: "Current Tags" },
    { id: "trending-cadence-section", label: "Recent Cadence" },
    { id: "trending-results-section", label: "Results" },
    { id: "trending-repositories-section", label: "Repositories" },
  ]);
  bindLikeButtons(document, likeRecords);
  bindQueueButtons(document, likeRecords);
  bindBranchListDetails(document);
}

function renderHero(report, visibleRepos) {
  const topRepo = report.top_repositories?.[0];
  document.querySelector("#trending-hero-date").textContent = formatWeekLabel(report.snapshot_date);
  document.querySelector("#trending-hero-total").textContent = String(report.total_repositories || 0);
  document.querySelector("#trending-hero-gain").textContent = topRepo?.stars_this_week
    ? `+${topRepo.stars_this_week.toLocaleString()}`
    : "-";
  document.querySelector("#trending-hero-window").textContent = report.since || "weekly";
  document.querySelector("#trending-hero-updated").textContent = formatZhTime(report.generated_at);
  document.querySelector("#trending-hero-signals").innerHTML = [
    `<div class="signal-chip"><span>Weekly Lead</span><strong>${escapeHtml(topRepo?.full_name || "-")}</strong></div>`,
    `<div class="signal-chip"><span>Visible Scope</span><strong>${visibleRepos.length} repos</strong></div>`,
    `<div class="signal-chip"><span>Languages</span><strong>${report.language_distribution?.length || 0}</strong></div>`,
  ].join("");
}

function renderOverview(report, visibleRepos) {
  const topRepo = (visibleRepos.length ? visibleRepos : report.top_repositories || [])
    .slice()
    .sort((left, right) => (right.stars_this_week || -1) - (left.stars_this_week || -1) || left.full_name.localeCompare(right.full_name))[0];
  document.querySelector("#trending-overview-title").textContent = `${formatWeekLabel(report.snapshot_date)} Trending Overview`;
  document.querySelector("#trending-source-link").href = report.source_url;
  document.querySelector("#trending-overview-summary").textContent = topRepo
    ? `${topRepo.full_name} is the current weekly lead, with ${(topRepo.stars_this_week || 0).toLocaleString()} stars gained this week.`
    : "This snapshot does not expose a weekly lead yet.";
  document.querySelector("#trending-repo-summary").textContent = topRepo
    ? `${topRepo.full_name} currently has ${(topRepo.stars || 0).toLocaleString()} total stars and ${(topRepo.forks || 0).toLocaleString()} forks.`
    : "No weekly star summary is available for the current filters.";
  document.querySelector("#trending-focus-summary").textContent = `The visible set contains ${visibleRepos.length} repositories from the current weekly snapshot.`;
  document.querySelector("#trending-breadth-summary").textContent = `This snapshot includes ${report.language_distribution?.length || 0} source languages.`;
}

function renderTagMap(report) {
  document.querySelector("#trending-tag-map").innerHTML = [
    {
      label: "Week",
      value: formatWeekLabel(report.snapshot_date),
      meta: "current trending snapshot",
    },
    {
      label: "Window",
      value: report.since || "weekly",
      meta: "GitHub trending time window",
    },
    {
      label: "Search",
      value: state.query || "No query",
      meta: state.query ? "current repository search" : "search disabled",
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

function renderCadence(report) {
  const entries = [...(state.manifest?.reports || [])]
    .sort((left, right) => right.snapshot_date.localeCompare(left.snapshot_date))
    .slice(0, TRENDING_CADENCE_MAX_DATES);
  const maxCount = Math.max(...entries.map((entry) => entry.total_repositories || 0), 1);
  document.querySelector("#trending-cadence-track").innerHTML = `
    <div class="hf-cadence-list">
      ${entries
        .map((entry) => {
          const width = Math.max(((entry.total_repositories || 0) / maxCount) * 100, 12);
          const active = entry.data_path === state.currentPath;
          return `
            <button class="hf-cadence-item${active ? " is-active" : ""}" type="button" data-trending-cadence-report="${escapeAttribute(
              entry.data_path
            )}">
              <div class="hf-cadence-item-top">
                <div class="hf-cadence-date-block">
                  <span class="hf-cadence-date">${escapeHtml(formatWeekLabel(entry.snapshot_date))}</span>
                  <span class="hf-cadence-year">weekly snapshot</span>
                </div>
                <div class="hf-cadence-meta">
                  ${active ? `<span class="hf-cadence-badge is-active">Current</span>` : ""}
                </div>
              </div>
              <div class="hf-cadence-bar-shell">
                <span class="hf-cadence-bar" style="width:${width}%"></span>
              </div>
              <div class="hf-cadence-item-bottom">
                <strong class="hf-cadence-value">${entry.total_repositories}</strong>
                <span class="hf-cadence-caption">repos</span>
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;

  document.querySelectorAll("[data-trending-cadence-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.trendingCadenceReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });

  document.querySelector("#trending-cadence-summary").textContent = buildCadenceSummary(entries, report);
}

function renderResults(report, visibleRepos) {
  const activeFilters = getActiveFilters();
  document.querySelector("#trending-results-title").textContent = activeFilters.length
    ? `${visibleRepos.length} repositories visible after filtering`
    : `${report.total_repositories} repositories in view`;
  document.querySelector("#trending-results-stats").innerHTML = [
    renderResultStat(
      "Visible Repositories",
      visibleRepos.length,
      activeFilters.length ? `of ${report.total_repositories}` : "full weekly set"
    ),
    renderResultStat(
      "Visible Languages",
      new Set(visibleRepos.map((repo) => repo.language || "Unknown")).size,
      "source metadata only"
    ),
    renderResultStat("Scope", state.query ? "Search" : "Full scan", state.query ? "filtered search" : "full browsing"),
  ].join("");
  document.querySelector("#trending-active-filters").innerHTML = activeFilters.length
    ? activeFilters.map((item) => `<span class="active-filter-pill">${escapeHtml(item)}</span>`).join("")
    : `<span class="active-filter-pill">No filters applied. You are looking at the full weekly trending set.</span>`;
  resetFiltersButton.disabled = !activeFilters.length;
}

function renderRepositorySections(visibleRepos) {
  const root = document.querySelector("#trending-repository-sections");
  if (!visibleRepos.length) {
    root.innerHTML = `<div class="glass-card empty-state">No repositories match the current filters.</div>`;
    return;
  }

  root.innerHTML = `
    <section id="trending-repositories-section" class="glass-card conference-subject-card">
      <div class="conference-subject-header">
        <div>
          <p class="eyebrow">REPOSITORIES</p>
          <h3>Weekly Repository List</h3>
        </div>
        <div class="conference-subject-meta">
          <span>${visibleRepos.length} repos</span>
        </div>
      </div>
      <div class="conference-paper-grid">
        ${visibleRepos.map((repo) => renderRepoCard(repo)).join("")}
      </div>
    </section>
  `;
}

function renderRepoCard(repo) {
  const likeId = rememberLikeRecord(repo);
  const liked = isLiked(likeId);
  const inLater = isInQueue(likeId);
  const summary = escapeHtml(repo.description || "No description provided.");
  const badges = [
    `<span class="paper-badge">${escapeHtml(repo.language || "Unknown")}</span>`,
    repo.stars_this_week !== null && repo.stars_this_week !== undefined
      ? `<span class="paper-badge subdued">▲ ${repo.stars_this_week.toLocaleString()} this week</span>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const stats = `
    <div class="repo-stat-row">
      <span class="repo-stat-pill">
        <span class="repo-stat-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="currentColor" focusable="false">
            <path d="M8 .75l2.12 4.29 4.73.69-3.42 3.33.81 4.7L8 11.53l-4.24 2.23.81-4.7L1.15 5.73l4.73-.69L8 .75z"></path>
          </svg>
        </span>
        <span>Stars ${escapeHtml((repo.stars || 0).toLocaleString())}</span>
      </span>
      <span class="repo-stat-pill">
        <span class="repo-stat-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="currentColor" focusable="false">
            <path d="M5 1.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zm7.5 2.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM5 12.25a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5zM6 3.75v6.5a2.5 2.5 0 11-2 0v-6.5a2.5 2.5 0 012 0zm1.22 1h3.56a2.5 2.5 0 11-.56 1h-3a2.5 2.5 0 01-.22-1z"></path>
          </svg>
        </span>
        <span>Forks ${escapeHtml((repo.forks || 0).toLocaleString())}</span>
      </span>
    </div>
  `;
  const builtBy = repo.built_by?.length
    ? `
      <div class="paper-authors-box">
        <span class="paper-detail-label">Built By</span>
        <p class="paper-authors-line">${escapeHtml(repo.built_by.join(", "))}</p>
      </div>
    `
    : "";
  const listDetails = renderBranchListDetails(
    [
      renderBranchDetailSection({ label: "Summary", body: summary, muted: true }),
      renderBranchDetailGroup({ label: "Stats", body: stats }),
      repo.built_by?.length
        ? renderBranchDetailSection({ label: "Built By", body: escapeHtml(repo.built_by.join(", ")) })
        : "",
    ].join(""),
    {
      detailKey: likeId,
    }
  );
  return `
    <article class="conference-paper-card repo-card">
      <div class="conference-paper-top">${badges}</div>
      <h4>${escapeHtml(repo.full_name)}</h4>
      <div class="branch-card-inline-details">
        <p class="repo-description">${summary}</p>
        ${stats}
        ${builtBy}
      </div>
      ${listDetails}
      <div class="paper-links">
        ${renderPaperLink({ href: repo.repo_url, label: "GitHub", brand: "github" })}
        <button class="paper-link later-button${inLater ? " is-later" : ""}" type="button" data-later-id="${escapeAttribute(likeId)}" aria-pressed="${inLater}">
          <span class="paper-link-icon later-icon" aria-hidden="true">
            <svg viewBox="0 0 20 20">
              <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
            </svg>
          </span>
          <span class="paper-link-text">Later</span>
        </button>
        <button class="paper-link like-button${liked ? " is-liked" : ""}" type="button" data-like-id="${escapeAttribute(likeId)}" aria-pressed="${liked}">
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
}

function rememberLikeRecord(repo) {
  const snapshotLabel = state.report ? formatWeekLabel(state.report.snapshot_date) : "Trending";
  const record = createLikeRecord(
    {
      title: repo.full_name,
      paper_id: repo.full_name,
      topic_key: (repo.language || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      topic_label: repo.language || "Unknown",
      authors: repo.built_by || [],
      abstract: repo.description || "",
      github_url: repo.repo_url || "",
    },
    {
      sourceKind: "trending",
      sourceLabel: "Trending",
      sourcePage: "./trending.html",
      snapshotLabel,
      reportDate: state.report?.snapshot_date || "",
      reviewKey: buildBranchReviewKey("trending", state.currentPath),
    }
  );
  likeRecords.set(record.like_id, record);
  return record.like_id;
}

function getVisibleRepos(report) {
  return report.repositories.filter((repo) => {
    if (state.query) {
      const haystack = `${repo.full_name} ${repo.description || ""}`.toLowerCase();
      if (!haystack.includes(state.query)) {
        return false;
      }
    }
    return true;
  });
}

function buildCadenceSummary(entries, report) {
  if (!entries.length) {
    return "No trending snapshots are available yet.";
  }
  if (entries.length === 1) {
    return `Only one weekly snapshot is available so far. ${report.total_repositories} repositories were captured in ${formatWeekLabel(report.snapshot_date)}.`;
  }
  const [latest, previous] = entries;
  const delta = (latest.total_repositories || 0) - (previous.total_repositories || 0);
  const direction = delta === 0 ? "unchanged" : delta > 0 ? `increased by ${delta}` : `decreased by ${Math.abs(delta)}`;
  return `${formatWeekLabel(latest.snapshot_date)} captured ${latest.total_repositories} repositories, ${direction} from the previous weekly snapshot.`;
}

function getActiveFilters() {
  const filters = [];
  if (state.query) {
    filters.push(`Search: ${state.query}`);
  }
  return filters;
}

function hasActiveFilters() {
  return Boolean(state.query);
}

function renderResultStat(label, value, meta) {
  return `
    <div class="result-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(meta)}</small>
    </div>
  `;
}

function renderEmpty() {
  document.querySelector("#trending-board-summary").textContent = "No trending reports are available yet.";
  document.querySelector("#trending-home-cards").innerHTML =
    `<div class="empty-state">Run the trending report generator first, then refresh the page.</div>`;
  document.querySelector("#trending-repository-sections").innerHTML = "";
  document.querySelector("#trending-tag-map").innerHTML = "";
  floatingToc.render([]);
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

function renderFatal(error) {
  const message = getErrorMessage(error);
  document.querySelector("#trending-board-summary").textContent = "Trending page failed to load.";
  document.querySelector("#trending-home-cards").innerHTML =
    `<div class="glass-card empty-state">Trending page failed to load: ${escapeHtml(message)}</div>`;
  floatingToc.render([]);
}

function renderPaperLink({ href, label, brand }) {
  const iconSrc = brand === "github" ? "./assets/github-mark.svg" : "./assets/cool-favicon.ico";
  return `
    <a class="paper-link brand-${escapeAttribute(brand)}" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">
      <span class="paper-link-icon" aria-hidden="true">
        <img src="${iconSrc}" alt="" />
      </span>
      <span class="paper-link-text">${escapeHtml(label)}</span>
    </a>
  `;
}
