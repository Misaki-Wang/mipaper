import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js?v=20260319-5";
import { bindQueueButtons, initQueue, subscribeQueue } from "./paper_queue.js?v=20260319-5";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=20260319-5";
import { createPageReviewKey, initReviewSync, isPageReviewed, setPageReviewed, subscribePageReviews } from "./reading_state.js?v=20260319-4";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=20260319-5";
import { mountAppToolbar } from "./app_toolbar.js?v=20260319-11";
import { bindBranchNav } from "./branch_nav.js?v=20260319-4";
import { bindLibraryNav } from "./library_nav.js?v=20260319-4";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=20260319-7";

mountAppToolbar("#conference-toolbar-root", {
  prefix: "conference",
  filtersTemplateId: "conference-toolbar-filters",
  branchActiveKey: "conference",
  libraryActiveKey: null,
});

const manifestUrl = "./data/conference/manifest.json";
const CONFERENCE_HOME_PAGE_SIZE = 6;

const state = {
  manifest: null,
  report: null,
  currentPath: "",
  homePage: 0,
  year: "",
  series: "",
  query: "",
  subject: "",
  topic: "",
  focusOnly: false,
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);

const yearFilter = document.querySelector("#conference-year-filter");
const seriesFilter = document.querySelector("#conference-series-filter");
const conferenceSelect = document.querySelector("#conference-select");
const subjectFilter = document.querySelector("#conference-subject-filter");
const topicFilter = document.querySelector("#conference-topic-filter");
const searchInput = document.querySelector("#conference-search");
const focusOnlyInput = document.querySelector("#conference-focus-only");
const resetFiltersButton = document.querySelector("#conference-reset-filters");
const sidebarToggleButton = document.querySelector("#conference-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#conference-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#conference-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#conference-filters-menu");
const backToTopButton = document.querySelector("#conference-back-to-top");
const floatingTocRoot = document.querySelector("#conference-floating-toc");
const reviewToggleButton = document.querySelector("#conference-review-toggle");
const reviewToggleMeta = document.querySelector("#conference-review-toggle-meta");
const heroReviewStatus = document.querySelector("#conference-hero-review-status");
const likeRecords = new Map();
let tocObserver = null;
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
  bindToolbarQuickAdd("conference", { target: "later" });
  bindBranchAuthToolbar("conference");
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
  populateScopeFilters(manifest.reports || []);
  populateConferenceSelect(getScopedReports(manifest.reports || []));
  renderVenueCards(manifest);

  if (!manifest.reports.length) {
    renderEmpty();
    return;
  }

  await loadReport(manifest.default_report_path || manifest.reports[0].data_path);
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
    const reviewKey = createPageReviewKey("conference", state.currentPath);
    const next = !isPageReviewed(reviewKey);
    setPageReviewed(reviewKey, next, {
      branch: "Conference",
      snapshot_label: state.report.venue,
    });
    renderReviewState();
  });
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
  const reviewed = isPageReviewed(createPageReviewKey("conference", state.currentPath));
  reviewToggleButton.classList.toggle("is-reviewed", reviewed);
  reviewToggleButton.setAttribute("aria-pressed", String(reviewed));
  reviewToggleMeta.textContent = reviewed ? `Reviewed ${state.report.venue}` : `Mark ${state.report.venue} as reviewed`;
  if (heroReviewStatus) {
    heroReviewStatus.textContent = reviewed ? "Reviewed" : "Not reviewed";
    heroReviewStatus.classList.toggle("is-reviewed", reviewed);
  }
}

function bindFilters() {
  yearFilter.addEventListener("change", async (event) => {
    state.year = event.target.value;
    await handleVenueScopeChange();
  });

  seriesFilter.addEventListener("change", async (event) => {
    state.series = event.target.value;
    await handleVenueScopeChange();
  });

  conferenceSelect.addEventListener("change", async (event) => {
    const path = event.target.value;
    if (path) {
      await loadReport(path);
    }
  });

  subjectFilter.addEventListener("change", (event) => {
    state.subject = event.target.value;
    renderReport();
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
    state.year = "";
    state.series = "";
    state.query = "";
    state.subject = "";
    state.topic = "";
    state.focusOnly = false;
    yearFilter.value = "";
    seriesFilter.value = "";
    searchInput.value = "";
    subjectFilter.value = "";
    topicFilter.value = "";
    focusOnlyInput.checked = false;
    handleVenueScopeChange();
  });
}

async function loadReport(path) {
  const report = await fetchJson(path);
  state.report = report;
  state.currentPath = path;
  state.query = "";
  state.subject = "";
  state.topic = "";
  state.focusOnly = false;
  conferenceSelect.value = path;
  searchInput.value = "";
  subjectFilter.value = "";
  topicFilter.value = "";
  focusOnlyInput.checked = false;
  populateSubjectFilter(report.subject_distribution || []);
  populateTopicFilter(report.topic_distribution || []);
  renderVenueCards(state.manifest, path, getScopedReports(state.manifest.reports || []));
  renderReviewState();
  renderReport();
}

function populateScopeFilters(reports) {
  const years = [...new Set(reports.map((report) => report.venue_year).filter(Boolean))].sort((left, right) =>
    right.localeCompare(left)
  );
  const series = [...new Set(reports.map((report) => report.venue_series).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );

  yearFilter.innerHTML = `<option value="">All Years</option>${years
    .map((year) => `<option value="${escapeAttribute(year)}">${escapeHtml(year)}</option>`)
    .join("")}`;
  seriesFilter.innerHTML = `<option value="">All Conferences</option>${series
    .map((name) => `<option value="${escapeAttribute(name)}">${escapeHtml(name)}</option>`)
    .join("")}`;
}

function populateConferenceSelect(reports) {
  conferenceSelect.innerHTML = reports
    .map(
      (report) => `
        <option value="${escapeAttribute(report.data_path)}">
          ${escapeHtml(report.venue)} · ${report.total_papers} papers
        </option>
      `
    )
    .join("");
}

function getScopedReports(reports) {
  return reports.filter((report) => {
    if (state.year && report.venue_year !== state.year) {
      return false;
    }
    if (state.series && report.venue_series !== state.series) {
      return false;
    }
    return true;
  });
}

async function handleVenueScopeChange() {
  const scopedReports = getScopedReports(state.manifest?.reports || []);
  populateConferenceSelect(scopedReports);
  renderVenueCards(state.manifest, state.currentPath, scopedReports);

  if (!scopedReports.length) {
    state.report = null;
    state.currentPath = "";
    renderReviewState();
    renderEmpty("No conference snapshots match the current tags.");
    return;
  }

  if (!scopedReports.some((report) => report.data_path === state.currentPath)) {
    await loadReport(scopedReports[0].data_path);
    return;
  }

  conferenceSelect.value = state.currentPath;
  renderReviewState();
  renderReport();
}

function populateSubjectFilter(subjects) {
  subjectFilter.innerHTML = `<option value="">All Subjects</option>${subjects
    .map(
      (subject) =>
        `<option value="${escapeAttribute(subject.subject_label)}">${escapeHtml(subject.subject_label)} · ${subject.count}</option>`
    )
    .join("")}`;
}

function populateTopicFilter(topics) {
  topicFilter.innerHTML = `<option value="">All Topics</option>${topics
    .map(
      (topic) =>
        `<option value="${escapeAttribute(topic.topic_label)}">${escapeHtml(topic.topic_label)} · ${topic.count}</option>`
    )
    .join("")}`;
}

function renderVenueCards(manifest, activePath = "", scopedReports = null) {
  const root = document.querySelector("#conference-cards");
  const summary = document.querySelector("#conference-board-summary");
  const paginationRoot = document.querySelector("#conference-cards-pagination");
  const reports = Array.isArray(scopedReports) ? scopedReports : manifest?.reports || [];

  if (!reports.length) {
    summary.textContent = scopedReports ? "No conference snapshots are available for the current tags." : "No conference snapshots are available yet.";
    root.innerHTML = `<div class="empty-state">Generate conference reports first, then refresh the page.</div>`;
    paginationRoot.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(reports.length / CONFERENCE_HOME_PAGE_SIZE);
  const activeIndex = activePath ? reports.findIndex((report) => report.data_path === activePath) : -1;
  const safePage = activeIndex >= 0
    ? Math.floor(activeIndex / CONFERENCE_HOME_PAGE_SIZE)
    : Math.min(state.homePage, totalPages - 1);
  const start = safePage * CONFERENCE_HOME_PAGE_SIZE;
  const pageReports = reports.slice(start, start + CONFERENCE_HOME_PAGE_SIZE);
  const end = Math.min(start + CONFERENCE_HOME_PAGE_SIZE, reports.length);
  state.homePage = safePage;
  const totalPapers = reports.reduce((sum, report) => sum + (report.total_papers || 0), 0);
  summary.textContent = `Currently indexed: ${reports.length} conference snapshots with ${totalPapers} papers in total. Showing ${start + 1}-${end}. Click a card to switch the active analysis.`;
  root.innerHTML = pageReports
    .map((report) => {
      const topSubject = report.subject_distribution?.[0];
      const topTopic = report.top_topics?.[0];
      const coverage = formatCoverage(report.total_papers, report.declared_total, report.capture_ratio);
      return `
        <button
          class="home-category-card ${report.data_path === activePath ? "active" : ""}"
          type="button"
          data-conference-report="${escapeAttribute(report.data_path)}"
        >
          <div class="home-category-card-top">
            <span class="home-category-label">${escapeHtml(report.venue)}</span>
            <span class="home-category-date">${escapeHtml(report.venue_year)}</span>
          </div>
          <strong class="home-category-count">${report.total_papers} papers</strong>
          <p class="home-category-topic">${escapeHtml(topSubject?.subject_label || "No subject")} · ${
            topSubject ? `${topSubject.share.toFixed(2)}%` : "-"
          }</p>
          <div class="home-category-meta">
            <span>${escapeHtml(topTopic?.topic_label || "No topic summary")}</span>
            <span>${escapeHtml(coverage)}</span>
          </div>
        </button>
      `;
    })
    .join("");

  paginationRoot.innerHTML = totalPages > 1
    ? `<div class="pagination conference-home-pagination">
        <button class="pill-button" type="button" data-conference-page="prev" ${safePage === 0 ? "disabled" : ""}>← Prev</button>
        <span class="pagination-info">Page ${safePage + 1} / ${totalPages}</span>
        <button class="pill-button" type="button" data-conference-page="next" ${safePage >= totalPages - 1 ? "disabled" : ""}>Next →</button>
      </div>`
    : "";

  root.querySelectorAll("[data-conference-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.conferenceReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });

  paginationRoot.querySelectorAll("[data-conference-page]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.conferencePage === "prev" && state.homePage > 0) {
        state.homePage -= 1;
      } else if (button.dataset.conferencePage === "next" && state.homePage < totalPages - 1) {
        state.homePage += 1;
      }
      renderVenueCards(state.manifest, "", reports);
    });
  });
}

function renderReport() {
  if (!state.report) {
    renderEmpty();
    return;
  }

  const report = state.report;
  likeRecords.clear();
  const visiblePapers = getVisiblePapers(report);
  const sections = groupBySubject(visiblePapers);
  renderHero(report, visiblePapers);
  renderOverview(report, visiblePapers, sections);
  renderTagMap(report);
  renderSubjectDistribution(report, visiblePapers);
  renderSpotlight(report, visiblePapers);
  renderSubjectRadar(visiblePapers);
  renderResults(report, visiblePapers, sections);
  renderSubjectSections(report, sections);
  renderFloatingToc([
    { id: "conference-overview-section", label: "Overview" },
    { id: "conference-tags-section", label: "Current Tags" },
    { id: "conference-spotlight-section", label: "Spotlight" },
    { id: "conference-radar-section", label: "Subject Radar" },
    { id: "conference-results-section", label: "Results" },
    ...sections.slice(0, 10).map((section) => ({
      id: sectionIdFromSubject(section.subject_label),
      label: section.subject_label,
      child: true,
    })),
  ]);
  bindLikeButtons(document, likeRecords);
  bindQueueButtons(document, likeRecords);
}

function renderTagMap(report) {
  const topTopic = report.topic_distribution?.[0]?.topic_label || "Other AI";
  document.querySelector("#conference-tag-map").innerHTML = [
    {
      label: "Year",
      value: report.venue_year || "-",
      meta: state.year ? "current filtered year" : "current venue year",
    },
    {
      label: "Conference",
      value: report.venue_series || report.venue || "-",
      meta: state.series ? "current filtered conference" : "current conference series",
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

function renderHero(report, visiblePapers) {
  const topTopic = report.topic_distribution?.[0];
  const focusCount = visiblePapers.filter((paper) => focusTopicKeys.has(paper.topic_key)).length;
  const focusShare = visiblePapers.length ? (focusCount / visiblePapers.length) * 100 : 0;
  document.querySelector("#conference-hero-venue").textContent = report.venue;
  document.querySelector("#conference-hero-total").textContent = String(report.total_papers);
  document.querySelector("#conference-hero-subjects").textContent = String(report.subject_distribution.length);
  document.querySelector("#conference-hero-classifier").textContent = report.classifier;
  document.querySelector("#conference-hero-updated").textContent = formatTime(report.generated_at);
  document.querySelector("#conference-hero-signals").innerHTML = [
    `<div class="signal-chip"><span>Top Subject</span><strong>${escapeHtml(
      report.subject_distribution?.[0]?.subject_label || "-"
    )}</strong></div>`,
    `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(topTopic?.topic_label || "-")}</strong></div>`,
    `<div class="signal-chip"><span>Coverage</span><strong>${escapeHtml(
      formatCoverage(report.total_papers, report.declared_total, report.capture_ratio)
    )}</strong></div>`,
    `<div class="signal-chip"><span>Focus Coverage</span><strong>${focusCount} papers / ${focusShare.toFixed(
      2
    )}%</strong></div>`,
  ].join("");
}

function renderOverview(report, visiblePapers, sections) {
  const topSubject = report.subject_distribution?.[0];
  const focusCount = visiblePapers.filter((paper) => focusTopicKeys.has(paper.topic_key)).length;
  const focusShare = visiblePapers.length ? (focusCount / visiblePapers.length) * 100 : 0;
  document.querySelector("#conference-overview-title").textContent = `${report.venue} Conference Overview`;
  document.querySelector("#conference-source-link").href = report.source_url;
  document.querySelector("#conference-source-link").textContent = "Source";
  document.querySelector("#conference-capture-summary").textContent = buildCaptureSummary(report);
  document.querySelector("#conference-overview-summary").textContent = topSubject
    ? `${topSubject.subject_label} is the largest subject in the current conference, accounting for ${topSubject.share.toFixed(2)}%, with ${topSubject.count} papers.`
    : "This report does not have subject information yet.";
  document.querySelector("#conference-focus-summary").textContent = `${focusCount} papers hit your focus topics, accounting for ${focusShare.toFixed(
    2
  )}% of the current view.`;
  document.querySelector("#conference-breadth-summary").textContent = `Currently visible: ${visiblePapers.length} papers across ${sections.length} subjects.`;
}

function renderSubjectDistribution(report, visiblePapers) {
  const root = document.querySelector("#conference-subject-distribution");
  const distribution = computeSubjectDistribution(visiblePapers.length ? visiblePapers : report.papers);
  root.innerHTML = distribution
    .map(
      (item) => `
        <div class="distribution-item">
          <div class="distribution-top">
            <span>${escapeHtml(item.subject_label)}</span>
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

function renderSpotlight(report, visiblePapers) {
  const root = document.querySelector("#conference-spotlight");
  const focusPapers = visiblePapers.filter((paper) => focusTopicKeys.has(paper.topic_key)).slice(0, 6);
  const papers = focusPapers.length ? focusPapers : visiblePapers.slice(0, 6);

  if (!papers.length) {
    root.innerHTML = `<div class="empty-state">No papers match the current filters.</div>`;
    return;
  }

  root.innerHTML = papers.map((paper) => renderPaperCard(paper, "conference-paper-card spotlight")).join("");
}

function renderSubjectRadar(visiblePapers) {
  const root = document.querySelector("#conference-subject-radar");
  const sections = groupBySubject(visiblePapers).slice(0, 8);

  if (!sections.length) {
    root.innerHTML = `<div class="empty-state">No subjects are available for diagnostics under the current filters.</div>`;
    return;
  }

  root.innerHTML = sections
    .map((section) => {
      const topTopic = computeTopicDistribution(section.papers)[0];
      const focusCount = section.papers.filter((paper) => focusTopicKeys.has(paper.topic_key)).length;
      const focusShare = section.papers.length ? (focusCount / section.papers.length) * 100 : 0;
      return `
        <article class="subject-radar-card">
          <div class="subject-radar-top">
            <div>
              <span class="subject-radar-kicker">Subject</span>
              <h3>${escapeHtml(section.subject_label)}</h3>
            </div>
            <span class="subject-radar-count">${section.papers.length} papers</span>
          </div>
          <div class="subject-radar-metrics">
            <div class="subject-radar-metric">
              <span>Dominant Topic</span>
              <strong>${escapeHtml(topTopic?.topic_label || "Other AI")}</strong>
            </div>
            <div class="subject-radar-metric">
              <span>Topic Share</span>
              <strong>${topTopic ? `${topTopic.share.toFixed(2)}%` : "-"}</strong>
            </div>
            <div class="subject-radar-metric">
              <span>Focus Density</span>
              <strong>${focusShare.toFixed(2)}%</strong>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderResults(report, visiblePapers, sections) {
  const activeFilters = getActiveFilters();
  document.querySelector("#conference-results-title").textContent = activeFilters.length
    ? `${visiblePapers.length} papers visible after filtering`
    : `${report.total_papers} papers in view`;
  document.querySelector("#conference-results-stats").innerHTML = [
    renderResultStat(
      "Visible Papers",
      visiblePapers.length,
      activeFilters.length ? `of ${report.total_papers}` : formatCoverage(report.total_papers, report.declared_total, report.capture_ratio)
    ),
    renderResultStat(
      "Visible Subjects",
      sections.length,
      activeFilters.length ? `of ${report.subject_distribution.length}` : "all subject buckets"
    ),
    renderResultStat(
      "View Mode",
      state.focusOnly ? "Focus" : "Full scan",
      state.subject || state.topic || "cross-subject browsing"
    ),
  ].join("");
  document.querySelector("#conference-active-filters").innerHTML = activeFilters.length
    ? activeFilters.map((item) => `<span class="active-filter-pill">${escapeHtml(item)}</span>`).join("")
    : `<span class="active-filter-pill">No filters applied. You are looking at the full conference set.</span>`;
  resetFiltersButton.disabled = !activeFilters.length;
}

function renderSubjectSections(report, sections) {
  const root = document.querySelector("#conference-subject-sections");
  if (!sections.length) {
    root.innerHTML = `<div class="glass-card empty-state">No subjects match the current filters.</div>`;
    return;
  }

  root.innerHTML = sections
    .map((section, index) => {
      const topTopic = computeTopicDistribution(section.papers)[0];
      return `
        <section id="${escapeAttribute(sectionIdFromSubject(section.subject_label))}" class="glass-card conference-subject-card">
          <div class="conference-subject-header">
            <div>
              <p class="eyebrow">SUBJECT</p>
              <h3>${index + 1}. ${escapeHtml(section.subject_label)}</h3>
            </div>
            <div class="conference-subject-meta">
              <span>${section.papers.length} papers</span>
              <span>${topTopic ? escapeHtml(topTopic.topic_label) : "No topic summary"}</span>
            </div>
          </div>
          <div class="conference-paper-grid">
            ${section.papers.map((paper) => renderPaperCard(paper, "conference-paper-card")).join("")}
          </div>
        </section>
      `;
    })
    .join("");
}

function renderPaperCard(paper, className) {
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
  const subjects = paper.subjects?.length
    ? `<div class="conference-paper-subjects">${paper.subjects
        .map((subject) => `<span>${escapeHtml(subject)}</span>`)
        .join("")}</div>`
    : "";
  return `
    <article class="${className}">
      <div class="conference-paper-top">
        <span class="paper-badge">${escapeHtml(paper.topic_label || "Other AI")}</span>
      </div>
      <h4>${escapeHtml(paper.title)}</h4>
      ${subjects}
      <div class="paper-authors-box">
        <span class="paper-detail-label">Authors</span>
        <p class="paper-authors-line">${authors}</p>
      </div>
      ${abstract}
      <div class="paper-links">
        ${paper.pdf_url || paper.abs_url ? renderPaperLink(paper.pdf_url || paper.abs_url, "OpenReview", "openreview") : ""}
        ${paper.detail_url ? renderPaperLink(paper.detail_url, "Cool", "cool") : ""}
        ${renderLikeButton(paper)}
      </div>
    </article>
  `;
}

function renderPaperLink(href, label, brand) {
  const iconSrc =
    brand === "openreview"
      ? "./assets/openreview-logo.svg"
      : brand === "arxiv"
      ? "./assets/arxiv-logo.svg"
      : "./assets/cool-favicon.ico";

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
    sourceKind: "conference",
    sourceLabel: "Conference",
    sourcePage: "./conference.html",
    snapshotLabel: report ? report.venue : "Conference",
    venue: report?.venue || "",
    venueSeries: report?.venue_series || "",
    venueYear: report?.venue_year || "",
    reviewKey: state.currentPath ? createPageReviewKey("conference", state.currentPath) : "",
  });
  likeRecords.set(record.like_id, record);
  return record.like_id;
}

function getVisiblePapers(report) {
  return report.papers.filter((paper) => {
    if (state.subject && !(paper.subjects || []).includes(state.subject)) {
      return false;
    }
    if (state.topic && (paper.topic_label || "Other AI") !== state.topic) {
      return false;
    }
    if (state.query && !paper.title.toLowerCase().includes(state.query)) {
      return false;
    }
    if (state.focusOnly && !focusTopicKeys.has(paper.topic_key)) {
      return false;
    }
    return true;
  });
}

function groupBySubject(papers) {
  const map = new Map();
  papers.forEach((paper) => {
    const subject = paper.subjects?.[0] || "Unspecified";
    if (!map.has(subject)) {
      map.set(subject, []);
    }
    map.get(subject).push(paper);
  });
  return [...map.entries()]
    .map(([subject_label, subjectPapers]) => ({ subject_label, papers: subjectPapers }))
    .sort((a, b) => b.papers.length - a.papers.length || a.subject_label.localeCompare(b.subject_label));
}

function computeSubjectDistribution(papers) {
  const counts = new Map();
  papers.forEach((paper) => {
    const subject = paper.subjects?.[0] || "Unspecified";
    counts.set(subject, (counts.get(subject) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([subject_label, count]) => ({
      subject_label,
      count,
      share: papers.length ? (count / papers.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.subject_label.localeCompare(b.subject_label));
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
    .sort((a, b) => b.count - a.count || a.topic_label.localeCompare(b.topic_label));
}

function getActiveFilters() {
  const filters = [];
  if (state.year) {
    filters.push(`Year: ${state.year}`);
  }
  if (state.series) {
    filters.push(`Conference: ${state.series}`);
  }
  if (state.subject) {
    filters.push(`Subject: ${state.subject}`);
  }
  if (state.query) {
    filters.push(`Search: ${state.query}`);
  }
  if (state.topic) {
    filters.push(`Topic: ${state.topic}`);
  }
  if (state.focusOnly) {
    filters.push("Focus only");
  }
  return filters;
}

function hasActiveFilters() {
  return Boolean(state.year || state.series || state.subject || state.query || state.topic || state.focusOnly);
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

function renderEmpty(message = "No conference snapshots are available yet.") {
  document.querySelector("#conference-board-summary").textContent = message;
  document.querySelector("#conference-cards").innerHTML =
    `<div class="empty-state">Run the conference report generator first, then refresh the page.</div>`;
  document.querySelector("#conference-cards-pagination").innerHTML = "";
  document.querySelector("#conference-spotlight").innerHTML = "";
  document.querySelector("#conference-subject-sections").innerHTML = "";
  const tagMap = document.querySelector("#conference-tag-map");
  if (tagMap) {
    tagMap.innerHTML = "";
  }
  renderFloatingToc([]);
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}

function formatTime(isoString) {
  if (!isoString) {
    return "-";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function renderFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector("#conference-board-summary").textContent = "Conference page failed to load.";
  document.querySelector("#conference-cards").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  document.querySelector("#conference-cards-pagination").innerHTML = "";
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

function buildCaptureSummary(report) {
  if (!report.declared_total) {
    return `Captured ${report.total_papers} papers, and the source page did not declare a total.`;
  }
  const ratio = typeof report.capture_ratio === "number" ? `${report.capture_ratio.toFixed(2)}%` : "-";
  const health = report.is_complete ? "The current capture covers the declared total." : "The current capture does not yet cover the declared total. Continue fetching.";
  return `Captured ${report.total_papers} / ${report.declared_total} papers，coverage ${ratio}。${health}`;
}

function formatCoverage(totalPapers, declaredTotal, captureRatio) {
  if (!declaredTotal) {
    return `${totalPapers} captured`;
  }
  const ratio = typeof captureRatio === "number" ? captureRatio.toFixed(2) : ((totalPapers / declaredTotal) * 100).toFixed(2);
  return `${totalPapers}/${declaredTotal} · ${ratio}%`;
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

function sectionIdFromSubject(subject) {
  return `subject-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
