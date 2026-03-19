import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js?v=20260319-5";
import { bindQueueButtons, initQueue, isInQueue, subscribeQueue } from "./paper_queue.js?v=20260319-5";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=20260319-5";
import { createCalendarPicker } from "./calendar_picker.js";
import { createPageReviewKey, initReviewSync, isPageReviewed, setPageReviewed, subscribePageReviews } from "./reading_state.js?v=20260319-4";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=20260319-5";
import { mountAppToolbar } from "./app_toolbar.js?v=20260319-7";
import { bindBranchNav } from "./branch_nav.js?v=20260319-4";
import { bindLibraryNav } from "./library_nav.js?v=20260319-4";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=20260319-7";

mountAppToolbar("#daily-toolbar-root", {
  prefix: "daily",
  filtersTemplateId: "daily-toolbar-filters",
  branchActiveKey: "hf",
  libraryActiveKey: null,
});

const manifestUrl = "./data/daily/manifest.json";
const CADENCE_MODE_KEY = "cool-paper-daily-cadence-mode";

const state = {
  manifest: null,
  report: null,
  currentPath: "",
  domain: "",
  date: "",
  query: "",
  topic: "",
  focusOnly: false,
  cadenceMode: localStorage.getItem(CADENCE_MODE_KEY) || "daily",
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);
const CADENCE_MAX_DATES = 7;

const domainFilter = document.querySelector("#domain-filter");
const dateFilter = document.querySelector("#date-filter");
const reportSelect = document.querySelector("#report-select");
const topicFilter = document.querySelector("#topic-filter");
const searchInput = document.querySelector("#search-input");
const focusOnlyInput = document.querySelector("#focus-only");
const resetFiltersButton = document.querySelector("#reset-filters");
const sidebarToggleButton = document.querySelector("#sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#sidebar-filters-menu");
const backToTopButton = document.querySelector("#back-to-top");
const floatingTocRoot = document.querySelector("#daily-floating-toc");
const reviewToggleButton = document.querySelector("#daily-review-toggle");
const reviewToggleMeta = document.querySelector("#daily-review-toggle-meta");
const heroReviewStatus = document.querySelector("#daily-hero-review-status");
const cadenceModeButtons = [...document.querySelectorAll("[data-cadence-mode]")];
const likeRecords = new Map();
let tocObserver = null;
let datePicker = null;
let filterMenuOpen = false;

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  bindThemeToggle();
  bindFilterMenu();
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("daily", { target: "later" });
  bindBranchAuthToolbar("daily");
  bindCadenceModeToggle();
  bindBackToTop();
  bindFilters();
  bindReviewToggle();
  subscribeLikes(() => bindLikeButtons(document, likeRecords));
  subscribeQueue(() => bindQueueButtons(document, likeRecords));
  subscribePageReviews(() => renderReviewState());
  await Promise.all([initLikesSync(), initReviewSync(), initQueue()]);
  repairLikeLaterConflicts();
  const manifest = await fetchJson(manifestUrl);
  state.manifest = manifest;
  bindDatePicker();
  populateScopeFilters(manifest.reports || []);
  populateReportSelect(getScopedReports(manifest.reports || []));
  renderHomeCategories(manifest);

  if (!manifest.reports.length) {
    updateHero(manifest);
    renderEmpty();
    return;
  }

  await loadReport(manifest.default_report_path || manifest.reports[0].data_path);
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

function bindFilterMenu() {
  if (!sidebarToggleButton || !filterMenuPanel) {
    return;
  }

  sidebarToggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    setFilterMenuOpen(!filterMenuOpen);
  });

  document.addEventListener("click", (event) => {
    if (!filterMenuOpen) {
      return;
    }
    if (filterMenuPanel.contains(event.target) || sidebarToggleButton.contains(event.target)) {
      return;
    }
    setFilterMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && filterMenuOpen) {
      setFilterMenuOpen(false);
    }
  });

  setFilterMenuOpen(false);
}

function setFilterMenuOpen(open) {
  filterMenuOpen = open;
  if (!sidebarToggleButton || !filterMenuPanel) {
    return;
  }
  sidebarToggleButton.setAttribute("aria-expanded", String(open));
  sidebarToggleButton.setAttribute("aria-label", open ? "Close filters" : "Open filters");
  sidebarToggleButton.title = open ? "Close filters" : "Open filters";
  sidebarToggleLabel.textContent = "Filters";
  sidebarToggleIcon.textContent = "☰";
  filterMenuPanel.hidden = !open;
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

function bindReviewToggle() {
  if (!reviewToggleButton) {
    return;
  }
  reviewToggleButton.addEventListener("click", () => {
    if (!state.report || !state.currentPath) {
      return;
    }
    const reviewKey = createPageReviewKey("cool_daily", state.currentPath);
    const next = !isPageReviewed(reviewKey);
    setPageReviewed(reviewKey, next, {
      branch: "Cool Daily",
      snapshot_label: `${state.report.report_date} · ${state.report.category}`,
    });
    renderReviewState();
  });
}

function bindCadenceModeToggle() {
  if (!cadenceModeButtons.length) {
    return;
  }

  const syncCadenceModeButtons = () => {
    cadenceModeButtons.forEach((button) => {
      const active = button.dataset.cadenceMode === state.cadenceMode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  };

  const setCadenceMode = (mode, persist = true) => {
    const nextMode = mode === "weekly" ? "weekly" : "daily";
    if (state.cadenceMode === nextMode && persist) {
      syncCadenceModeButtons();
      return;
    }
    state.cadenceMode = nextMode;
    if (persist) {
      window.localStorage.setItem(CADENCE_MODE_KEY, nextMode);
    }
    syncCadenceModeButtons();
    if (state.report) {
      renderReport();
    }
  };

  cadenceModeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setCadenceMode(button.dataset.cadenceMode);
    });
  });

  setCadenceMode(state.cadenceMode, false);
}

function renderReviewState() {
  if (!reviewToggleButton || !reviewToggleMeta) {
    return;
  }
  if (!state.report || !state.currentPath) {
    reviewToggleButton.classList.remove("is-reviewed");
    reviewToggleButton.setAttribute("aria-pressed", "false");
    reviewToggleMeta.textContent = "Mark this snapshot as reviewed";
    if (heroReviewStatus) {
      heroReviewStatus.textContent = "Not reviewed";
      heroReviewStatus.classList.remove("is-reviewed");
    }
    return;
  }
  const reviewed = isPageReviewed(createPageReviewKey("cool_daily", state.currentPath));
  reviewToggleButton.classList.toggle("is-reviewed", reviewed);
  reviewToggleButton.setAttribute("aria-pressed", String(reviewed));
  reviewToggleMeta.textContent = reviewed
    ? `Reviewed ${state.report.report_date} · ${state.report.category}`
    : `Mark ${state.report.report_date} · ${state.report.category} as reviewed`;
  if (heroReviewStatus) {
    heroReviewStatus.textContent = reviewed ? "Reviewed" : "Not reviewed";
    heroReviewStatus.classList.toggle("is-reviewed", reviewed);
  }
}

function bindDatePicker() {
  const shell = dateFilter.closest(".date-input-shell");
  const button = shell?.querySelector("[data-date-picker-button]");
  if (!shell || !button) {
    return;
  }
  datePicker = createCalendarPicker({
    shell,
    input: dateFilter,
    button,
    getAvailableDates: () =>
      [
        ...new Set(
          (state.manifest?.reports || [])
            .filter((report) => !state.domain || report.category === state.domain)
            .map((report) => report.report_date)
            .filter(Boolean)
        ),
      ].sort((left, right) => left.localeCompare(right)),
    getValue: () => state.date,
    onSelect: async (iso) => {
      state.date = iso;
      await handleReportScopeChange();
    },
  });
}

function bindFilters() {
  domainFilter.addEventListener("change", async (event) => {
    state.domain = event.target.value;
    await handleReportScopeChange();
  });

  reportSelect.addEventListener("change", async (event) => {
    const path = event.target.value;
    if (path) {
      await loadReport(path);
    }
  });

  topicFilter.addEventListener("change", (event) => {
    state.topic = event.target.value;
    renderReport();
  });

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderReport();
  });

  focusOnlyInput.addEventListener("change", (event) => {
    state.focusOnly = event.target.checked;
    renderReport();
  });

  resetFiltersButton.addEventListener("click", () => {
    if (!hasActiveFilters()) {
      return;
    }
    state.domain = "";
    state.date = "";
    state.query = "";
    state.topic = "";
    state.focusOnly = false;
    domainFilter.value = "";
    dateFilter.value = "";
    searchInput.value = "";
    topicFilter.value = "";
    focusOnlyInput.checked = false;
    handleReportScopeChange();
  });
}

async function loadReport(path) {
  const report = await fetchJson(path);
  state.report = report;
  state.currentPath = path;
  state.query = "";
  state.topic = "";
  state.focusOnly = false;
  reportSelect.value = path;
  searchInput.value = "";
  topicFilter.value = "";
  focusOnlyInput.checked = false;
  populateTopicFilter(report.topics);
  updateHero(state.manifest, report);
  renderHomeCategories(state.manifest, path, getScopedReports(state.manifest?.reports || []));
  renderReviewState();
  renderReport();
}

function populateScopeFilters(reports) {
  const domains = [...new Set(reports.map((report) => report.category).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
  const dates = [...new Set(reports.map((report) => report.report_date).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );

  domainFilter.innerHTML = `<option value="">All Domains</option>${domains
    .map((domain) => `<option value="${escapeAttribute(domain)}">${escapeHtml(domain)}</option>`)
    .join("")}`;
  dateFilter.min = dates[0] || "";
  dateFilter.max = dates.at(-1) || "";
  dateFilter.value = state.date || "";
  dateFilter.disabled = !dates.length;
  datePicker?.refresh();
}

function populateReportSelect(reports) {
  reportSelect.innerHTML = reports
    .map(
      (report) => `
        <option value="${escapeHtml(report.data_path)}">
          ${escapeHtml(report.report_date)} · ${escapeHtml(report.category)} · ${report.total_papers} papers
        </option>
      `
    )
    .join("");
}

function getScopedReports(reports) {
  return reports.filter((report) => {
    if (state.domain && report.category !== state.domain) {
      return false;
    }
    if (state.date && report.report_date !== state.date) {
      return false;
    }
    return true;
  });
}

async function handleReportScopeChange() {
  const scopedReports = getScopedReports(state.manifest?.reports || []);
  populateReportSelect(scopedReports);
  renderHomeCategories(state.manifest, state.currentPath, scopedReports);

  if (!scopedReports.length) {
    state.report = null;
    state.currentPath = "";
    updateHero(state.manifest);
    renderReviewState();
    renderEmpty("No daily snapshots match the current tags.");
    return;
  }

  if (!scopedReports.some((report) => report.data_path === state.currentPath)) {
    await loadReport(scopedReports[0].data_path);
    return;
  }

  reportSelect.value = state.currentPath;
  datePicker?.sync();
  updateHero(state.manifest, state.report);
  renderReviewState();
  renderReport();
}

function populateTopicFilter(topics) {
  topicFilter.innerHTML = `<option value="">All Topics</option>${topics
    .map(
      (topic) =>
        `<option value="${escapeHtml(topic.topic_label)}">${escapeHtml(topic.topic_label)} · ${topic.count}</option>`
    )
    .join("")}`;
}

function updateHero(manifest, report = null) {
  const latest = report || manifest?.reports?.[0] || null;
  document.querySelector("#hero-report-date").textContent = latest
    ? `${latest.report_date} · ${latest.category}`
    : "-";
  document.querySelector("#hero-total-papers").textContent = latest ? String(latest.total_papers) : "-";
  document.querySelector("#hero-classifier").textContent = latest ? latest.classifier : "-";
  document.querySelector("#hero-report-count").textContent = String(manifest.reports_count || 0);
  document.querySelector("#hero-generated-at").textContent = formatTime(latest?.generated_at || manifest.generated_at);
  const heroLede = document.querySelector("#hero-lede");
  if (heroLede) {
    heroLede.textContent = latest
      ? `${latest.category} on ${latest.report_date} is ready. Open a branch card below or jump straight into the lead feature and current focus clusters.`
      : "Daily snapshot metadata will appear here once reports are available.";
  }
}

function renderHomeCategories(manifest, activePath = "", scopedReports = null) {
  const root = document.querySelector("#home-categories");
  const summary = document.querySelector("#home-board-summary");
  const cards = getHomeCategoryCards(manifest, scopedReports);

  if (!cards.length) {
    summary.textContent = scopedReports ? "No report snapshots match the current tags." : "No report snapshots are available yet.";
    root.innerHTML = `<div class="empty-state">Generate the cs.AI, cs.CL, and cs.CV reports first, then refresh the homepage.</div>`;
    return;
  }

  const totalPapers = cards.reduce((sum, item) => sum + (item.total_papers || 0), 0);
  const uniqueDates = [...new Set(cards.map((item) => item.report_date))];
  summary.textContent =
    uniqueDates.length === 1
      ? `Latest branch snapshots on ${uniqueDates[0]} span ${cards.length} branches and ${totalPapers} papers.`
      : `Latest branch snapshots across ${cards.length} branches total ${totalPapers} papers.`;

  root.innerHTML = cards
    .map((report) => {
      const topTopic = report.top_topics?.[0];
      return `
        <button
          class="home-category-card ${report.data_path === activePath ? "active" : ""}"
          type="button"
          data-home-report="${escapeAttribute(report.data_path)}"
        >
          <div class="home-category-card-top">
            <span class="home-category-label">${escapeHtml(report.category)}</span>
            <span class="home-category-date">${escapeHtml(report.report_date)}</span>
          </div>
          <span class="home-category-caption">Current branch volume</span>
          <strong class="home-category-count">${report.total_papers} papers</strong>
          <p class="home-category-topic">
            ${
              topTopic
                ? `${escapeHtml(topTopic.topic_label)}`
                : "No topic summary yet"
            }
          </p>
          <div class="home-category-meta">
            <span>${topTopic ? `${topTopic.share.toFixed(2)}% top share` : "topic pending"}</span>
            <span>${topTopic ? `${topTopic.count} papers in top topic` : "pending"}</span>
          </div>
        </button>
      `;
    })
    .join("");

  root.querySelectorAll("[data-home-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.homeReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });
}

function renderReport() {
  if (!state.report) {
    return;
  }

  const report = state.report;
  likeRecords.clear();
  const sections = getFilteredSections(report);
  renderHeroSignals(report);
  renderDistribution(report.topic_distribution);
  renderOverview(report);
  renderTagMap(report);
  renderAtlas(report);
  renderTopicNavigator(report.topic_distribution);
  renderSpotlight(report, sections);
  renderResultsStrip(report, sections);
  renderTopicSections(report, sections);
  renderFloatingToc(
    [
      { id: "daily-overview-section", label: "Overview" },
      { id: "daily-tags-section", label: "Current Tags" },
      { id: "daily-atlas-section", label: "Daily Atlas" },
      { id: "daily-navigator-section", label: "Quick Jump" },
      { id: "daily-spotlight-section", label: "Spotlight" },
      { id: "daily-results-section", label: "Results" },
      ...sections.slice(0, 10).map((topic) => ({
        id: sectionIdFromTopic(topic.topic_label),
        label: topic.topic_label,
        child: true,
      })),
    ]
  );
  bindLikeButtons(document, likeRecords);
  bindQueueButtons(document, likeRecords);
}

function renderTagMap(report) {
  const topTopic = report.topic_distribution?.[0]?.topic_label || "Other AI";
  document.querySelector("#daily-tag-map").innerHTML = [
    {
      label: "Domain",
      value: report.category || "-",
      meta: state.domain ? "current filtered domain" : "current report domain",
    },
    {
      label: "Date",
      value: report.report_date || "-",
      meta: state.date ? "current filtered date" : "current report date",
    },
    {
      label: "Topic",
      value: state.topic || topTopic,
      meta: state.topic ? "current filtered topic" : "current dominant topic",
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

function renderHeroSignals(report) {
  const top = report.topic_distribution[0];
  const focusShare = report.focus_topics.reduce((sum, item) => sum + item.share, 0);
  const focusCount = report.focus_topics.reduce((sum, item) => sum + item.count, 0);
  const topicCount = report.topic_distribution.filter((item) => item.count > 0).length;
  const topThreeShare = report.topic_distribution.slice(0, 3).reduce((sum, item) => sum + item.share, 0);
  const fallbackReport =
    report.total_papers > 0
      ? null
      : (state.manifest?.reports || []).find(
          (item) => item.category === report.category && item.total_papers > 0 && item.data_path !== report.data_path
        ) || null;
  const heroLede = document.querySelector("#hero-lede");
  const root = document.querySelector("#hero-signals");
  if (heroLede) {
    heroLede.innerHTML = top
      ? `
        <span class="hero-lede-label">Today&rsquo;s read</span>
        <strong class="hero-lede-title">${escapeHtml(top.topic_label)}</strong>
        <span class="hero-lede-copy">
          ${escapeHtml(report.category)} is being led by ${escapeHtml(top.topic_label)} with ${top.count} papers and ${top.share.toFixed(2)}% share. Start from the focus stack and branch through the topic navigator.
        </span>
      `
      : `
        <span class="hero-lede-label">Latest snapshot</span>
        <strong class="hero-lede-title">No fresh papers in ${escapeHtml(report.category)}</strong>
        <span class="hero-lede-copy">
          ${
            fallbackReport
              ? `${escapeHtml(report.report_date)} is currently empty. Use the snapshot selector or recent cadence rail to jump back to ${escapeHtml(fallbackReport.report_date)}, the latest active branch with ${fallbackReport.total_papers} papers.`
              : `${escapeHtml(report.report_date)} is currently empty. Use the branch switcher or cadence rail to move to another active day.`
          }
        </span>
      `;
  }
  root.innerHTML = [
    top
      ? `
        <article class="hero-signal-card is-primary">
          <span class="hero-signal-label">Top Topic</span>
          <strong class="hero-signal-value">${escapeHtml(top.topic_label)}</strong>
          <span class="hero-signal-meta">${top.count} papers · ${top.share.toFixed(2)}%</span>
        </article>
      `
      : `
        <article class="hero-signal-card is-primary">
          <span class="hero-signal-label">Snapshot Status</span>
          <strong class="hero-signal-value">Quiet day</strong>
          <span class="hero-signal-meta">${
            fallbackReport
              ? `Latest active ${fallbackReport.report_date} carried ${fallbackReport.total_papers} papers.`
              : "No active fallback snapshot is available in the current manifest."
          }</span>
        </article>
      `,
    `
      <article class="hero-signal-card">
        <span class="hero-signal-label">${top ? "Focus Coverage" : "Total Papers"}</span>
        <strong class="hero-signal-value">${top ? focusCount : report.total_papers}</strong>
        <span class="hero-signal-meta">${
          top ? `${focusShare.toFixed(2)}% of today&rsquo;s volume` : "papers in the latest snapshot"
        }</span>
      </article>
    `,
    `
      <article class="hero-signal-card">
        <span class="hero-signal-label">Topic Breadth</span>
        <strong class="hero-signal-value">${topicCount}</strong>
        <span class="hero-signal-meta">Top 3 topics capture ${topThreeShare.toFixed(2)}%</span>
      </article>
    `,
  ].join("");
}

function renderDistribution(items) {
  const root = document.querySelector("#distribution-list");
  root.innerHTML = items
    .slice(0, 8)
    .map(
      (item) => `
        <div class="distribution-item">
          <div class="distribution-row">
            <span>${escapeHtml(item.topic_label)}</span>
            <strong>${item.share.toFixed(2)}%</strong>
          </div>
          <div class="distribution-bar"><span style="width:${item.share}%"></span></div>
        </div>
      `
    )
    .join("");
}

function renderOverview(report) {
  const top = report.topic_distribution[0];
  const focusTotal = report.focus_topics.reduce((sum, item) => sum + item.count, 0);
  const focusShare = report.focus_topics.reduce((sum, item) => sum + item.share, 0);
  const topicCount = report.topic_distribution.filter((item) => item.count > 0).length;

  document.querySelector("#overview-title").textContent = `${report.report_date} · ${report.category} Daily Overview`;
  const sourceLink = document.querySelector("#source-link");
  sourceLink.href = report.source_url;
  sourceLink.textContent = "Source";

  document.querySelector("#overview-summary").textContent = top
    ? `${top.topic_label} is the leading topic today, accounting for ${top.share.toFixed(2)}%, with ${top.count} papers.`
    : "-";
  document.querySelector("#focus-summary").textContent = `${focusTotal} papers fall into your focus topics, accounting for ${focusShare.toFixed(2)}% of the total.`;
  document.querySelector("#breadth-summary").textContent = `The report covers ${topicCount} topics today.`;
}

function renderAtlas(report) {
  const focusTotal = report.focus_topics.reduce((sum, item) => sum + item.count, 0);
  const focusShare = report.focus_topics.reduce((sum, item) => sum + item.share, 0);
  const activeTopics = report.topic_distribution.filter((item) => item.count > 0).length;
  const topTopic = report.topic_distribution[0];
  const topThreeShare = report.topic_distribution.slice(0, 3).reduce((sum, item) => sum + item.share, 0);

  document.querySelector("#atlas-metrics").innerHTML = [
    {
      label: "Focus Topics",
      value: `${focusTotal}`,
      meta: `${focusShare.toFixed(2)}% of daily volume`,
      className: "",
    },
    {
      label: "Dominant Topic",
      value: topTopic ? topTopic.topic_label : "-",
      meta: topTopic ? `${topTopic.count} papers · ${topTopic.share.toFixed(2)}%` : "-",
      className: "metric-card-topic",
    },
    {
      label: "Active Buckets",
      value: `${activeTopics}`,
      meta: `${report.total_papers} papers distributed`,
      className: "",
    },
    {
      label: "Top-3 Density",
      value: `${topThreeShare.toFixed(2)}%`,
      meta: "share captured by top three topics",
      className: "",
    },
  ]
    .map(
      (item) => `
        <article class="metric-card ${item.className}">
          <span class="metric-label">${escapeHtml(item.label)}</span>
          <strong class="metric-value">${escapeHtml(item.value)}</strong>
          <span class="metric-meta">${escapeHtml(item.meta)}</span>
        </article>
      `
    )
    .join("");

  document.querySelector("#atlas-topics").innerHTML = report.topic_distribution
    .slice(0, 5)
    .map(
      (item, index) => `
        <div class="atlas-topic-row">
          <span class="atlas-topic-rank">${String(index + 1).padStart(2, "0")}</span>
          <div class="atlas-topic-copy">
            <strong>${escapeHtml(item.topic_label)}</strong>
            <span>${item.count} papers</span>
          </div>
          <div class="atlas-topic-bar"><span style="width:${item.share}%"></span></div>
          <span class="atlas-topic-share">${item.share.toFixed(2)}%</span>
        </div>
      `
    )
    .join("");

  document.querySelector("#focus-breakdown").innerHTML = report.focus_topics
    .map(
      (item) => `
        <div class="focus-breakdown-row">
          <div class="focus-breakdown-copy">
            <strong>${escapeHtml(item.topic_label)}</strong>
            <span>${item.count} papers</span>
          </div>
          <div class="focus-breakdown-bar"><span style="width:${Math.max(item.share, item.count ? 8 : 0)}%"></span></div>
          <span class="focus-breakdown-share">${item.share.toFixed(2)}%</span>
        </div>
      `
    )
    .join("");

  renderCadence(report);
}

function renderCadence(report) {
  const cadenceMatrix = buildCadenceMatrix(state.manifest?.reports || [], state.cadenceMode);
  const maxCount = Math.max(...cadenceMatrix.rows.flatMap((row) => row.entries.map((entry) => entry?.total_papers || 0)), 1);
  const currentPeriodKey = state.cadenceMode === "weekly" ? getIsoWeekLabel(report.report_date) : report.report_date;

  document.querySelector("#cadence-track").innerHTML = `
    <div class="cadence-matrix">
      <div class="cadence-matrix-head">
        <span class="cadence-matrix-corner">${state.cadenceMode === "weekly" ? "Week" : "Date"}</span>
        ${cadenceMatrix.domains
          .map((domain) => `<span class="cadence-domain-head">${escapeHtml(domain)}</span>`)
          .join("")}
      </div>
      <div class="cadence-matrix-body">
        ${cadenceMatrix.rows
          .map(
            (row) => `
              <div class="cadence-matrix-row${row.rowKey === currentPeriodKey ? " is-active" : ""}">
                <span class="cadence-date-label">${escapeHtml(row.label)}</span>
                ${row.entries
                  .map((entry) => {
                    if (!entry) {
                      return `<div class="cadence-cell cadence-cell-empty"><span>-</span></div>`;
                    }
                    const width = Math.max((entry.total_papers / maxCount) * 100, 12);
                    const active =
                      state.cadenceMode === "weekly"
                        ? row.rowKey === currentPeriodKey && entry.category === report.category
                        : entry.data_path === state.currentPath;
                    return `
                      <button class="cadence-cell${active ? " active" : ""}" type="button" data-cadence-report="${escapeAttribute(
                        entry.data_path
                      )}">
                        <span class="cadence-cell-bar"><span style="width:${width}%"></span></span>
                        <strong class="cadence-cell-value">${entry.total_papers}</strong>
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;

  document.querySelectorAll("[data-cadence-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.cadenceReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });

  document.querySelector("#cadence-summary").textContent = buildCadenceSummary(
    cadenceMatrix.rows,
    report.category,
    state.cadenceMode
  );
}

function renderTopicNavigator(items) {
  const root = document.querySelector("#topic-nav");
  root.innerHTML = items
    .slice(0, 8)
    .map(
      (item) => `
        <button class="nav-chip ${state.topic === item.topic_label ? "active" : ""}" type="button" data-topic-nav="${escapeHtml(
          item.topic_label
        )}">
          <span>${escapeHtml(item.topic_label)}</span>
          <span class="nav-chip-count">${item.count}</span>
        </button>
      `
    )
    .join("");

  root.querySelectorAll("[data-topic-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      const topic = button.dataset.topicNav;
      state.topic = state.topic === topic ? "" : topic;
      topicFilter.value = state.topic;
      renderReport();
      if (state.topic) {
        document.getElementById(sectionIdFromTopic(state.topic))?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
}

function renderSpotlight(report, sections) {
  const root = document.querySelector("#spotlight-list");
  const visiblePapers = collectVisiblePapers(sections);
  const focusPapers = (visiblePapers.length ? visiblePapers : report.papers)
    .filter((paper) => focusTopicKeys.has(paper.topic_key))
    .slice(0, 6);

  if (!focusPapers.length) {
    root.innerHTML = `<div class="spotlight-empty">No paper hits the focus topics today. Use the topic navigator to explore nearby categories.</div>`;
    return;
  }

  root.innerHTML = focusPapers
    .map(
      (paper, index) => `
        <article class="spotlight-card ${focusTopicKeys.has(paper.topic_key) ? "is-focus" : ""}">
          <div class="paper-card-top">
            <span class="paper-id">${index === 0 ? "Start here" : escapeHtml(paper.paper_id)}</span>
            <div class="paper-badges">${renderPaperBadges(paper)}</div>
          </div>
          <h3>${escapeHtml(paper.title)}</h3>
          ${renderPaperDetails(paper)}
          <div class="paper-links">
            ${renderPaperLink({ href: paper.pdf_url || paper.abs_url, label: "arXiv", brand: "arxiv" })}
            ${renderPaperLink({ href: paper.detail_url, label: "Cool", brand: "cool" })}
            ${renderLikeButton(paper)}
          </div>
        </article>
      `
    )
    .join("");
}

function renderResultsStrip(report, sections) {
  const visiblePapers = collectVisiblePapers(sections);
  const activeFilters = getActiveFilters();
  const visibleTopics = sections.length;

  document.querySelector("#results-title").textContent = activeFilters.length
    ? `${visiblePapers.length} papers visible after filtering`
    : `${report.total_papers} papers in view`;

  document.querySelector("#results-stats").innerHTML = [
    {
      label: "Visible Papers",
      value: `${visiblePapers.length}`,
      meta: activeFilters.length ? `of ${report.total_papers} in this report` : "full daily set",
    },
    {
      label: "Visible Topics",
      value: `${visibleTopics}`,
      meta: activeFilters.length ? `of ${report.topic_distribution.length} topic buckets` : "all topic buckets",
    },
    {
      label: "View Mode",
      value: state.focusOnly ? "Focus only" : "Full scan",
      meta: state.topic ? `Topic locked to ${state.topic}` : "cross-topic browsing",
    },
  ]
    .map(
      (item) => `
        <article class="result-stat">
          <span class="result-stat-label">${escapeHtml(item.label)}</span>
          <strong class="result-stat-value">${escapeHtml(item.value)}</strong>
          <span class="result-stat-meta">${escapeHtml(item.meta)}</span>
        </article>
      `
    )
    .join("");

  const chipsRoot = document.querySelector("#active-filter-chips");
  chipsRoot.innerHTML = activeFilters.length
    ? activeFilters
        .map((item) => `<span class="filter-chip">${escapeHtml(item)}</span>`)
        .join("")
    : `<span class="filter-chip muted">No filters applied. You are looking at the full daily set.</span>`;

  resetFiltersButton.disabled = !activeFilters.length;
}

function renderTopicSections(report, sections) {
  const root = document.querySelector("#topic-sections");
  const sectionTemplate = document.querySelector("#topic-section-template");
  const paperTemplate = document.querySelector("#paper-card-template");
  root.innerHTML = "";

  if (!sections.length) {
    root.innerHTML = `<section class="glass-card empty-state">No results match the current filters.</section>`;
    return;
  }

  sections.forEach((topic, index) => {
    const section = sectionTemplate.content.firstElementChild.cloneNode(true);
    const leadCandidate = topic.papers[0];
    const topicKey = leadCandidate?.topic_key || "";
    section.id = sectionIdFromTopic(topic.topic_label);
    section.dataset.topic = topic.topic_label;
    section.classList.toggle("focus-section", focusTopicKeys.has(topicKey));
    section.querySelector(".topic-index").textContent = String(index + 1).padStart(2, "0");
    section.querySelector(".topic-title").textContent = topic.topic_label;
    section.querySelector(".topic-flags").innerHTML = renderTopicFlags(topicKey, topic);
    section.querySelector(".topic-count").textContent = `${topic.visibleCount} papers`;
    section.querySelector(".topic-share").textContent = `${topic.visibleShare.toFixed(2)}%`;
    section.querySelector(".topic-progress span").style.width = `${topic.visibleShare}%`;

    const [leadPaper, ...restPapers] = topic.papers;
    const leadRoot = section.querySelector(".topic-lead-card");
    leadRoot.innerHTML = buildTopicLeadMarkup(leadPaper, topic);

    const paperList = section.querySelector(".paper-list");
    restPapers.forEach((paper) => {
      const card = paperTemplate.content.firstElementChild.cloneNode(true);
      card.querySelector(".paper-id").textContent = paper.paper_id;
      card.querySelector(".paper-title").textContent = paper.title;
      card.querySelector(".paper-note").remove();
      card.querySelector(".paper-extra").innerHTML = renderPaperDetails(paper);
      card.querySelector('[data-link="abs"]').href = paper.pdf_url || paper.abs_url;
      card.querySelector('[data-link="detail"]').href = paper.detail_url;
      card.querySelector(".paper-badges").innerHTML = renderPaperBadges(paper);
      const likeId = rememberLikeRecord(paper);
      const laterButton = card.querySelector("[data-later]");
      laterButton.dataset.laterId = likeId;
      laterButton.classList.toggle("is-later", isInQueue(likeId));
      laterButton.setAttribute("aria-pressed", String(isInQueue(likeId)));
      const likeButton = card.querySelector("[data-like]");
      likeButton.dataset.likeId = likeId;
      likeButton.classList.toggle("is-liked", isLiked(likeId));
      likeButton.setAttribute("aria-pressed", String(isLiked(likeId)));
      paperList.appendChild(card);
    });

    if (!restPapers.length) {
      paperList.innerHTML = `<div class="empty-state">This topic has only one paper today.</div>`;
    }

    root.appendChild(section);
  });
}

function buildTopicLeadMarkup(paper, topic) {
  return `
    <div class="topic-lead-main">
      <div class="lead-top">
        <span class="lead-badge">${escapeHtml(topic.topic_label)}</span>
        <span class="paper-id">${escapeHtml(paper.paper_id)}</span>
      </div>
      <h4 class="topic-lead-title">${escapeHtml(paper.title)}</h4>
      ${renderPaperDetails(paper)}
    </div>
    <div class="topic-lead-side">
      <div class="paper-badges">${renderPaperBadges(paper)}</div>
      <div class="paper-links">
      ${renderPaperLink({ href: paper.pdf_url || paper.abs_url, label: "arXiv", brand: "arxiv" })}
      ${renderPaperLink({ href: paper.detail_url, label: "Cool", brand: "cool" })}
      ${renderLikeButton(paper)}
      </div>
    </div>
  `;
}

function getFilteredSections(report) {
  const query = state.query;
  const filtered = report.topics
    .map((topic) => {
      const papers = topic.papers.filter((paper) => {
        if (state.focusOnly && !focusTopicKeys.has(paper.topic_key)) {
          return false;
        }
        if (state.topic && topic.topic_label !== state.topic) {
          return false;
        }
        if (!query) {
          return true;
        }
        return paper.title.toLowerCase().includes(query);
      });
      return {
        ...topic,
        originalCount: topic.count,
        originalShare: topic.share,
        visibleCount: papers.length,
        papers,
      };
    })
    .filter((topic) => topic.papers.length > 0);

  const totalVisible = filtered.reduce((sum, topic) => sum + topic.visibleCount, 0);
  return filtered.map((topic) => ({
    ...topic,
    visibleShare: totalVisible ? (topic.visibleCount / totalVisible) * 100 : 0,
  }));
}

function collectVisiblePapers(sections) {
  return sections.flatMap((topic) => topic.papers);
}

function buildVisibleDistribution(sections) {
  return sections
    .map((topic) => ({
      topic_label: topic.topic_label,
      count: topic.visibleCount,
      share: topic.visibleShare,
    }))
    .sort((left, right) => right.count - left.count);
}

function getActiveFilters() {
  const filters = [];
  if (state.domain) {
    filters.push(`Domain: ${state.domain}`);
  }
  if (state.date) {
    filters.push(`Date: ${state.date}`);
  }
  if (state.topic) {
    filters.push(`Topic: ${state.topic}`);
  }
  if (state.query) {
    filters.push(`Search: ${state.query}`);
  }
  if (state.focusOnly) {
    filters.push("Mode: focus only");
  }
  return filters;
}

function hasActiveFilters() {
  return Boolean(state.domain || state.date || state.topic || state.query || state.focusOnly);
}

function buildCadenceSummary(rows, currentDomain, cadenceMode = "daily") {
  const reports = rows
    .map((row) => row.entries.find((entry) => entry?.category === currentDomain))
    .filter(Boolean);

  if (!reports.length) {
    return cadenceMode === "weekly" ? "No weekly aggregates are available yet." : "No daily reports are available yet.";
  }
  if (reports.length === 1) {
    return cadenceMode === "weekly"
      ? "Only one weekly aggregate is available so far. The cadence chart will expand automatically as more reports accumulate."
      : "Only one report is available so far. The cadence chart will expand automatically as more reports accumulate.";
  }
  const [latest, previous] = reports;
  const delta = latest.total_papers - previous.total_papers;
  const direction = delta === 0 ? "unchanged" : delta > 0 ? `increased by ${delta}` : `decreased by ${Math.abs(delta)}`;
  const label = cadenceMode === "weekly" ? latest.rowKey : latest.label;
  const unit = cadenceMode === "weekly" ? "week" : "day";
  return `${label} has ${latest.total_papers} papers, ${direction} from the previous ${unit}.`;
}

function buildCadenceMatrix(reports, cadenceMode = "daily") {
  const domains = ["cs.AI", "cs.CL", "cs.CV"];
  if (cadenceMode === "weekly") {
    const weeklyMap = new Map();

    reports.forEach((report) => {
      const weekLabel = getIsoWeekLabel(report.report_date);
      if (!weekLabel) {
        return;
      }
      const row = weeklyMap.get(weekLabel) || {
        rowKey: weekLabel,
        label: weekLabel,
        latestDate: report.report_date,
        entries: new Map(),
      };
      row.latestDate = row.latestDate > report.report_date ? row.latestDate : report.report_date;
      const entry = row.entries.get(report.category) || {
        category: report.category,
        total_papers: 0,
        report_date: report.report_date,
        data_path: report.data_path,
      };
      entry.total_papers += report.total_papers || 0;
      if (report.report_date >= entry.report_date) {
        entry.report_date = report.report_date;
        entry.data_path = report.data_path;
      }
      row.entries.set(report.category, entry);
      weeklyMap.set(weekLabel, row);
    });

    return {
      domains,
      rows: [...weeklyMap.values()]
        .sort((left, right) => right.latestDate.localeCompare(left.latestDate))
        .slice(0, CADENCE_MAX_DATES)
        .map((row) => ({
          rowKey: row.rowKey,
          label: row.label,
          entries: domains.map((domain) => row.entries.get(domain) || null),
        })),
    };
  }

  const latestDates = [...new Set(reports.map((item) => item.report_date).filter(Boolean))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, CADENCE_MAX_DATES);

  return {
    domains,
    rows: latestDates.map((report_date) => ({
      rowKey: report_date,
      label: report_date.slice(5),
      entries: domains.map((domain) => reports.find((item) => item.report_date === report_date && item.category === domain) || null),
    })),
  };
}

function renderTopicFlags(topicKey, topic) {
  const flags = [];
  if (focusTopicKeys.has(topicKey)) {
    flags.push(`<span class="topic-flag focus">Focus topic</span>`);
  }
  if (topic.visibleCount !== topic.originalCount) {
    flags.push(`<span class="topic-flag">${topic.visibleCount}/${topic.originalCount} visible</span>`);
  }
  if (topic.originalShare >= 10) {
    flags.push(`<span class="topic-flag">Heavy share</span>`);
  }
  return flags.join("");
}

function renderPaperLink({ href, label, brand }) {
  const iconSrc = brand === "arxiv" ? "./assets/arxiv-logo.svg" : "./assets/cool-favicon.ico";
  return `
    <a class="paper-link brand-${escapeAttribute(brand)}" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">
      <span class="paper-link-icon" aria-hidden="true">
        <img src="${iconSrc}" alt="" />
      </span>
      <span class="paper-link-text">${escapeHtml(label)}</span>
    </a>
  `;
}

function renderLikeButton(paper) {
  const likeId = rememberLikeRecord(paper);
  const liked = isLiked(likeId);
  return `
    <button class="paper-link later-button" type="button" data-later-id="${escapeAttribute(likeId)}" aria-pressed="false">
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
  `;
}

function rememberLikeRecord(paper) {
  const report = state.report;
  const record = createLikeRecord(paper, {
    sourceKind: "daily",
    sourceLabel: "Cool Daily",
    sourcePage: "./cool-daily.html",
    snapshotLabel: report ? `${report.report_date} · ${report.category}` : "Cool Daily",
    reportDate: report?.report_date || "",
    category: report?.category || "",
    reviewKey: state.currentPath ? createPageReviewKey("cool_daily", state.currentPath) : "",
  });
  likeRecords.set(record.like_id, record);
  return record.like_id;
}

function renderPaperBadges(paper) {
  const badges = [`<span class="paper-badge">${escapeHtml(paper.topic_label)}</span>`];
  if (focusTopicKeys.has(paper.topic_key)) {
    badges.push(`<span class="paper-badge focus">focus</span>`);
  }
  return badges.join("");
}

function renderPaperDetails(paper) {
  const authors = Array.isArray(paper.authors) ? paper.authors.filter(Boolean) : [];
  const abstract = typeof paper.abstract === "string" ? paper.abstract.trim() : "";
  if (!authors.length && !abstract) {
    return "";
  }

  return `
    <div class="paper-extra-stack">
      ${
        authors.length
          ? `
            <div class="paper-authors-box">
              <span class="paper-detail-label">Authors</span>
              <p class="paper-authors-line">${escapeHtml(authors.join(", "))}</p>
            </div>
          `
          : ""
      }
      ${
        abstract
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
              <p>${escapeHtml(abstract)}</p>
            </details>
          `
          : ""
      }
    </div>
  `;
}

function renderEmpty(message = "No report snapshots are available yet.") {
  document.querySelector("#home-board-summary").textContent = message;
  document.querySelector("#home-categories").innerHTML =
    `<div class="empty-state">No daily reports are available yet. Run the fetch and report generation scripts first, then rebuild site data.</div>`;
  document.querySelector("#topic-sections").innerHTML =
    `<section class="glass-card empty-state">No daily reports are available yet. Run the fetch and report generation scripts first, then rebuild site data.</section>`;
  const tagMap = document.querySelector("#daily-tag-map");
  if (tagMap) {
    tagMap.innerHTML = "";
  }
  renderFloatingToc([]);
}

function renderFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector("#topic-sections").innerHTML =
    `<section class="glass-card empty-state">Site load failed: ${escapeHtml(message)}</section>`;
  renderFloatingToc([]);
}

function renderFloatingToc(items) {
  if (!floatingTocRoot) {
    return;
  }
  if (!items.length) {
    tocObserver?.disconnect();
    floatingTocRoot.innerHTML = `<span class="empty-state">No sections available yet.</span>`;
    return;
  }

  floatingTocRoot.innerHTML = items
    .map(
      (item) => `
        <a class="floating-toc-link${item.child ? " is-child" : ""}" href="#${escapeAttribute(item.id)}" data-toc-target="${escapeAttribute(
          item.id
        )}">
          <span>${escapeHtml(item.label)}</span>
        </a>
      `
    )
    .join("");

  floatingTocRoot.querySelectorAll("[data-toc-target]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById(link.dataset.tocTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  bindTocObserver(items.map((item) => item.id));
}

function bindTocObserver(ids) {
  tocObserver?.disconnect();
  const links = [...floatingTocRoot.querySelectorAll("[data-toc-target]")];
  const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
  if (!sections.length) {
    return;
  }

  tocObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (!visible) {
        return;
      }
      const activeId = visible.target.id;
      links.forEach((link) => link.classList.toggle("active", link.dataset.tocTarget === activeId));
    },
    {
      rootMargin: "-25% 0px -55% 0px",
      threshold: [0.1, 0.3, 0.6],
    }
  );

  sections.forEach((section) => tocObserver.observe(section));
  links.forEach((link, index) => link.classList.toggle("active", index === 0));
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.json();
}

function sectionIdFromTopic(topic) {
  return `topic-${topic.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")}`;
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function getHomeCategoryCards(manifest, scopedReports = null) {
  if (Array.isArray(scopedReports)) {
    const seen = new Set();
    return scopedReports.filter((report) => {
      if (seen.has(report.category)) {
        return false;
      }
      seen.add(report.category);
      return true;
    });
  }

  if (Array.isArray(manifest?.latest_by_category) && manifest.latest_by_category.length) {
    return manifest.latest_by_category;
  }

  const seen = new Set();
  return (manifest?.reports || []).filter((report) => {
    if (seen.has(report.category)) {
      return false;
    }
    seen.add(report.category);
    return true;
  });
}

function getIsoWeekLabel(value) {
  if (!value) {
    return "";
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
