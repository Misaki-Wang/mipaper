import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js";
import { bindQueueButtons, initQueue, subscribeQueue } from "./paper_queue.js";
import { createCalendarPicker } from "./calendar_picker.js";
import { createPageReviewKey, initReviewSync, isPageReviewed, setPageReviewed, subscribePageReviews } from "./reading_state.js";

const manifestUrl = "./data/hf-daily/manifest.json";

const state = {
  manifest: null,
  report: null,
  currentPath: "",
  query: "",
  author: "",
  topic: "",
  focusOnly: false,
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);
const HF_CADENCE_MAX_DATES = 5;
const reportSelect = document.querySelector("#hf-report-select");
const topicFilter = document.querySelector("#hf-topic-filter");
const authorFilter = document.querySelector("#hf-author-filter");
const searchInput = document.querySelector("#hf-search-input");
const focusOnlyInput = document.querySelector("#hf-focus-only");
const resetFiltersButton = document.querySelector("#hf-reset-filters");
const sidebarToggleButton = document.querySelector("#hf-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#hf-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#hf-sidebar-toggle-icon");
const layoutRoot = document.querySelector(".layout");
const backToTopButton = document.querySelector("#hf-back-to-top");
const floatingTocRoot = document.querySelector("#hf-floating-toc");
const reviewToggleButton = document.querySelector("#hf-review-toggle");
const reviewToggleMeta = document.querySelector("#hf-review-toggle-meta");
const heroReviewStatus = document.querySelector("#hf-hero-review-status");
const likeRecords = new Map();
let tocObserver = null;
let datePicker = null;

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  bindThemeToggle();
  bindSidebarToggle();
  bindBackToTop();
  bindFilters();
  bindReviewToggle();
  subscribeLikes(() => bindLikeButtons(document, likeRecords));
  subscribeQueue(() => bindQueueButtons(document, likeRecords));
  subscribePageReviews(() => renderReviewState());
  await Promise.all([initLikesSync(), initReviewSync(), initQueue()]);
  const manifest = await fetchJson(manifestUrl);
  state.manifest = manifest;
  bindDatePicker();
  populateReportSelect(manifest.reports || []);

  if (!manifest.reports?.length) {
    renderEmpty();
    return;
  }

  await loadReport(manifest.default_report_path || manifest.reports[0].data_path);
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
  sidebarToggleLabel.textContent = collapsed ? "Tools" : "Collapse";
  sidebarToggleIcon.textContent = collapsed ? "›" : "‹";
  localStorage.setItem("cool-paper-sidebar", collapsed ? "collapsed" : "expanded");
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
    const reviewKey = createPageReviewKey("hf_daily", state.currentPath);
    const next = !isPageReviewed(reviewKey);
    setPageReviewed(reviewKey, next, {
      branch: "HF Daily",
      snapshot_label: state.report.report_date,
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
  const reviewed = isPageReviewed(createPageReviewKey("hf_daily", state.currentPath));
  reviewToggleButton.classList.toggle("is-reviewed", reviewed);
  reviewToggleButton.setAttribute("aria-pressed", String(reviewed));
  reviewToggleMeta.textContent = reviewed
    ? `Reviewed ${state.report.report_date}`
    : `Mark ${state.report.report_date} as reviewed`;
  if (heroReviewStatus) {
    heroReviewStatus.textContent = reviewed ? "Reviewed" : "Not reviewed";
    heroReviewStatus.classList.toggle("is-reviewed", reviewed);
  }
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

async function loadReport(path) {
  const report = await fetchJson(path);
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
  renderFloatingToc([
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
  document.querySelector("#hf-hero-updated").textContent = formatTime(report.generated_at);
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
  const cadenceMatrix = buildCadenceMatrix(state.manifest?.reports || []);
  const maxCount = Math.max(...cadenceMatrix.rows.map((row) => row.entry?.total_papers || 0), 1);
  document.querySelector("#hf-cadence-track").innerHTML = `
    <div class="hf-cadence-list">
      ${cadenceMatrix.rows
        .map((row) => {
          const entry = row.entry;
          if (!entry) {
            return "";
          }
          const width = Math.max((entry.total_papers / maxCount) * 100, 12);
          const active = entry.data_path === state.currentPath;
          return `
            <button class="hf-cadence-item${active ? " is-active" : ""}" type="button" data-hf-cadence-report="${escapeAttribute(
              entry.data_path
            )}">
              <div class="hf-cadence-item-top">
                <div class="hf-cadence-date-block">
                  <span class="hf-cadence-date">${escapeHtml(row.report_date.slice(5))}</span>
                  <span class="hf-cadence-year">${escapeHtml(row.report_date.slice(0, 4))}</span>
                </div>
                <div class="hf-cadence-meta">
                  ${active ? `<span class="hf-cadence-badge is-active">Current</span>` : ""}
                </div>
              </div>
              <div class="hf-cadence-bar-shell">
                <span class="hf-cadence-bar" style="width:${width}%"></span>
              </div>
              <div class="hf-cadence-item-bottom">
                <strong class="hf-cadence-value">${entry.total_papers}</strong>
                <span class="hf-cadence-caption">papers</span>
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

  document.querySelector("#hf-cadence-summary").textContent = buildCadenceSummary(cadenceMatrix.rows);
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
    renderResultStat("View Mode", state.focusOnly ? "Focus" : "Full scan", state.topic || "cross-topic browsing"),
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
  const metaBadges = [
    `<span class="paper-badge">${escapeHtml(paper.topic_label || "Other AI")}</span>`,
    paper.submitted_by ? `<span class="paper-badge subdued">by ${escapeHtml(paper.submitted_by)}</span>` : "",
    paper.upvotes !== null && paper.upvotes !== undefined ? `<span class="paper-badge subdued">▲ ${paper.upvotes}</span>` : "",
  ]
    .filter(Boolean)
    .join("");
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
    paper.hf_url
      ? renderPaperLink({
          href: paper.hf_url,
          label: "HF",
          brand: "hf",
        })
      : "",
    paper.github_url
      ? renderPaperLink({
          href: paper.github_url,
          label: "GitHub",
          brand: "github",
        })
      : "",
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

  return {
    rows: latestDates.map((report_date) => ({
      report_date,
      entry: reports.find((item) => item.report_date === report_date) || null,
    })),
  };
}

function buildCadenceSummary(rows) {
  const reports = rows.map((row) => row.entry).filter(Boolean);
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

function rememberLikeRecord(paper) {
  const report = state.report;
  const record = createLikeRecord(paper, {
    sourceKind: "hf_daily",
    sourceLabel: "HF Daily",
    sourcePage: "./index.html",
    snapshotLabel: report ? report.report_date : "HF Daily",
    reportDate: report?.report_date || "",
    reviewKey: state.currentPath ? createPageReviewKey("hf_daily", state.currentPath) : "",
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
  const resultsTitle = document.querySelector("#hf-results-title");
  if (resultsTitle) {
    resultsTitle.textContent = "HF Daily page failed to load";
  }
  const topicSections = document.querySelector("#hf-topic-sections");
  if (topicSections) {
    topicSections.innerHTML = `<div class="glass-card empty-state">${escapeHtml(message)}</div>`;
  }
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

function sectionIdFromTopic(topic) {
  return `hf-topic-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
