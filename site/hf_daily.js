import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js";

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
const likeRecords = new Map();

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  bindThemeToggle();
  bindSidebarToggle();
  bindBackToTop();
  bindFilters();
  subscribeLikes(() => bindLikeButtons(document, likeRecords));
  await initLikesSync();
  const manifest = await fetchJson(manifestUrl);
  state.manifest = manifest;
  populateReportSelect(manifest.reports || []);
  renderHomeCards(manifest);

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
  sidebarToggleButton.setAttribute("aria-label", collapsed ? "展开侧边工具栏" : "收起侧边工具栏");
  sidebarToggleButton.title = collapsed ? "展开侧边工具栏" : "收起侧边工具栏";
  sidebarToggleLabel.textContent = collapsed ? "展开" : "收起";
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

function bindFilters() {
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
  reportSelect.value = path;
  authorFilter.value = "";
  searchInput.value = "";
  topicFilter.value = "";
  focusOnlyInput.checked = false;
  populateTopicFilter(report.topics || []);
  renderHomeCards(state.manifest, path);
  renderReportRail(state.manifest.reports || [], path);
  renderReport();
}

function populateReportSelect(reports) {
  reportSelect.innerHTML = reports
    .map(
      (report) => `
        <option value="${escapeAttribute(report.data_path)}">
          ${escapeHtml(report.report_date)} · ${report.total_papers} papers
        </option>
      `
    )
    .join("");
}

function populateTopicFilter(topics) {
  topicFilter.innerHTML = `<option value="">全部 Topic</option>${topics
    .map(
      (topic) =>
        `<option value="${escapeAttribute(topic.topic_label)}">${escapeHtml(topic.topic_label)} · ${topic.count}</option>`
    )
    .join("")}`;
}

function renderHomeCards(manifest, activePath = "") {
  const root = document.querySelector("#hf-home-cards");
  const summary = document.querySelector("#hf-board-summary");
  const reports = manifest?.reports || [];

  if (!reports.length) {
    summary.textContent = "还没有可用的 Hugging Face 每日快照。";
    root.innerHTML = `<div class="empty-state">先生成 HF 日报，再刷新页面。</div>`;
    return;
  }

  const totalPapers = reports.reduce((sum, report) => sum + (report.total_papers || 0), 0);
  summary.textContent = `当前共收录 ${reports.length} 天，共 ${totalPapers} 篇 Hugging Face daily papers。点击卡片切换日期。`;
  root.innerHTML = reports
    .map((report) => {
      const topTopic = report.top_topics?.[0];
      const topSubmitter = report.top_submitters?.[0];
      return `
        <button
          class="home-category-card ${report.data_path === activePath ? "active" : ""}"
          type="button"
          data-hf-report="${escapeAttribute(report.data_path)}"
        >
          <div class="home-category-card-top">
            <span class="home-category-label">HF Daily</span>
            <span class="home-category-date">${escapeHtml(report.report_date)}</span>
          </div>
          <strong class="home-category-count">${report.total_papers} papers</strong>
          <p class="home-category-topic">${escapeHtml(topTopic?.topic_label || "No topic summary")}</p>
          <div class="home-category-meta">
            <span>${escapeHtml(topSubmitter?.submitted_by || "No submitter")}</span>
            <span>${escapeHtml(report.classifier)}</span>
          </div>
        </button>
      `;
    })
    .join("");

  root.querySelectorAll("[data-hf-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.hfReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });
}

function renderReportRail(reports, activePath = "") {
  const root = document.querySelector("#hf-report-rail");
  root.innerHTML = reports
    .map(
      (report) => `
        <button
          class="report-card ${report.data_path === activePath ? "active" : ""}"
          type="button"
          data-hf-rail-report="${escapeAttribute(report.data_path)}"
        >
          <span class="report-card-date">${escapeHtml(report.report_date)}</span>
          <strong class="report-card-count">${report.total_papers} papers</strong>
          <span class="report-card-meta">${escapeHtml(report.top_topics?.[0]?.topic_label || "No topic")} · ${escapeHtml(
            report.top_submitters?.[0]?.submitted_by || "No submitter"
          )}</span>
        </button>
      `
    )
    .join("");

  root.querySelectorAll("[data-hf-rail-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.hfRailReport;
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
  likeRecords.clear();
  const visiblePapers = getVisiblePapers(report);
  const topics = groupByTopic(visiblePapers);
  renderHero(report, visiblePapers);
  renderOverview(report, visiblePapers, topics);
  renderTagMap(report);
  renderDistribution(report, visiblePapers);
  renderSpotlight(report, visiblePapers);
  renderResults(report, visiblePapers, topics);
  renderTopicSections(topics);
  bindLikeButtons(document, likeRecords);
}

function renderTagMap(report) {
  const topTopic = report.topic_distribution?.[0]?.topic_label || "其他 AI";
  document.querySelector("#hf-tag-map").innerHTML = [
    {
      label: "Date",
      value: report.report_date || "-",
      meta: "当前 HF Daily 日期",
    },
    {
      label: "Topic",
      value: state.topic || topTopic,
      meta: state.topic ? "当前筛选中的 topic" : "当前主导 topic",
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
  document.querySelector("#hf-overview-title").textContent = `${report.report_date} HF Daily 概览`;
  document.querySelector("#hf-source-link").href = report.source_url;
  document.querySelector("#hf-overview-summary").textContent = topTopic
    ? `${topTopic.topic_label} 是当天占比最高的 topic，共 ${topTopic.count} 篇，占比 ${topTopic.share.toFixed(2)}%。`
    : "当前报告还没有 topic 分布。";
  document.querySelector("#hf-submitter-summary").textContent = topSubmitter
    ? `${topSubmitter.submitted_by} 是当天最活跃的提交者，共提交 ${topSubmitter.count} 篇。`
    : "当前页面没有稳定提交者统计。";
  document.querySelector("#hf-focus-summary").textContent = `${focusCount} 篇命中重点方向，占当前视图 ${focusShare.toFixed(
    2
  )}%。`;
  document.querySelector("#hf-breadth-summary").textContent = `当前可见 ${visiblePapers.length} 篇论文，覆盖 ${topics.length} 个 topic。`;
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

function renderSpotlight(report, visiblePapers) {
  const root = document.querySelector("#hf-spotlight");
  const prioritized = visiblePapers
    .slice()
    .sort((a, b) => (b.upvotes || -1) - (a.upvotes || -1) || a.title.localeCompare(b.title))
    .slice(0, 6);

  if (!prioritized.length) {
    root.innerHTML = `<div class="empty-state">当前筛选条件下没有可展示的论文。</div>`;
    return;
  }

  root.innerHTML = prioritized.map((paper) => renderPaperCard(paper)).join("");
}

function renderResults(report, visiblePapers, topics) {
  const activeFilters = getActiveFilters();
  document.querySelector("#hf-results-title").textContent = activeFilters.length
    ? `当前筛选后可见 ${visiblePapers.length} 篇论文`
    : `当前共浏览 ${report.total_papers} 篇论文`;
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
    root.innerHTML = `<div class="glass-card empty-state">当前筛选条件下没有命中的论文。</div>`;
    return;
  }

  root.innerHTML = topics
    .map(
      (section, index) => `
        <section class="glass-card conference-subject-card">
          <div class="conference-subject-header">
            <div>
              <p class="eyebrow">TOPIC</p>
              <h3>${index + 1}. ${escapeHtml(section.topic_label)}</h3>
            </div>
            <div class="conference-subject-meta">
              <span>${section.papers.length} papers</span>
              <span>${escapeHtml(section.papers[0]?.submitted_by || "No submitter")}</span>
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
    `<span class="paper-badge">${escapeHtml(paper.topic_label || "其他 AI")}</span>`,
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
    paper.hf_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(paper.hf_url)}" target="_blank" rel="noreferrer">HF</a>` : "",
    paper.arxiv_pdf_url || paper.arxiv_url
      ? `<a class="paper-link brand-arxiv" href="${escapeAttribute(paper.arxiv_pdf_url || paper.arxiv_url)}" target="_blank" rel="noreferrer">arXiv</a>`
      : "",
    paper.github_url ? `<a class="paper-link" href="${escapeAttribute(paper.github_url)}" target="_blank" rel="noreferrer">GitHub</a>` : "",
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
  const likeId = rememberLikeRecord(paper);
  const liked = isLiked(likeId);
  return `
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
    sourceKind: "hf_daily",
    sourceLabel: "HF Daily",
    sourcePage: "./hf-daily-paper.html",
    snapshotLabel: report ? report.report_date : "HF Daily",
    reportDate: report?.report_date || "",
  });
  likeRecords.set(record.like_id, record);
  return record.like_id;
}

function getVisiblePapers(report) {
  return report.papers.filter((paper) => {
    if (state.topic && (paper.topic_label || "其他 AI") !== state.topic) {
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
    const topic = paper.topic_label || "其他 AI";
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
    const topic = paper.topic_label || "其他 AI";
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
  document.querySelector("#hf-board-summary").textContent = "还没有可用的 Hugging Face 日报。";
  document.querySelector("#hf-home-cards").innerHTML =
    `<div class="empty-state">先运行 HF Daily 报告生成脚本，再刷新页面。</div>`;
  document.querySelector("#hf-spotlight").innerHTML = "";
  document.querySelector("#hf-topic-sections").innerHTML = "";
  const tagMap = document.querySelector("#hf-tag-map");
  if (tagMap) {
    tagMap.innerHTML = "";
  }
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
  document.querySelector("#hf-board-summary").textContent = "HF Daily 页面加载失败。";
  document.querySelector("#hf-home-cards").innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
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
