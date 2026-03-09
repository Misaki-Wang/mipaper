import { bindLikeButtons, createLikeRecord, initLikesSync, isLiked, subscribeLikes } from "./likes.js";

const manifestUrl = "./data/daily/manifest.json";

const state = {
  manifest: null,
  report: null,
  currentPath: "",
  domain: "",
  date: "",
  query: "",
  topic: "",
  focusOnly: false,
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);

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
const layoutRoot = document.querySelector(".layout");
const backToTopButton = document.querySelector("#back-to-top");
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
  domainFilter.addEventListener("change", async (event) => {
    state.domain = event.target.value;
    await handleReportScopeChange();
  });

  dateFilter.addEventListener("change", async (event) => {
    state.date = event.target.value;
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
  renderReportRail(getScopedReports(state.manifest?.reports || []), path);
  renderReport();
}

function populateScopeFilters(reports) {
  const domains = [...new Set(reports.map((report) => report.category).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right)
  );
  const dates = [...new Set(reports.map((report) => report.report_date).filter(Boolean))].sort((left, right) =>
    right.localeCompare(left)
  );

  domainFilter.innerHTML = `<option value="">全部 Domain</option>${domains
    .map((domain) => `<option value="${escapeAttribute(domain)}">${escapeHtml(domain)}</option>`)
    .join("")}`;
  dateFilter.innerHTML = `<option value="">全部 Date</option>${dates
    .map((date) => `<option value="${escapeAttribute(date)}">${escapeHtml(date)}</option>`)
    .join("")}`;
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
  renderReportRail(scopedReports, state.currentPath);

  if (!scopedReports.length) {
    state.report = null;
    state.currentPath = "";
    updateHero(state.manifest);
    renderEmpty("当前 tag 条件下没有日报快照。");
    return;
  }

  if (!scopedReports.some((report) => report.data_path === state.currentPath)) {
    await loadReport(scopedReports[0].data_path);
    return;
  }

  reportSelect.value = state.currentPath;
  updateHero(state.manifest, state.report);
  renderReport();
}

function populateTopicFilter(topics) {
  topicFilter.innerHTML = `<option value="">全部 Topic</option>${topics
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
}

function renderHomeCategories(manifest, activePath = "", scopedReports = null) {
  const root = document.querySelector("#home-categories");
  const summary = document.querySelector("#home-board-summary");
  const cards = getHomeCategoryCards(manifest, scopedReports);

  if (!cards.length) {
    summary.textContent = scopedReports ? "当前 tag 条件下没有可用分类快照。" : "还没有可用分类快照。";
    root.innerHTML = `<div class="empty-state">先生成 cs.AI / cs.CL / cs.CV 的日报，再刷新首页。</div>`;
    return;
  }

  const totalPapers = cards.reduce((sum, item) => sum + (item.total_papers || 0), 0);
  const uniqueDates = [...new Set(cards.map((item) => item.report_date))];
  summary.textContent =
    uniqueDates.length === 1
      ? `${uniqueDates[0]} 共覆盖 ${cards.length} 个分类，总计 ${totalPapers} 篇论文。点击卡片切换当前报告。`
      : `当前首页汇总 ${cards.length} 个分类的最近快照，共 ${totalPapers} 篇论文。点击卡片切换当前报告。`;

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
          <strong class="home-category-count">${report.total_papers} papers</strong>
          <p class="home-category-topic">
            ${
              topTopic
                ? `${escapeHtml(topTopic.topic_label)} · ${topTopic.share.toFixed(2)}%`
                : "No topic summary yet"
            }
          </p>
          <div class="home-category-meta">
            <span>${escapeHtml(report.classifier)}</span>
            <span>${topTopic ? `Top topic · ${topTopic.count} papers` : "pending"}</span>
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

function renderReportRail(reports, activePath) {
  const root = document.querySelector("#report-rail");
  const template = document.querySelector("#report-card-template");
  root.innerHTML = "";

  reports.slice(0, 6).forEach((report) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector(".report-card-date").textContent = report.report_date;
    node.querySelector(".report-card-count").textContent = `${report.total_papers} papers`;
    node.querySelector(".report-card-meta").textContent = `${report.category} · ${report.classifier}`;
    node.classList.toggle("active", report.data_path === activePath);
    node.addEventListener("click", async () => {
      if (report.data_path !== state.currentPath) {
        await loadReport(report.data_path);
      }
    });
    root.appendChild(node);
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
  renderFocusRings(report.focus_topics);
  renderFocusCards(report.focus_topics);
  renderDistribution(report.topic_distribution);
  renderOverview(report);
  renderTagMap(report);
  renderAtlas(report);
  renderTopicNavigator(report.topic_distribution);
  renderFeatureStage(report, sections);
  renderSpotlight(report, sections);
  renderResultsStrip(report, sections);
  renderTopicSections(report, sections);
  bindLikeButtons(document, likeRecords);
}

function renderTagMap(report) {
  const topTopic = report.topic_distribution?.[0]?.topic_label || "其他 AI";
  document.querySelector("#daily-tag-map").innerHTML = [
    {
      label: "Domain",
      value: report.category || "-",
      meta: state.domain ? "当前筛选中的 domain" : "当前日报 domain",
    },
    {
      label: "Date",
      value: report.report_date || "-",
      meta: state.date ? "当前筛选中的日期" : "当前日报日期",
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

function renderHeroSignals(report) {
  const top = report.topic_distribution[0];
  const focusShare = report.focus_topics.reduce((sum, item) => sum + item.share, 0);
  const focusCount = report.focus_topics.reduce((sum, item) => sum + item.count, 0);
  const root = document.querySelector("#hero-signals");
  root.innerHTML = [
    top
      ? `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(top.topic_label)}</strong></div>`
      : "",
    `<div class="signal-chip"><span>Focus Coverage</span><strong>${focusCount} papers / ${focusShare.toFixed(2)}%</strong></div>`,
    `<div class="signal-chip"><span>Classifier</span><strong>${escapeHtml(report.classifier)}</strong></div>`,
    `<div class="signal-chip"><span>Total</span><strong>${report.total_papers}</strong></div>`,
  ].join("");
}

function renderFocusRings(items) {
  const root = document.querySelector("#focus-rings");
  root.innerHTML = items
    .map((item, index) => {
      const radius = 34;
      const circumference = 2 * Math.PI * radius;
      const percent = Math.min(item.share, 100);
      const offset = circumference - (percent / 100) * circumference;
      const gradientId = `ringGradient-${index}`;
      return `
        <article class="focus-ring">
          <div class="focus-ring-graphic">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="var(--accent-strong)" />
                  <stop offset="100%" stop-color="var(--accent)" />
                </linearGradient>
              </defs>
              <circle class="track" cx="50" cy="50" r="${radius}"></circle>
              <circle
                class="progress"
                cx="50"
                cy="50"
                r="${radius}"
                stroke="url(#${gradientId})"
                stroke-dasharray="${circumference}"
                stroke-dashoffset="${offset}"
              ></circle>
            </svg>
            <div class="focus-ring-value">${item.count}</div>
          </div>
          <strong>${escapeHtml(item.topic_label)}</strong>
        </article>
      `;
    })
    .join("");
}

function renderFocusCards(items) {
  const root = document.querySelector("#focus-cards");
  root.innerHTML = items
    .map(
      (item) => `
        <article class="focus-card">
          <div class="focus-card-top">
            <span>${escapeHtml(item.topic_label)}</span>
            <strong>${item.count}</strong>
          </div>
          <div class="focus-meta">${item.share.toFixed(2)}% of daily volume</div>
        </article>
      `
    )
    .join("");
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

  document.querySelector("#overview-title").textContent = `${report.report_date} · ${report.category} 日报概览`;
  const sourceLink = document.querySelector("#source-link");
  sourceLink.href = report.source_url;
  sourceLink.textContent = report.classifier === "codex" ? "Source + Codex" : "Source + Rules";

  document.querySelector("#overview-summary").textContent = top
    ? `${top.topic_label} 是当天主导方向，占比 ${top.share.toFixed(2)}%，共 ${top.count} 篇。`
    : "-";
  document.querySelector("#focus-summary").textContent = `${focusTotal} 篇落在你的重点方向，占总量 ${focusShare.toFixed(2)}%。`;
  document.querySelector("#breadth-summary").textContent = `当天共覆盖 ${topicCount} 个 topic，分类器为 ${report.classifier}。`;
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
    },
    {
      label: "Dominant Topic",
      value: topTopic ? topTopic.topic_label : "-",
      meta: topTopic ? `${topTopic.count} papers · ${topTopic.share.toFixed(2)}%` : "-",
    },
    {
      label: "Active Buckets",
      value: `${activeTopics}`,
      meta: `${report.total_papers} papers distributed`,
    },
    {
      label: "Top-3 Density",
      value: `${topThreeShare.toFixed(2)}%`,
      meta: "share captured by top three topics",
    },
  ]
    .map(
      (item) => `
        <article class="metric-card">
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

  const recentReports = (state.manifest?.reports || []).slice(0, 6).reverse();
  const maxCount = Math.max(...recentReports.map((item) => item.total_papers), 1);
  document.querySelector("#cadence-track").innerHTML = recentReports
    .map((item) => {
      const height = Math.max((item.total_papers / maxCount) * 100, 18);
      return `
        <div class="cadence-bar ${item.data_path === state.currentPath ? "active" : ""}">
          <div class="cadence-bar-fill" style="height:${height}%"></div>
          <span class="cadence-bar-label">${escapeHtml(item.report_date.slice(5))}</span>
          <strong class="cadence-bar-value">${item.total_papers}</strong>
        </div>
      `;
    })
    .join("");

  document.querySelector("#cadence-summary").textContent = buildCadenceSummary(recentReports);
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

function renderFeatureStage(report, sections) {
  const visiblePapers = collectVisiblePapers(sections);
  const visibleDistribution = buildVisibleDistribution(sections);
  const focusPapers = visiblePapers.filter((paper) => focusTopicKeys.has(paper.topic_key));
  const leadPaper = focusPapers[0] || visiblePapers[0] || report.topics[0]?.papers?.[0] || report.papers[0];
  const leadRoot = document.querySelector("#lead-feature");

  if (!leadPaper) {
    leadRoot.innerHTML = `<div class="empty-state">没有可用于展示的 paper。</div>`;
    return;
  }

  leadRoot.innerHTML = `
    <div class="lead-top">
      <span class="lead-eyebrow">Lead Feature</span>
      <span class="lead-badge">${escapeHtml(leadPaper.topic_label)}</span>
    </div>
    <h3>${escapeHtml(leadPaper.title)}</h3>
    <p class="lead-copy">${buildLeadCopy(report, leadPaper)}</p>
    ${renderPaperDetails(leadPaper)}
    <div class="lead-metrics">
      <span class="paper-id">${escapeHtml(leadPaper.paper_id)}</span>
      <span class="paper-badge">${escapeHtml(leadPaper.classification_source || report.classifier)}</span>
      ${
        typeof leadPaper.classification_confidence === "number"
          ? `<span class="paper-badge">${Math.round(leadPaper.classification_confidence * 100)}% conf.</span>`
          : ""
      }
    </div>
    <div class="lead-links">
      ${renderPaperLink({ href: leadPaper.pdf_url || leadPaper.abs_url, label: "arXiv", brand: "arxiv" })}
      ${renderPaperLink({ href: leadPaper.detail_url, label: "Cool", brand: "cool" })}
      ${renderLikeButton(leadPaper)}
    </div>
  `;

  const topThree = (visibleDistribution.length ? visibleDistribution : report.topic_distribution).slice(0, 3);
  const focusTotal = focusPapers.length;
  const topTopic = visibleDistribution[0] || report.topic_distribution[0];
  document.querySelector("#focus-callout").textContent =
    focusTotal > 0
      ? `当前结果里有 ${focusTotal} 篇命中重点方向，优先值得从 Spotlight 区域开始筛。`
      : `当前结果里没有强命中重点方向，可以回到 Topic Navigator 看临近类别的边界论文。`;
  document.querySelector("#dominant-callout").textContent =
    topThree.length > 0
      ? `当前视图里的前 3 个 topic 依次是 ${topThree.map((item) => item.topic_label).join("、")}。`
      : "-";
  document.querySelector("#observation-callout").textContent = topTopic
    ? `${topTopic.topic_label} 在当前视图中领先，占比 ${topTopic.share.toFixed(2)}%。`
    : "-";
}

function renderSpotlight(report, sections) {
  const root = document.querySelector("#spotlight-list");
  const visiblePapers = collectVisiblePapers(sections);
  const focusPapers = (visiblePapers.length ? visiblePapers : report.papers)
    .filter((paper) => focusTopicKeys.has(paper.topic_key))
    .slice(0, 6);

  if (!focusPapers.length) {
    root.innerHTML = `<div class="spotlight-empty">当天没有命中重点方向的 paper，可以优先看 Lead Feature 和 Topic Navigator 里的边界类别。</div>`;
    return;
  }

  root.innerHTML = focusPapers
    .map(
      (paper) => `
        <article class="spotlight-card ${focusTopicKeys.has(paper.topic_key) ? "is-focus" : ""}">
          <div class="paper-card-top">
            <span class="paper-id">${escapeHtml(paper.paper_id)}</span>
            <div class="paper-badges">${renderPaperBadges(paper)}</div>
          </div>
          <h3>${escapeHtml(paper.title)}</h3>
          <p class="spotlight-copy">${buildPaperNote(paper, "spotlight")}</p>
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
    ? `已筛出 ${visiblePapers.length} 篇论文`
    : `当前共浏览 ${report.total_papers} 篇论文`;

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
    root.innerHTML = `<section class="glass-card empty-state">当前过滤条件下没有结果。</section>`;
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
      card.querySelector(".paper-note").textContent = buildPaperNote(paper, "grid");
      card.querySelector(".paper-extra").innerHTML = renderPaperDetails(paper);
      card.querySelector('[data-link="abs"]').href = paper.pdf_url || paper.abs_url;
      card.querySelector('[data-link="detail"]').href = paper.detail_url;
      card.querySelector(".paper-badges").innerHTML = renderPaperBadges(paper);
      const likeId = rememberLikeRecord(paper);
      const likeButton = card.querySelector("[data-like]");
      likeButton.dataset.likeId = likeId;
      likeButton.classList.toggle("is-liked", isLiked(likeId));
      likeButton.setAttribute("aria-pressed", String(isLiked(likeId)));
      paperList.appendChild(card);
    });

    if (!restPapers.length) {
      paperList.innerHTML = `<div class="empty-state">该 topic 当天只有一篇 paper。</div>`;
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
      <p class="topic-lead-copy">${buildTopicLeadCopy(topic, paper)}</p>
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

function buildLeadCopy(report, paper) {
  const focus = focusTopicKeys.has(paper.topic_key);
  if (focus) {
    return `这篇标题直接命中你的重点方向“${paper.topic_label}”。如果你只看少数论文，它应该是当天最先点开的候选之一。`;
  }
  return `这篇 paper 被放在首页 lead，是因为它处在当天主导 topic 的前列，适合作为快速判断当天整体研究风向的入口。`;
}

function buildTopicLeadCopy(topic, paper) {
  const confidenceText =
    typeof paper.classification_confidence === "number"
      ? `${Math.round(paper.classification_confidence * 100)}% conf.`
      : `${paper.classification_source || "rule"} 分类`;
  const visibilityText =
    topic.visibleCount === topic.originalCount
      ? `${topic.visibleCount} 篇 · ${topic.visibleShare.toFixed(2)}%`
      : `当前 ${topic.visibleCount}/${topic.originalCount} 篇可见`;
  return `${visibilityText} · ${confidenceText}`;
}

function buildPaperNote(paper, mode) {
  if (paper.topic_key === "generative_foundations") {
    return mode === "spotlight"
      ? "偏生成模型理论基础，优先判断是否涉及目标函数、动力学或可证明性质。"
      : "更偏理论基础，适合和 diffusion / flow / world model 方向做机制对照。";
  }
  if (paper.topic_key === "multimodal_generative") {
    return mode === "spotlight"
      ? "命中多模态生成建模，先看生成对象、条件控制和模态耦合方式。"
      : "属于多模态生成方向，适合快速判断建模对象与控制粒度。";
  }
  if (paper.topic_key === "multimodal_agents") {
    return mode === "spotlight"
      ? "命中多模态智能体，优先看感知、记忆和行动闭环是否完整。"
      : "属于多模态智能体方向，适合先看任务闭环和环境交互设定。";
  }
  if (paper.classification_source === "codex") {
    return "由 Codex 完成分类，适合和规则分类结果交叉核对。";
  }
  return mode === "spotlight"
    ? "这是重点区域中的候选标题，适合先做标题级筛读再进入原文。"
    : "作为同类样本之一，适合与该 topic 的 lead paper 做横向比较。";
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

function buildCadenceSummary(reports) {
  if (!reports.length) {
    return "还没有可用日报。";
  }
  if (reports.length === 1) {
    return "当前只有 1 份日报，趋势条会在后续积累时自动展开。";
  }
  const latest = reports[reports.length - 1];
  const previous = reports[reports.length - 2];
  const delta = latest.total_papers - previous.total_papers;
  const direction = delta === 0 ? "持平" : delta > 0 ? `较前一日增加 ${delta}` : `较前一日减少 ${Math.abs(delta)}`;
  return `${latest.report_date} 共 ${latest.total_papers} 篇，${direction} 篇。`;
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
    sourcePage: "./index.html",
    snapshotLabel: report ? `${report.report_date} · ${report.category}` : "Cool Daily",
    reportDate: report?.report_date || "",
    category: report?.category || "",
  });
  likeRecords.set(record.like_id, record);
  return record.like_id;
}

function renderPaperBadges(paper) {
  const badges = [`<span class="paper-badge">${escapeHtml(paper.topic_label)}</span>`];
  if (focusTopicKeys.has(paper.topic_key)) {
    badges.push(`<span class="paper-badge focus">focus</span>`);
  }
  if (paper.classification_source) {
    badges.push(`<span class="paper-badge">${escapeHtml(paper.classification_source)}</span>`);
  }
  if (typeof paper.classification_confidence === "number") {
    badges.push(`<span class="paper-badge">${Math.round(paper.classification_confidence * 100)}% conf.</span>`);
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

function renderEmpty(message = "还没有可用分类快照。") {
  document.querySelector("#home-board-summary").textContent = message;
  document.querySelector("#home-categories").innerHTML =
    `<div class="empty-state">还没有可用日报。先运行抓取和报告生成脚本，再执行站点数据构建。</div>`;
  document.querySelector("#topic-sections").innerHTML =
    `<section class="glass-card empty-state">还没有可用日报。先运行抓取和报告生成脚本，再执行站点数据构建。</section>`;
  const tagMap = document.querySelector("#daily-tag-map");
  if (tagMap) {
    tagMap.innerHTML = "";
  }
}

function renderFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector("#topic-sections").innerHTML =
    `<section class="glass-card empty-state">站点加载失败：${escapeHtml(message)}</section>`;
}

async function fetchJson(url) {
  const response = await fetch(url);
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
