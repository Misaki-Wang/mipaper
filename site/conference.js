import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js?v=3b466b6556";
import { bindQueueButtons, initQueue, subscribeQueue } from "./paper_queue.js?v=033bd186d1";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { mountAppToolbar } from "./app_toolbar.js?v=a364077e66";
import { buildBranchReviewKey, createBranchReviewController, initBranchReportPage } from "./branch_page.js?v=f27a328acc";
import { bindBranchListDetails, renderBranchDetailGroup, renderBranchDetailSection, renderBranchListDetails } from "./branch_details.js?v=bf87e132c5";
import { createLatestTaskRunner } from "./request_gate.js?v=f527e8e81d";
import { createFloatingTocController } from "./floating_toc.js?v=a9ffd5aa93";
import { validateConferenceManifest, validateConferenceReport } from "./site_contract.js?v=12344e596d";
import { escapeAttribute, escapeHtml, fetchJson, formatZhTime, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";

mountAppToolbar("#conference-toolbar-root", {
  prefix: "conference",
  filtersTemplateId: "conference-toolbar-filters",
  branchActiveKey: "conference",
  libraryActiveKey: null,
});

const manifestUrl = "./data/conference/manifest.json";
const CONFERENCE_HOME_PAGE_SIZE = 6;
const CONFERENCE_SECTION_INITIAL_SIZE = 8;
const CONFERENCE_SECTION_LOAD_MORE_SIZE = 16;
const CONFERENCE_SEARCH_DEBOUNCE_MS = 160;
const CONFERENCE_AUTO_LOAD_SUPPRESS_MS = 4000;
const CONFERENCE_USER_SCROLL_INTENT_MS = 1400;

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
const subjectVisibleCounts = new Map();
const runLatestReportLoad = createLatestTaskRunner();
const floatingToc = createFloatingTocController(floatingTocRoot);
let searchInputTimer = 0;
let subjectAutoLoadObserver = null;
let autoLoadResumeTimer = 0;
let autoLoadSuppressedUntil = 0;
let pendingTocTargetId = "";
let userScrollIntentUntil = 0;
const reviewController = createBranchReviewController({
  reviewScope: "conference",
  branchLabel: "Conference",
  reviewToggleButton,
  reviewToggleMeta,
  heroReviewStatus,
  getCurrentReport: () => state.report,
  getCurrentPath: () => state.currentPath,
  getSnapshotLabel: (report) => report.venue,
});
const { bindReviewToggle, renderReviewState } = reviewController;

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  initSubjectAutoLoadObserver();
  await initBranchReportPage({
    pageKey: "conference",
    toolbarPrefix: "conference",
    manifestUrl,
    sidebarToggleButton,
    sidebarToggleLabel,
    sidebarToggleIcon,
    filterMenuPanel,
    backToTopButton,
    likeRecords,
    bindPageControls: () => {
      bindFilters();
      bindSubjectSectionActions();
      bindUserScrollIntentTracking();
      bindTocAutoLoadGuard();
      bindReviewToggle();
    },
    renderReviewState,
    onManifestLoaded: (manifest) => {
      state.manifest = manifest;
      populateScopeFilters(manifest.reports || []);
      populateConferenceSelect(getScopedReports(manifest.reports || []));
      renderVenueCards(manifest);
    },
    onEmptyManifest: () => {
      renderEmpty();
    },
    getInitialReportPath: (manifest) => manifest.default_report_path || manifest.reports[0]?.data_path || "",
    manifestValidator: validateConferenceManifest,
    loadReport,
  });
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
    const nextQuery = event.target.value.trim().toLowerCase();
    window.clearTimeout(searchInputTimer);
    searchInputTimer = window.setTimeout(() => {
      state.query = nextQuery;
      renderReport();
    }, CONFERENCE_SEARCH_DEBOUNCE_MS);
  });

  focusOnlyInput.addEventListener("change", (event) => {
    state.focusOnly = event.target.checked;
    renderReport();
  });

  resetFiltersButton.addEventListener("click", () => {
    if (!hasActiveFilters()) {
      return;
    }
    window.clearTimeout(searchInputTimer);
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
  const result = await runLatestReportLoad(() => fetchJson(path, { validator: validateConferenceReport }));
  if (result.stale) {
    return;
  }
  const report = result.value;
  window.clearTimeout(searchInputTimer);
  state.report = report;
  state.currentPath = path;
  state.query = "";
  state.subject = "";
  state.topic = "";
  state.focusOnly = false;
  subjectVisibleCounts.clear();
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
  floatingToc.render([
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
  bindBranchListDetails(document);
}

function bindSubjectSectionActions() {
  const root = document.querySelector("#conference-subject-sections");
  if (!root || root.dataset.bound === "true") {
    return;
  }

  root.dataset.bound = "true";
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-conference-subject-action]");
    if (!button) {
      return;
    }

    const sectionKey = button.dataset.conferenceSectionKey || "";
    if (!sectionKey) {
      return;
    }

    const section = findVisibleSection(sectionKey);
    if (!section) {
      return;
    }

    if (button.dataset.conferenceSubjectAction === "more") {
      expandSubjectSection(sectionKey, section.papers.length);
    } else if (button.dataset.conferenceSubjectAction === "less") {
      subjectVisibleCounts.set(sectionKey, Math.min(CONFERENCE_SECTION_INITIAL_SIZE, section.papers.length));
    }

    rerenderSubjectSections();
  });
}

function bindTocAutoLoadGuard() {
  if (!floatingTocRoot || floatingTocRoot.dataset.autoLoadGuardBound === "true") {
    return;
  }

  floatingTocRoot.dataset.autoLoadGuardBound = "true";
  floatingTocRoot.addEventListener("click", (event) => {
    const link = event.target.closest("[data-toc-target]");
    if (!link) {
      return;
    }
    suppressConferenceAutoLoad(link.dataset.tocTarget || "");
  });

  window.addEventListener(
    "scroll",
    () => {
      if (!pendingTocTargetId) {
        return;
      }
      maybeReleaseTocAutoLoadSuppression();
    },
    { passive: true }
  );
}

function bindUserScrollIntentTracking() {
  if (document.body.dataset.conferenceScrollIntentBound === "true") {
    return;
  }

  document.body.dataset.conferenceScrollIntentBound = "true";
  const markIntent = () => {
    userScrollIntentUntil = Date.now() + CONFERENCE_USER_SCROLL_INTENT_MS;
  };

  window.addEventListener("wheel", markIntent, { passive: true });
  window.addEventListener("touchmove", markIntent, { passive: true });
  window.addEventListener("keydown", (event) => {
    if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(event.key)) {
      markIntent();
    }
  });
}

function initSubjectAutoLoadObserver() {
  if (subjectAutoLoadObserver || typeof IntersectionObserver !== "function") {
    return;
  }

  subjectAutoLoadObserver = new IntersectionObserver(
    (entries) => {
      if (isConferenceAutoLoadSuppressed() || !hasRecentUserScrollIntent()) {
        return;
      }
      for (const entry of entries) {
        if (!entry.isIntersecting) {
          continue;
        }

        const sectionKey = entry.target.dataset.conferenceAutoLoad || "";
        const totalPapers = Number(entry.target.dataset.conferenceTotalPapers || "0");
        if (!sectionKey || !Number.isFinite(totalPapers) || totalPapers <= 0) {
          continue;
        }

        if (!expandSubjectSection(sectionKey, totalPapers)) {
          continue;
        }

        rerenderSubjectSections();
        break;
      }
    },
    {
      root: null,
      rootMargin: "280px 0px",
      threshold: 0.01,
    }
  );
}

function suppressConferenceAutoLoad(targetId = "", duration = CONFERENCE_AUTO_LOAD_SUPPRESS_MS) {
  pendingTocTargetId = targetId || pendingTocTargetId;
  autoLoadSuppressedUntil = Date.now() + duration;
  window.clearTimeout(autoLoadResumeTimer);
  autoLoadResumeTimer = window.setTimeout(() => {
    autoLoadResumeTimer = 0;
    pendingTocTargetId = "";
    refreshSubjectAutoLoadObserver();
  }, duration);
}

function isConferenceAutoLoadSuppressed() {
  return Boolean(pendingTocTargetId) || Date.now() < autoLoadSuppressedUntil;
}

function hasRecentUserScrollIntent() {
  return Date.now() < userScrollIntentUntil;
}

function maybeReleaseTocAutoLoadSuppression() {
  if (!pendingTocTargetId) {
    return;
  }

  const target = document.getElementById(pendingTocTargetId);
  if (!target) {
    pendingTocTargetId = "";
    refreshSubjectAutoLoadObserver();
    return;
  }

  const top = target.getBoundingClientRect().top;
  if (top <= 120 && top >= -24) {
    pendingTocTargetId = "";
    window.clearTimeout(autoLoadResumeTimer);
    autoLoadResumeTimer = 0;
    autoLoadSuppressedUntil = 0;
    refreshSubjectAutoLoadObserver();
  }
}

function refreshSubjectAutoLoadObserver() {
  if (!subjectAutoLoadObserver) {
    return;
  }

  subjectAutoLoadObserver.disconnect();
  document.querySelectorAll("[data-conference-auto-load]").forEach((node) => {
    subjectAutoLoadObserver.observe(node);
  });
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
  document.querySelector("#conference-hero-updated").textContent = formatZhTime(report.generated_at);
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
      "Scope",
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
    refreshSubjectAutoLoadObserver();
    return;
  }

  root.innerHTML = sections
    .map((section, index) => {
      const topTopic = computeTopicDistribution(section.papers)[0];
      const sectionKey = sectionIdFromSubject(section.subject_label);
      const visibleCount = readVisibleSubjectCount(sectionKey, section.papers.length);
      const visiblePapers = section.papers.slice(0, visibleCount);
      const hasMore = visibleCount < section.papers.length;
      const canCollapse = visibleCount > Math.min(CONFERENCE_SECTION_INITIAL_SIZE, section.papers.length);
      return `
        <section id="${escapeAttribute(sectionKey)}" class="glass-card conference-subject-card">
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
            ${visiblePapers.map((paper) => renderPaperCard(paper, "conference-paper-card")).join("")}
          </div>
          <div class="conference-subject-footer">
            <span class="conference-subject-progress">Showing ${visiblePapers.length} of ${section.papers.length} papers</span>
            <div class="conference-subject-actions">
              ${
                canCollapse
                  ? `<button class="link-chip button-link" type="button" data-conference-subject-action="less" data-conference-section-key="${escapeAttribute(
                      sectionKey
                    )}">Show less</button>`
                  : ""
              }
              ${
                hasMore
                  ? `<button
                      class="link-chip button-link"
                      type="button"
                      data-conference-subject-action="more"
                      data-conference-section-key="${escapeAttribute(sectionKey)}"
                      data-conference-auto-load="${escapeAttribute(sectionKey)}"
                      data-conference-total-papers="${section.papers.length}"
                    >Show more</button>`
                  : ""
              }
            </div>
          </div>
        </section>
      `;
    })
    .join("");
  refreshSubjectAutoLoadObserver();
}

function renderPaperCard(paper, className) {
  const authors = paper.authors?.length ? escapeHtml(paper.authors.join(", ")) : "Unknown";
  const listAuthors = paper.authors?.length ? escapeHtml(paper.authors.join(", ")) : "";
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
  const inlineAuthors = `
    <div class="paper-authors-box">
      <span class="paper-detail-label">Authors</span>
      <p class="paper-authors-line">${authors}</p>
    </div>
  `;
  const listDetails = renderBranchListDetails(
    [
      subjects ? renderBranchDetailGroup({ label: "Subjects", body: subjects }) : "",
      listAuthors ? renderBranchDetailSection({ label: "Authors", body: listAuthors }) : "",
      paper.abstract ? renderBranchDetailSection({ label: "Abstract", body: escapeHtml(paper.abstract), muted: true, collapsible: true }) : "",
    ].join(""),
    {
      detailKey: rememberLikeRecord(paper),
    }
  );
  return `
    <article class="${className}">
      <div class="conference-paper-top">
        <span class="paper-badge">${escapeHtml(paper.topic_label || "Other AI")}</span>
      </div>
      <h4>${escapeHtml(paper.title)}</h4>
      <div class="branch-card-inline-details">
        ${subjects}
        ${inlineAuthors}
        ${abstract}
      </div>
      ${listDetails}
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
    reviewKey: buildBranchReviewKey("conference", state.currentPath),
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

function readVisibleSubjectCount(sectionKey, totalPapers) {
  const minimum = Math.min(CONFERENCE_SECTION_INITIAL_SIZE, totalPapers);
  const current = subjectVisibleCounts.get(sectionKey);
  if (typeof current === "number" && current > 0) {
    return Math.min(current, totalPapers);
  }
  subjectVisibleCounts.set(sectionKey, minimum);
  return minimum;
}

function expandSubjectSection(sectionKey, totalPapers) {
  const current = readVisibleSubjectCount(sectionKey, totalPapers);
  const next = Math.min(current + CONFERENCE_SECTION_LOAD_MORE_SIZE, totalPapers);
  if (next <= current) {
    return false;
  }
  subjectVisibleCounts.set(sectionKey, next);
  return true;
}

function getCurrentVisibleSections() {
  if (!state.report) {
    return [];
  }
  return groupBySubject(getVisiblePapers(state.report));
}

function findVisibleSection(sectionKey) {
  return getCurrentVisibleSections().find((entry) => sectionIdFromSubject(entry.subject_label) === sectionKey) || null;
}

function rerenderSubjectSections() {
  if (!state.report) {
    return;
  }
  renderSubjectSections(state.report, getCurrentVisibleSections());
  bindLikeButtons(document, likeRecords);
  bindQueueButtons(document, likeRecords);
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
  floatingToc.render([]);
}

function renderFatal(error) {
  const message = getErrorMessage(error);
  document.querySelector("#conference-board-summary").textContent = "Conference page failed to load.";
  document.querySelector("#conference-cards").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  document.querySelector("#conference-cards-pagination").innerHTML = "";
  floatingToc.render([]);
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

function sectionIdFromSubject(subject) {
  return `subject-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
