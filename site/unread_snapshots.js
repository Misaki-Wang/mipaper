import { createPageReviewKey, initReviewSync, isPageReviewed, setPageReviewed, subscribePageReviews } from "./reading_state.js?v=20260319-4";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=20260319-5";
import { mountAppToolbar } from "./app_toolbar.js?v=20260319-11";
import { bindBranchNav } from "./branch_nav.js?v=20260319-4";
import { bindLibraryNav } from "./library_nav.js?v=20260319-4";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=20260319-12";

mountAppToolbar("#unread-toolbar-root", {
  prefix: "unread",
  filtersTemplateId: "unread-toolbar-filters",
  branchActiveKey: null,
  libraryActiveKey: "unread",
  quickAddTarget: "later",
});

const PAGE_SIZE = 6;
const listRoot = document.querySelector("#unread-list");
const summaryNode = document.querySelector("#unread-summary");
const paginationNode = document.querySelector("#unread-pagination");
const heroCountNode = document.querySelector("#unread-hero-count");
const heroBranchesNode = document.querySelector("#unread-hero-branches");
const heroLatestNode = document.querySelector("#unread-hero-latest");
const heroBranchNode = document.querySelector("#unread-hero-branch");
const heroReviewedNode = document.querySelector("#unread-hero-reviewed");
const searchInput = document.querySelector("#unread-search-input");

let page = 0;
let snapshots = [];
let searchQuery = "";

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
  bindThemeToggle();
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

function renderPage() {
  const unreadSnapshots = snapshots.filter((snapshot) => !isPageReviewed(snapshot.review_key));
  const visibleSnapshots = filterSnapshots(unreadSnapshots);
  const totalReviewed = snapshots.length - unreadSnapshots.length;
  const branchCounts = new Map();
  visibleSnapshots.forEach((snapshot) => {
    branchCounts.set(snapshot.branch_label, (branchCounts.get(snapshot.branch_label) || 0) + 1);
  });
  const topBranch = [...branchCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))[0] || null;

  heroCountNode.textContent = unreadSnapshots.length ? `${unreadSnapshots.length} unread` : "All clear";
  heroBranchesNode.textContent = String(new Set(unreadSnapshots.map((snapshot) => snapshot.branch_label)).size);
  heroLatestNode.textContent = unreadSnapshots[0]?.snapshot_label || "-";
  heroBranchNode.textContent = topBranch ? `${topBranch[0]} · ${topBranch[1]}` : "-";
  heroReviewedNode.textContent = String(totalReviewed);

  if (!unreadSnapshots.length) {
    summaryNode.textContent = "Every fetched snapshot has been reviewed.";
    listRoot.innerHTML = `<div class="empty-state">No unread snapshots remain in your queue.</div>`;
    paginationNode.innerHTML = "";
    return;
  }

  if (!visibleSnapshots.length) {
    summaryNode.textContent = "No unread snapshots match the current search.";
    listRoot.innerHTML = `<div class="empty-state">No unread snapshots match the current search.</div>`;
    paginationNode.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(visibleSnapshots.length / PAGE_SIZE);
  page = Math.min(page, totalPages - 1);
  const start = page * PAGE_SIZE;
  const pageItems = visibleSnapshots.slice(start, start + PAGE_SIZE);

  summaryNode.textContent = searchQuery
    ? `${visibleSnapshots.length} of ${unreadSnapshots.length} fetched snapshots match the current search.`
    : `${unreadSnapshots.length} fetched snapshots are currently waiting for review.`;

  listRoot.innerHTML = pageItems
    .map(
      (snapshot) => `
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
          </div>
        </article>
      `
    )
    .join("");

  paginationNode.innerHTML =
    totalPages > 1
      ? `<div class="pagination">
          <button class="pill-button" data-page="prev" ${page === 0 ? "disabled" : ""}>← Prev</button>
          <span class="pagination-info">${page + 1} / ${totalPages}</span>
          <button class="pill-button" data-page="next" ${page >= totalPages - 1 ? "disabled" : ""}>Next →</button>
        </div>`
      : "";

  paginationNode.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.page === "prev" && page > 0) {
        page -= 1;
      } else if (button.dataset.page === "next" && page < totalPages - 1) {
        page += 1;
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

function bindSearchInput() {
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      page = 0;
      renderPage();
    });
  }
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
  const message = error instanceof Error ? error.message : String(error);
  if (summaryNode) {
    summaryNode.textContent = "Unread snapshot page failed to load.";
  }
  if (listRoot) {
    listRoot.innerHTML = `<div class="empty-state">Unread snapshot page failed to load: ${escapeHtml(message)}</div>`;
  }
  if (paginationNode) {
    paginationNode.innerHTML = "";
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

  manifestUrls.unshift("./data/daily/manifest.json", "./data/hf-daily/manifest.json", "./data/conference/manifest.json");
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

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
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
