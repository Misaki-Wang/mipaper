import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js?v=3b466b6556";
import { bindQueueButtons, initQueue, subscribeQueue } from "./paper_queue.js?v=8b696292c3";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { createCalendarPicker } from "./calendar_picker.js?v=4b01d6ac6c";
import { mountAppToolbar } from "./app_toolbar.js?v=90ae25c72d";
import { buildBranchReviewKey, createBranchReviewController, initBranchReportPage } from "./branch_page.js?v=f27a328acc";
import { bindBranchListDetails, renderBranchDetailSection, renderBranchListDetails } from "./branch_details.js?v=22d7e0f349";
import { createLatestTaskRunner } from "./request_gate.js?v=f527e8e81d";
import { createFloatingTocController } from "./floating_toc.js?v=a9ffd5aa93";
import { validateHfManifest, validateHfReport } from "./site_contract.js?v=12344e596d";
import { escapeAttribute, escapeHtml, fetchJson, formatZhTime, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";

mountAppToolbar("#hf-toolbar-root", {
  prefix: "hf",
  filtersTemplateId: "hf-toolbar-filters",
  branchActiveKey: "hf",
  libraryActiveKey: null,
});

const manifestUrl = "./data/hf-daily/manifest.json";

const state = {
  manifest: null,
  report: null,
  currentPath: "",
  query: "",
  author: "",
  topic: "",
  focusOnly: false,
  cadenceView: localStorage.getItem("hf-cadence-view") === "weekly" ? "weekly" : "daily",
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);
const HF_CADENCE_MAX_DATES = 5;
const HF_CADENCE_MAX_WEEKS = 5;
const reportSelect = document.querySelector("#hf-report-select");
const topicFilter = document.querySelector("#hf-topic-filter");
const authorFilter = document.querySelector("#hf-author-filter");
const searchInput = document.querySelector("#hf-search-input");
const focusOnlyInput = document.querySelector("#hf-focus-only");
const cadenceViewButtons = [...document.querySelectorAll("[data-hf-cadence-view]")];
const resetFiltersButton = document.querySelector("#hf-reset-filters");
const sidebarToggleButton = document.querySelector("#hf-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#hf-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#hf-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#hf-filters-menu");
const backToTopButton = document.querySelector("#hf-back-to-top");
const floatingTocRoot = document.querySelector("#hf-floating-toc");
const reviewToggleButton = document.querySelector("#hf-review-toggle");
const reviewToggleMeta = document.querySelector("#hf-review-toggle-meta");
const heroReviewStatus = document.querySelector("#hf-hero-review-status");
const likeRecords = new Map();
let datePicker = null;
const runLatestReportLoad = createLatestTaskRunner();
const floatingToc = createFloatingTocController(floatingTocRoot);
const reviewController = createBranchReviewController({
  reviewScope: "hf_daily",
  branchLabel: "HF Daily",
  reviewToggleButton,
  reviewToggleMeta,
  heroReviewStatus,
  getCurrentReport: () => state.report,
  getCurrentPath: () => state.currentPath,
  getSnapshotLabel: (report) => report.report_date,
});
const { bindReviewToggle, renderReviewState } = reviewController;

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  await initBranchReportPage({
    pageKey: "hf",
    toolbarPrefix: "hf",
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
      bindCadenceViewToggle();
    },
    renderReviewState,
    onManifestLoaded: (manifest) => {
      state.manifest = manifest;
      bindDatePicker();
      populateReportSelect(manifest.reports || []);
    },
    onEmptyManifest: () => {
      renderEmpty();
    },
    getInitialReportPath: (manifest) => manifest.default_report_path || manifest.reports[0]?.data_path || "",
    manifestValidator: validateHfManifest,
    loadReport,
  });
}
function bindDatePicker() {
  const shell = reportSelect.closest(".date-input-shell");
  const button = shell?.querySelector("[data-date-picker-button]");
  if (!shell || !button) {
    return;
  }
  datePicker = createCalendarPicker({
    shell,
    input: reportSelect,
    button,
    getAvailableDates: () =>
      [...new Set((state.manifest?.reports || []).map((report) => report.report_date).filter(Boolean))].sort((left, right) =>
        left.localeCompare(right)
      ),
    getValue: () => state.report?.report_date || "",
    onSelect: async (iso) => {
      const matchedReport = (state.manifest?.reports || []).find((report) => report.report_date === iso);
      if (matchedReport) {
        await loadReport(matchedReport.data_path);
      }
    },
  });
}

function bindFilters() {
  topicFilter.addEventListener("change", (event) => {
    state.topic = event.target.value;
    renderReport();
  });

  authorFilter.addEventListener("input", (event) => {
    state.author = event.target.value.trim().toLowerCase();
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
    state.query = "";
    state.author = "";
    state.topic = "";
    state.focusOnly = false;
    authorFilter.value = "";
    searchInput.value = "";
    topicFilter.value = "";
    focusOnlyInput.checked = false;
    renderReport();
  });
}

function bindCadenceViewToggle() {
  cadenceViewButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.hfCadenceView === "weekly" ? "weekly" : "daily";
      if (nextView === state.cadenceView) {
        return;
      }
      state.cadenceView = nextView;
      localStorage.setItem("hf-cadence-view", nextView);
      syncCadenceViewButtons();
      if (state.report) {
        renderCadence(state.report);
      }
    });
  });
  syncCadenceViewButtons();
}

function syncCadenceViewButtons() {
  cadenceViewButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.hfCadenceView === state.cadenceView);
  });
}

async function loadReport(path) {
  const result = await runLatestReportLoad(() => fetchJson(path, { validator: validateHfReport }));
  if (result.stale) {
    return;
  }
  const report = result.value;
  state.report = report;
  state.currentPath = path;
  state.query = "";
  state.author = "";
  state.topic = "";
  state.focusOnly = false;
  reportSelect.value = report.report_date || "";
  authorFilter.value = "";
  searchInput.value = "";
  topicFilter.value = "";
  focusOnlyInput.checked = false;
  populateTopicFilter(report.topics || []);
  datePicker?.sync();
  renderReviewState();
  renderReport();
}

function populateReportSelect(reports) {
  const dates = reports.map((report) => report.report_date).filter(Boolean).sort((left, right) => left.localeCompare(right));
  reportSelect.disabled = !dates.length;
  reportSelect.value = state.report?.report_date || reports[0]?.report_date || "";
  datePicker?.refresh();
}

function populateTopicFilter(topics) {
  topicFilter.innerHTML = `<option value="">All Topics</option>${topics
    .map(
      (topic) =>
        `<option value="${escapeAttribute(topic.topic_label)}">${escapeHtml(topic.topic_label)} · ${topic.count}</option>`
    )
    .join("")}`;
}

function renderReport() {
  if (!state.report) {
    renderEmpty();
    return;
  }

  const report = state.report;
  likeRecords.clear();
  const visiblePapers = getVisiblePapers(report);
  const topics = groupByTopic(visiblePapers);
  renderHero(report, visiblePapers);
  renderOverview(report, visiblePapers, topics);
  renderTagMap(report);
  renderCadence(report);
  renderDistribution(report, visiblePapers);
  renderSpotlight(report, visiblePapers);
  renderResults(report, visiblePapers, topics);
  renderTopicSections(topics);
  floatingToc.render([
    { id: "hf-overview-section", label: "Overview" },
    { id: "hf-tags-section", label: "Current Tags" },
    { id: "hf-cadence-section", label: "Recent Cadence" },
    { id: "hf-spotlight-section", label: "Spotlight" },
    { id: "hf-results-section", label: "Results" },
    ...topics.slice(0, 10).map((topic) => ({
      id: sectionIdFromTopic(topic.topic_label),
      label: topic.topic_label,
      child: true,
    })),
  ]);
  bindLikeButtons(document, likeRecords);
  bindQueueButtons(document, likeRecords);
  bindBranchListDetails(document);
}

function renderTagMap(report) {
  const topTopic = report.topic_distribution?.[0]?.topic_label || "Other AI";
  document.querySelector("#hf-tag-map").innerHTML = [
    {
      label: "Date",
      value: report.report_date || "-",
      meta: "current HF Daily date",
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
  const topSubmitter = report.top_submitters?.[0];
  const focusCount = visiblePapers.filter((paper) => focusTopicKeys.has(paper.topic_key)).length;
  const focusShare = visiblePapers.length ? (focusCount / visiblePapers.length) * 100 : 0;
  document.querySelector("#hf-hero-date").textContent = report.report_date;
  document.querySelector("#hf-hero-total").textContent = String(report.total_papers);
  document.querySelector("#hf-hero-submitter").textContent = topSubmitter?.submitted_by || "-";
  document.querySelector("#hf-hero-classifier").textContent = report.classifier;
  document.querySelector("#hf-hero-updated").textContent = formatZhTime(report.generated_at);
  document.querySelector("#hf-hero-signals").innerHTML = [
    `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(topTopic?.topic_label || "-")}</strong></div>`,
    `<div class="signal-chip"><span>Top Submitter</span><strong>${escapeHtml(topSubmitter?.submitted_by || "-")}</strong></div>`,
    `<div class="signal-chip"><span>Focus Coverage</span><strong>${focusCount} papers / ${focusShare.toFixed(
      2
    )}%</strong></div>`,
  ].join("");
}

function renderOverview(report, visiblePapers, topics) {
  const topTopic = report.topic_distribution?.[0];
  const topSubmitter = report.top_submitters?.[0];
  const focusCount = visiblePapers.filter((paper) => focusTopicKeys.has(paper.topic_key)).length;
  const focusShare = visiblePapers.length ? (focusCount / visiblePapers.length) * 100 : 0;
  document.querySelector("#hf-overview-title").textContent = `${report.report_date} HF Daily Overview`;
  document.querySelector("#hf-source-link").href = report.source_url;
  document.querySelector("#hf-source-link").textContent = "Source";
  document.querySelector("#hf-overview-summary").textContent = topTopic
    ? `${topTopic.topic_label} is the top topic for the day, with ${topTopic.count} papers and ${topTopic.share.toFixed(2)}% share.`
    : "This report does not have a topic distribution yet.";
  document.querySelector("#hf-submitter-summary").textContent = topSubmitter
    ? `${topSubmitter.submitted_by} is the most active submitter today, with ${topSubmitter.count} papers。`
    : "The page does not expose stable submitter statistics.";
  document.querySelector("#hf-focus-summary").textContent = `${focusCount} papers hit your focus topics, accounting for ${focusShare.toFixed(
    2
  )}% of the current view.`;
  document.querySelector("#hf-breadth-summary").textContent = `Currently visible: ${visiblePapers.length} papers across ${topics.length} topics.`;
}

function renderDistribution(report, visiblePapers) {
  const root = document.querySelector("#hf-distribution-list");
  const distribution = computeTopicDistribution(visiblePapers.length ? visiblePapers : report.papers);
  root.innerHTML = distribution
    .map(
      (item) => `
        <div class="distribution-item">
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

function renderCadence(report) {
  const cadenceRows =
    state.cadenceView === "weekly"
      ? buildWeeklyCadence(state.manifest?.reports || [])
      : buildCadenceMatrix(state.manifest?.reports || []);
  const maxCount = Math.max(...cadenceRows.map((row) => row.total_papers || 0), 1);
  document.querySelector("#hf-cadence-track").innerHTML = `
    <div class="hf-cadence-list">
      ${cadenceRows
        .map((row) => {
          if (!row.data_path) {
            return "";
          }
          const width = Math.max((row.total_papers / maxCount) * 100, 12);
          const active = row.is_active;
          const badgeHtml = [
            active ? `<span class="hf-cadence-badge is-active">Current</span>` : "",
            state.cadenceView === "weekly" ? `<span class="hf-cadence-badge">${row.active_days} days</span>` : "",
          ]
            .filter(Boolean)
            .join("");
          return `
            <button class="hf-cadence-item${active ? " is-active" : ""}" type="button" data-hf-cadence-report="${escapeAttribute(
              row.data_path
            )}">
              <div class="hf-cadence-item-top">
                <div class="hf-cadence-date-block">
                  <span class="hf-cadence-date">${escapeHtml(row.primary_label)}</span>
                  <span class="hf-cadence-year">${escapeHtml(row.secondary_label)}</span>
                </div>
                <div class="hf-cadence-meta">
                  ${badgeHtml}
                </div>
              </div>
              <div class="hf-cadence-bar-shell">
                <span class="hf-cadence-bar" style="width:${width}%"></span>
              </div>
              <div class="hf-cadence-item-bottom">
                <strong class="hf-cadence-value">${row.total_papers}</strong>
                <span class="hf-cadence-caption">${escapeHtml(row.value_label)}</span>
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;

  document.querySelectorAll("[data-hf-cadence-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.hfCadenceReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });

  document.querySelector("#hf-cadence-summary").textContent =
    state.cadenceView === "weekly" ? buildWeeklyCadenceSummary(cadenceRows) : buildCadenceSummary(cadenceRows);
}

function renderSpotlight(report, visiblePapers) {
  const root = document.querySelector("#hf-spotlight");
  const prioritized = visiblePapers
    .slice()
    .sort((a, b) => (b.upvotes || -1) - (a.upvotes || -1) || a.title.localeCompare(b.title))
    .slice(0, 6);

  if (!prioritized.length) {
    root.innerHTML = `<div class="empty-state">No papers match the current filters.</div>`;
    return;
  }

  root.innerHTML = prioritized.map((paper) => renderPaperCard(paper)).join("");
}

function renderResults(report, visiblePapers, topics) {
  const activeFilters = getActiveFilters();
  document.querySelector("#hf-results-title").textContent = activeFilters.length
    ? `${visiblePapers.length} papers visible after filtering`
    : `${report.total_papers} papers in view`;
  document.querySelector("#hf-results-stats").innerHTML = [
    renderResultStat("Visible Papers", visiblePapers.length, activeFilters.length ? `of ${report.total_papers}` : "full HF daily set"),
    renderResultStat(
      "Visible Topics",
      topics.length,
      activeFilters.length ? `of ${report.topic_distribution.length}` : "all topic buckets"
    ),
    renderResultStat("Scope", state.focusOnly ? "Focus" : "Full scan", state.topic || "cross-topic browsing"),
  ].join("");
  document.querySelector("#hf-active-filters").innerHTML = activeFilters.length
    ? activeFilters.map((item) => `<span class="active-filter-pill">${escapeHtml(item)}</span>`).join("")
    : `<span class="active-filter-pill">No filters applied. You are looking at the full HF daily set.</span>`;
  resetFiltersButton.disabled = !activeFilters.length;
}

function renderTopicSections(topics) {
  const root = document.querySelector("#hf-topic-sections");
  if (!topics.length) {
    root.innerHTML = `<div class="glass-card empty-state">No papers match the current filters.</div>`;
    return;
  }

  root.innerHTML = topics
    .map(
      (section, index) => `
        <section id="${escapeAttribute(sectionIdFromTopic(section.topic_label))}" class="glass-card conference-subject-card">
          <div class="conference-subject-header">
            <div>
              <p class="eyebrow">TOPIC</p>
              <h3>${index + 1}. ${escapeHtml(section.topic_label)}</h3>
            </div>
            <div class="conference-subject-meta">
              <span>${section.papers.length} papers</span>
            </div>
          </div>
          <div class="conference-paper-grid">
            ${section.papers.map((paper) => renderPaperCard(paper)).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderPaperCard(paper) {
  const authors = paper.authors?.length ? escapeHtml(paper.authors.join(", ")) : "Unknown";
  const listAuthors = paper.authors?.length ? escapeHtml(paper.authors.join(", ")) : "";
  const metaBadges = [
    `<span class="paper-badge">${escapeHtml(paper.topic_label || "Other AI")}</span>`,
    paper.submitted_by ? `<span class="paper-badge subdued">by ${escapeHtml(paper.submitted_by)}</span>` : "",
    paper.upvotes !== null && paper.upvotes !== undefined ? `<span class="paper-badge subdued">▲ ${paper.upvotes}</span>` : "",
  ]
    .filter(Boolean)
    .join("");
  const inlineAuthors = `
    <div class="paper-authors-box">
      <span class="paper-detail-label">Authors</span>
      <p class="paper-authors-line">${authors}</p>
    </div>
  `;
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
  const links = [
    paper.arxiv_pdf_url || paper.arxiv_url
      ? renderPaperLink({
          href: paper.arxiv_pdf_url || paper.arxiv_url,
          label: "arXiv",
          brand: "arxiv",
        })
      : "",
    getPapersCoolUrl(paper)
      ? renderPaperLink({
          href: getPapersCoolUrl(paper),
          label: "Cool",
          brand: "cool",
        })
      : "",
    renderLikeButton(paper),
  ]
    .filter(Boolean)
    .join("");
  const listDetails = renderBranchListDetails(
    [
      listAuthors ? renderBranchDetailSection({ label: "Authors", body: listAuthors }) : "",
      paper.abstract ? renderBranchDetailSection({ label: "Abstract", body: escapeHtml(paper.abstract), muted: true, collapsible: true }) : "",
    ].join(""),
    {
      detailKey: rememberLikeRecord(paper),
    }
  );

  return `
    <article class="conference-paper-card">
      <div class="conference-paper-top">${metaBadges}</div>
      <h4>${escapeHtml(paper.title)}</h4>
      <div class="branch-card-inline-details">
        ${inlineAuthors}
        ${abstract}
      </div>
      ${listDetails}
      <div class="paper-links">${links}</div>
    </article>
  `;
}

function renderPaperLink({ href, label, brand }) {
  const iconSrc =
    brand === "arxiv"
      ? "./assets/arxiv-logo.svg"
      : brand === "hf"
      ? "./assets/hf-logo.svg"
      : brand === "github"
      ? "./assets/github-mark.svg"
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

function getPapersCoolUrl(paper) {
  if (paper.papers_cool_url) {
    return paper.papers_cool_url;
  }
  if (paper.paper_id && (paper.arxiv_url || paper.arxiv_pdf_url)) {
    return `https://papers.cool/arxiv/${paper.paper_id}`;
  }
  return "";
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

function buildCadenceMatrix(reports) {
  const latestDates = [...new Set(reports.map((item) => item.report_date).filter(Boolean))]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, HF_CADENCE_MAX_DATES);

  return latestDates.map((report_date) => {
    const entry = reports.find((item) => item.report_date === report_date) || null;
    return {
      report_date,
      data_path: entry?.data_path || "",
      total_papers: entry?.total_papers || 0,
      is_active: entry?.data_path === state.currentPath,
      primary_label: report_date.slice(5),
      secondary_label: report_date.slice(0, 4),
      value_label: "papers",
    };
  });
}

function buildCadenceSummary(rows) {
  const reports = rows.filter((row) => row.data_path);
  if (!reports.length) {
    return "No HF Daily reports are available yet.";
  }
  if (reports.length === 1) {
    return "Only one HF Daily report is available so far.";
  }
  const [latest, previous] = reports;
  const delta = latest.total_papers - previous.total_papers;
  const direction = delta === 0 ? "unchanged" : delta > 0 ? `increased by ${delta}` : `decreased by ${Math.abs(delta)}`;
  return `${latest.report_date} has ${latest.total_papers} papers, ${direction}.`;
}

function buildWeeklyCadence(reports) {
  const weeklyBuckets = new Map();
  reports.forEach((report) => {
    if (!report?.report_date) {
      return;
    }
    const bucket = getWeekBucket(report.report_date);
    if (!weeklyBuckets.has(bucket.week_key)) {
      weeklyBuckets.set(bucket.week_key, {
        week_key: bucket.week_key,
        week_start: bucket.week_start,
        week_end: bucket.week_end,
        reports: [],
      });
    }
    weeklyBuckets.get(bucket.week_key).reports.push(report);
  });

  return [...weeklyBuckets.values()]
    .sort((left, right) => right.week_start.localeCompare(left.week_start))
    .slice(0, HF_CADENCE_MAX_WEEKS)
    .map((bucket) => {
      const weekReports = bucket.reports.sort((left, right) => right.report_date.localeCompare(left.report_date));
      const latestReport = weekReports[0];
      const totalPapers = weekReports.reduce((sum, item) => sum + (item.total_papers || 0), 0);
      return {
        report_date: latestReport?.report_date || bucket.week_end,
        data_path: latestReport?.data_path || "",
        total_papers: totalPapers,
        active_days: weekReports.length,
        is_active: weekReports.some((item) => item.data_path === state.currentPath),
        primary_label: formatWeekLabel(bucket.week_start),
        secondary_label: `${formatShortDate(bucket.week_start)} to ${formatShortDate(bucket.week_end)}`,
        value_label: "papers total",
      };
    });
}

function buildWeeklyCadenceSummary(rows) {
  const reports = rows.filter((row) => row.data_path);
  if (!reports.length) {
    return "No HF Daily reports are available yet.";
  }
  if (reports.length === 1) {
    const [only] = reports;
    return `${only.primary_label} has ${only.total_papers} papers across ${only.active_days} active days.`;
  }
  const [latest, previous] = reports;
  const delta = latest.total_papers - previous.total_papers;
  const direction = delta === 0 ? "unchanged" : delta > 0 ? `increased by ${delta}` : `decreased by ${Math.abs(delta)}`;
  return `${latest.primary_label} totals ${latest.total_papers} papers across ${latest.active_days} active days, ${direction} versus the previous week.`;
}

function getWeekBucket(reportDate) {
  const date = new Date(`${reportDate}T00:00:00Z`);
  const dayOffset = (date.getUTCDay() + 6) % 7;
  const start = new Date(date);
  start.setUTCDate(date.getUTCDate() - dayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    week_key: start.toISOString().slice(0, 10),
    week_start: start.toISOString().slice(0, 10),
    week_end: end.toISOString().slice(0, 10),
  };
}

function formatShortDate(reportDate) {
  return reportDate.slice(5);
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

function rememberLikeRecord(paper) {
  const report = state.report;
  const record = createLikeRecord(paper, {
    sourceKind: "hf_daily",
    sourceLabel: "HF Daily",
    sourcePage: "./hf-daily.html",
    snapshotLabel: report ? report.report_date : "HF Daily",
    reportDate: report?.report_date || "",
    reviewKey: buildBranchReviewKey("hf_daily", state.currentPath),
  });
  likeRecords.set(record.like_id, record);
  return record.like_id;
}

function getVisiblePapers(report) {
  return report.papers.filter((paper) => {
    if (state.topic && (paper.topic_label || "Other AI") !== state.topic) {
      return false;
    }
    if (state.author && !(paper.authors || []).join(" ").toLowerCase().includes(state.author)) {
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

function groupByTopic(papers) {
  const map = new Map();
  papers.forEach((paper) => {
    const topic = paper.topic_label || "Other AI";
    if (!map.has(topic)) {
      map.set(topic, []);
    }
    map.get(topic).push(paper);
  });
  return [...map.entries()]
    .map(([topic_label, topicPapers]) => ({
      topic_label,
      papers: topicPapers.sort((a, b) => (b.upvotes || -1) - (a.upvotes || -1) || a.title.localeCompare(b.title)),
    }))
    .sort((a, b) => b.papers.length - a.papers.length || a.topic_label.localeCompare(b.topic_label));
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
  if (state.topic) {
    filters.push(`Topic: ${state.topic}`);
  }
  if (state.author) {
    filters.push(`Author: ${state.author}`);
  }
  if (state.query) {
    filters.push(`Search: ${state.query}`);
  }
  if (state.focusOnly) {
    filters.push("Focus only");
  }
  return filters;
}

function hasActiveFilters() {
  return Boolean(state.topic || state.author || state.query || state.focusOnly);
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
  document.querySelector("#hf-spotlight").innerHTML = "";
  document.querySelector("#hf-topic-sections").innerHTML = "";
  const tagMap = document.querySelector("#hf-tag-map");
  if (tagMap) {
    tagMap.innerHTML = "";
  }
  floatingToc.render([]);
}

function renderFatal(error) {
  const message = getErrorMessage(error);
  const resultsTitle = document.querySelector("#hf-results-title");
  if (resultsTitle) {
    resultsTitle.textContent = "HF Daily page failed to load";
  }
  const topicSections = document.querySelector("#hf-topic-sections");
  if (topicSections) {
    topicSections.innerHTML = `<div class="glass-card empty-state">${escapeHtml(message)}</div>`;
  }
  floatingToc.render([]);
}

function sectionIdFromTopic(topic) {
  return `hf-topic-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
