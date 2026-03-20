import { getSourceLabel, initLikesSync, readLikes, subscribeLikes } from "./likes.js?v=d409e691d1";
import { initQueue, readQueue, removeFromQueue, subscribeQueue } from "./paper_queue.js?v=8b696292c3";
import { movePaperToLikes, repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=1060920198";
import { mountAppToolbar } from "./app_toolbar.js?v=625fba0996";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=c2effc3556";
import { bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { initToolbarPreferences } from "./toolbar_preferences.js?v=a0ed68b91d";
import { escapeAttribute, escapeHtml, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";

mountAppToolbar("#queue-toolbar-root", {
  prefix: "queue",
  filtersTemplateId: "queue-toolbar-filters",
  branchActiveKey: null,
  libraryActiveKey: "later",
  quickAddTarget: "later",
});

const PAGE_SIZE = 6;
const laterList = document.querySelector("#later-list");
const laterSummary = document.querySelector("#later-summary");
const laterPagination = document.querySelector("#later-pagination");
const laterHeroCount = document.querySelector("#later-hero-count");
const laterHeroLiked = document.querySelector("#later-hero-liked");
const laterHeroBranches = document.querySelector("#later-hero-branches");
const laterHeroSource = document.querySelector("#later-hero-source");
const laterHeroTopic = document.querySelector("#later-hero-topic");
const searchInput = document.querySelector("#queue-search-input");
const sidebarToggleButton = document.querySelector("#queue-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#queue-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#queue-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#queue-filters-menu");

let laterPage = 0;
let laterPapers = [];
let likedPapers = [];
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
  initToolbarPreferences({ pageKey: "queue" });
  bindFilterMenu({
    button: sidebarToggleButton,
    panel: filterMenuPanel,
    labelNode: sidebarToggleLabel,
    iconNode: sidebarToggleIcon,
  });
  bindSearchInput();
  bindBranchAuthToolbar("queue");
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("queue", { target: "later" });
  subscribeQueue(renderPage);
  subscribeLikes(renderPage);
  await Promise.all([initQueue(), initLikesSync()]);
  repairLikeLaterConflicts();
  renderPage();
}

function renderPage() {
  laterPapers = readQueue("later");
  likedPapers = readLikes();
  const visiblePapers = filterLaterPapers(laterPapers);
  renderHero(laterPapers, likedPapers);
  renderLaterList(visiblePapers);
}

function bindSearchInput() {
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      laterPage = 0;
      renderPage();
    });
  }
}

function filterLaterPapers(papers) {
  const query = searchQuery.trim();
  if (!query) {
    return papers;
  }
  return papers.filter((paper) => {
    const haystack = [
      paper.title,
      paper.abstract,
      paper.topic_label,
      getSourceLabel(paper.source_kind),
      paper.source_kind,
      ...(paper.authors || []),
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(query);
  });
}

function renderHero(laterQueue, likes) {
  const sourceCounts = new Map();
  const topicCounts = new Map();

  laterQueue.forEach((paper) => {
    const sourceLabel = getSourceLabel(paper.source_kind);
    sourceCounts.set(sourceLabel, (sourceCounts.get(sourceLabel) || 0) + 1);
    const topicLabel = displayTopicLabel(paper.topic_label || "Other AI");
    topicCounts.set(topicLabel, (topicCounts.get(topicLabel) || 0) + 1);
  });

  const topSource = [...sourceCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))[0] || null;
  const topTopic = [...topicCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))[0] || null;

  laterHeroCount.textContent = laterQueue.length ? `${laterQueue.length} queued` : "All clear";
  laterHeroLiked.textContent = String(likes.length);
  laterHeroBranches.textContent = String(sourceCounts.size);
  laterHeroSource.textContent = topSource ? `${topSource[0]} · ${topSource[1]}` : "-";
  laterHeroTopic.textContent = topTopic ? `${topTopic[0]} · ${topTopic[1]}` : "-";
}

function renderLaterList(papers) {
  if (!laterList) {
    return;
  }

  if (!papers.length) {
    const emptyText = searchQuery ? "No papers match the current search." : "No papers in Later queue yet.";
    laterSummary.textContent = emptyText;
    laterList.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    laterPagination.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(papers.length / PAGE_SIZE);
  laterPage = Math.min(laterPage, totalPages - 1);
  const start = laterPage * PAGE_SIZE;
  const pageItems = papers.slice(start, start + PAGE_SIZE);

  laterSummary.textContent = searchQuery
    ? `${papers.length} of ${laterPapers.length} papers match the current search.`
    : `${papers.length} papers queued for later reading.`;

  laterList.innerHTML = pageItems
    .map(
      (paper) => `
        <article class="spotlight-card">
          <div class="spotlight-meta">
            <span>${escapeHtml(displayTopicLabel(paper.topic_label || "Other AI"))}</span>
            <span>${escapeHtml(getSourceLabel(paper.source_kind))}</span>
          </div>
          <h3>${escapeHtml(paper.title || "Untitled")}</h3>
          <div class="paper-authors-box">
            <span class="paper-detail-label">Authors</span>
            <p class="paper-authors-line">${escapeHtml(paper.authors?.join(", ") || "Unknown")}</p>
          </div>
          ${paper.abstract ? `
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
          ` : ""}
          <div class="paper-links">
            ${renderExternalPaperLink({ href: getArxivUrl(paper), label: "arXiv", brand: "arxiv" })}
            ${renderExternalPaperLink({ href: getCoolUrl(paper), label: "Cool", brand: "cool" })}
            <button class="paper-link later-button is-later" type="button" data-remove-id="${escapeAttribute(paper.like_id)}" aria-pressed="true">
              <span class="paper-link-icon later-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
              </span>
              <span class="paper-link-text">Later</span>
            </button>
            <button class="paper-link like-button" type="button" data-like-id="${escapeAttribute(paper.like_id)}" aria-pressed="false">
              <span class="paper-link-icon like-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path d="M10 16.3l-5.26-4.98A3.8 3.8 0 0 1 10 5.9a3.8 3.8 0 0 1 5.26 5.42z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="paper-link-text">Like</span>
            </button>
          </div>
        </article>
      `
    )
    .join("");

  laterPagination.innerHTML =
    totalPages > 1
      ? `<div class="pagination">
          <button class="pill-button" data-later-page="prev" ${laterPage === 0 ? "disabled" : ""}>← Prev</button>
          <span class="pagination-info">${laterPage + 1} / ${totalPages}</span>
          <button class="pill-button" data-later-page="next" ${laterPage >= totalPages - 1 ? "disabled" : ""}>Next →</button>
        </div>`
      : "";

  laterPagination.querySelectorAll("[data-later-page]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.laterPage === "prev" && laterPage > 0) {
        laterPage -= 1;
      } else if (button.dataset.laterPage === "next" && laterPage < totalPages - 1) {
        laterPage += 1;
      }
      renderLaterList(papers);
    });
  });

  laterList.querySelectorAll("[data-like-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const likeId = button.dataset.likeId;
      const paper = papers.find((item) => item.like_id === likeId);
      if (!paper) {
        return;
      }
      movePaperToLikes(paper);
      renderPage();
    });
  });

  laterList.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", () => {
      removeFromQueue(button.dataset.removeId);
      renderPage();
    });
  });
}

function renderExternalPaperLink({ href, label, brand }) {
  if (!href) {
    return "";
  }
  const iconSrc =
    brand === "arxiv"
      ? "./assets/arxiv-logo.svg"
      : brand === "cool"
      ? "./assets/cool-favicon.ico"
      : "";
  return `
    <a class="paper-link brand-${escapeAttribute(brand)}" href="${escapeAttribute(href)}" target="_blank" rel="noreferrer">
      <span class="paper-link-icon" aria-hidden="true">${iconSrc ? `<img src="${iconSrc}" alt="" />` : ""}</span>
      <span class="paper-link-text">${escapeHtml(label)}</span>
    </a>
  `;
}

function getArxivUrl(paper) {
  return paper.pdf_url || paper.abs_url || "";
}

function getCoolUrl(paper) {
  if (paper.detail_url) {
    return paper.detail_url;
  }
  if (paper.paper_id && (paper.pdf_url || paper.abs_url || paper.hf_url)) {
    return `https://papers.cool/arxiv/${paper.paper_id}`;
  }
  return "";
}

function renderFatal(error) {
  const message = getErrorMessage(error);
  const html = `<div class="empty-state">Queue page failed to load: ${escapeHtml(message)}</div>`;
  if (laterList) {
    laterList.innerHTML = html;
  }
  if (laterSummary) {
    laterSummary.textContent = "Later queue unavailable.";
  }
  if (laterPagination) {
    laterPagination.innerHTML = "";
  }
}

function displayTopicLabel(value) {
  const label = String(value || "").trim();
  if (!label) {
    return "Other AI";
  }
  return TOPIC_LABEL_TRANSLATIONS.get(label) || label;
}
