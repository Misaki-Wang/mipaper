import { getSourceLabel, initLikesSync, isLiked, readLikes, subscribeLikes, toggleLike } from "./likes.js?v=3b466b6556";
import { bindLikeButtons } from "./likes.js?v=3b466b6556";
import { bindQueueButtons, initQueue, isInQueue, readQueue, removeFromQueue, subscribeQueue } from "./paper_queue.js?v=033bd186d1";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=66a12f1edc";
import { mountAppToolbar } from "./app_toolbar.js?v=a364077e66";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=c2effc3556";
import { bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { initToolbarPreferences } from "./toolbar_preferences.js?v=c889d6e375";
import { escapeAttribute, escapeHtml, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";
import {
  hasDirectAddsMigrationRun,
  initDirectAddSync,
  markDirectAddsMigrationRun,
  readDirectAdds,
  removeDirectAdd,
  seedDirectAdds,
  subscribeDirectAdds,
} from "./direct_add_store.js?v=f47049a9ef";

mountAppToolbar("#direct-toolbar-root", {
  prefix: "direct",
  filtersTemplateId: "direct-toolbar-filters",
  branchActiveKey: "direct",
  libraryActiveKey: null,
  quickAddTarget: "later",
});

const PAGE_SIZE = 6;
const directList = document.querySelector("#direct-list");
const directSummary = document.querySelector("#direct-summary");
const directPagination = document.querySelector("#direct-pagination");
const directHeroCount = document.querySelector("#direct-hero-count");
const directHeroLiked = document.querySelector("#direct-hero-liked");
const directHeroComplete = document.querySelector("#direct-hero-complete");
const directHeroPending = document.querySelector("#direct-hero-pending");
const directHeroSource = document.querySelector("#direct-hero-source");
const searchInput = document.querySelector("#direct-search-input");
const sortSelect = document.querySelector("#direct-sort");
const metadataFilterSelect = document.querySelector("#direct-metadata-filter");
const sidebarToggleButton = document.querySelector("#direct-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#direct-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#direct-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#direct-filters-menu");

let directPage = 0;
let directPapers = [];
let likedPapers = [];
let searchQuery = "";
let sortMode = sortSelect?.value || "newest";
let metadataFilter = metadataFilterSelect?.value || "all";

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  initToolbarPreferences({ pageKey: "direct" });
  bindFilterMenu({
    button: sidebarToggleButton,
    panel: filterMenuPanel,
    labelNode: sidebarToggleLabel,
    iconNode: sidebarToggleIcon,
  });
  bindSearchInput();
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("direct", { target: "later", skipDirectInit: true });
  bindBranchAuthToolbar("direct");
  subscribeDirectAdds(renderPage);
  subscribeQueue(renderPage);
  subscribeLikes(renderPage);
  renderPage();
  await Promise.all([initQueue(), initLikesSync()]);

  if (!hasDirectAddsMigrationRun()) {
    const existingDirectAdds = readDirectAdds();
    if (!existingDirectAdds.length) {
      const migratedDirectAdds = [...readQueue(), ...readLikes()].filter(isDirectAddPaper);
      if (migratedDirectAdds.length) {
        seedDirectAdds(migratedDirectAdds);
      }
    }
    markDirectAddsMigrationRun();
  }
  repairLikeLaterConflicts();
  await initDirectAddSync();
  renderPage();
}

function bindSearchInput() {
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim().toLowerCase();
      directPage = 0;
      renderPage();
    });
  }
  sortSelect?.addEventListener("change", () => {
    sortMode = sortSelect.value || "newest";
    directPage = 0;
    renderPage();
  });
  metadataFilterSelect?.addEventListener("change", () => {
    metadataFilter = metadataFilterSelect.value || "all";
    directPage = 0;
    renderPage();
  });
}

function renderPage() {
  const queue = readQueue("later");
  likedPapers = readLikes();
  const laterIds = new Set(queue.map((paper) => paper.like_id));
  const likedIds = new Set(likedPapers.map((paper) => paper.like_id));
  directPapers = readDirectAdds().map((paper) => ({
    ...paper,
    metadata_complete: hasMeaningfulMetadata(paper),
    in_later: laterIds.has(paper.like_id),
    liked: likedIds.has(paper.like_id),
  }));
  const visiblePapers = sortDirectAddPapers(filterDirectAddPapers(directPapers));
  renderHero(directPapers, likedPapers);
  renderDirectList(visiblePapers);
}

function isDirectAddPaper(paper) {
  return String(paper?.source_kind || "").toLowerCase() === "library";
}

function filterDirectAddPapers(papers) {
  const query = searchQuery.trim();
  return papers.filter((paper) => {
    if (metadataFilter === "complete" && !paper.metadata_complete) {
      return false;
    }
    if (metadataFilter === "incomplete" && paper.metadata_complete) {
      return false;
    }

    if (!query) {
      return true;
    }

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

function sortDirectAddPapers(papers) {
  const list = [...papers];
  if (sortMode === "oldest") {
    return list.sort((left, right) => String(left.saved_at || "").localeCompare(String(right.saved_at || "")));
  }
  if (sortMode === "title") {
    return list.sort((left, right) => String(left.title || "").localeCompare(String(right.title || ""), "en"));
  }
  return list.sort((left, right) => String(right.saved_at || "").localeCompare(String(left.saved_at || "")));
}

function renderHero(directQueue, likes) {
  const sourceCounts = new Map();
  const completeCount = directQueue.filter((paper) => paper.metadata_complete).length;
  const pendingCount = Math.max(0, directQueue.length - completeCount);

  directQueue.forEach((paper) => {
    const sourceLabel = getSourceLabel(paper.source_kind);
    sourceCounts.set(sourceLabel, (sourceCounts.get(sourceLabel) || 0) + 1);
  });

  const topSource = [...sourceCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))[0] || null;

  directHeroCount.textContent = directQueue.length ? `${directQueue.length} direct adds` : "No direct adds";
  directHeroLiked.textContent = String(likes.length);
  directHeroComplete.textContent = String(completeCount);
  directHeroPending.textContent = String(pendingCount);
  if (directHeroSource) {
    directHeroSource.textContent = topSource ? `${topSource[0]} · ${topSource[1]}` : "Library";
  }
}

function renderDirectList(papers) {
  if (!directList) {
    return;
  }

  if (!papers.length) {
    const emptyText = searchQuery || metadataFilter !== "all" ? "No direct adds match the current filters." : "No direct adds yet.";
    directSummary.textContent = emptyText;
    directList.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    directPagination.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(papers.length / PAGE_SIZE);
  directPage = Math.min(directPage, totalPages - 1);
  const start = directPage * PAGE_SIZE;
  const pageItems = papers.slice(start, start + PAGE_SIZE);

  directSummary.textContent = searchQuery || metadataFilter !== "all"
    ? `${papers.length} of ${directPapers.length} direct adds match the current filters.`
    : `${papers.length} direct adds saved.`;

  directList.innerHTML = pageItems
    .map(
      (paper) => `
        <article class="spotlight-card">
          <div class="spotlight-meta">
            <span>${escapeHtml(displayTopicLabel(paper.topic_label || "Direct Add"))}</span>
            <span>${escapeHtml(getSourceLabel(paper.source_kind))}</span>
            <span class="direct-metadata-pill ${paper.metadata_complete ? "is-complete" : "is-pending"}">${paper.metadata_complete ? "Complete" : "Pending"}</span>
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
            <button class="paper-link later-button${paper.in_later ? " is-later" : ""}" type="button" data-later-id="${escapeAttribute(paper.like_id)}" aria-pressed="${paper.in_later ? "true" : "false"}">
              <span class="paper-link-icon later-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                </svg>
              </span>
              <span class="paper-link-text">Later</span>
            </button>
            <button class="paper-link like-button${paper.liked ? " is-liked" : ""}" type="button" data-like-id="${escapeAttribute(paper.like_id)}" aria-pressed="${paper.liked ? "true" : "false"}">
              <span class="paper-link-icon like-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path d="M10 16.3l-5.26-4.98A3.8 3.8 0 0 1 10 5.9a3.8 3.8 0 0 1 5.26 5.42z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="paper-link-text">Like</span>
            </button>
            <button class="paper-link direct-remove-button" type="button" data-direct-remove-id="${escapeAttribute(paper.like_id)}" aria-label="Remove from Direct Add" title="Remove from Direct Add">
              <span class="paper-link-icon remove-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <path d="M6.3 5.8h7.4M7.3 5.8V4.9a1.1 1.1 0 0 1 1.1-1.1h3.2a1.1 1.1 0 0 1 1.1 1.1v.9M7 5.8l.4 8.1a1 1 0 0 0 1 .9h3.2a1 1 0 0 0 1-.9l.4-8.1M8.6 8.2v4.2M11.4 8.2v4.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
              </span>
              <span class="paper-link-text">Remove</span>
            </button>
          </div>
        </article>
      `
    )
    .join("");

  directPagination.innerHTML =
    totalPages > 1
      ? `<div class="pagination">
          <button class="pill-button" data-direct-page="prev" ${directPage === 0 ? "disabled" : ""}>← Prev</button>
          <span class="pagination-info">${directPage + 1} / ${totalPages}</span>
          <button class="pill-button" data-direct-page="next" ${directPage >= totalPages - 1 ? "disabled" : ""}>Next →</button>
        </div>`
      : "";

  directPagination.querySelectorAll("[data-direct-page]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.directPage === "prev" && directPage > 0) {
        directPage -= 1;
      } else if (button.dataset.directPage === "next" && directPage < totalPages - 1) {
        directPage += 1;
      }
      renderDirectList(papers);
    });
  });

  const directRecordLookup = new Map(papers.map((paper) => [paper.like_id, paper]));
  bindQueueButtons(directList, directRecordLookup);
  bindLikeButtons(directList, directRecordLookup);
  bindRemoveButtons(directList);
}

function getArxivUrl(paper) {
  return paper.pdf_url || paper.abs_url || paper.arxiv_url || "";
}

function getCoolUrl(paper) {
  return paper.detail_url || paper.papers_cool_url || "";
}

function displayTopicLabel(label) {
  const text = String(label || "Direct Add");
  return text === "Direct Add" ? "Direct Add" : text;
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

function bindRemoveButtons(root) {
  root.querySelectorAll("[data-direct-remove-id]").forEach((button) => {
    if (button.dataset.directRemoveBound === "true") {
      return;
    }
    button.dataset.directRemoveBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const likeId = button.dataset.directRemoveId || "";
      if (!likeId) {
        return;
      }
      const record = directPapers.find((item) => item.like_id === likeId) || null;
      if (isInQueue(likeId)) {
        removeFromQueue(likeId);
      }
      if (record && isLiked(likeId)) {
        toggleLike(record);
      }
      removeDirectAdd(likeId);
    });
  });
}

function renderFatal(error) {
  if (!directList) {
    return;
  }
  directList.innerHTML = `<div class="empty-state">${escapeHtml(getErrorMessage(error))}</div>`;
  if (directSummary) {
    directSummary.textContent = "Failed to load direct adds.";
  }
}

function hasMeaningfulMetadata(record) {
  const title = String(record?.title || "").trim();
  const authors = Array.isArray(record?.authors) ? record.authors.filter(Boolean) : [];
  const abstract = String(record?.abstract || "").trim();
  return Boolean(title && !/^arXiv\s+\d/i.test(title) && authors.length > 0 && abstract.length > 20);
}
