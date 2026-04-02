import { getSourceLabel, initLikesSync, readLikes, subscribeLikes, updateLikedPapers } from "./likes.js?v=010cf1b2c9";
import { initQueue, readQueue, removeFromQueue, subscribeQueue, updateQueuedPaper, updateQueuedPapers } from "./paper_queue.js?v=033bd186d1";
import { movePaperToLikes, repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=66a12f1edc";
import { mountAppToolbar } from "./app_toolbar.js?v=c5124e8940";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=88024f7cbb";
import { bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { initToolbarPreferences } from "./toolbar_preferences.js?v=c889d6e375";
import { createShowMoreAutoLoadController } from "./show_more_autoload.js?v=5f324a6f25";
import { escapeAttribute, escapeHtml, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";
import { renderWorkspaceMarkdownPreviewContent } from "./workspace_markdown.js?v=7d091b73bd";
import {
  PRIORITY_OPTIONS,
  WORKFLOW_STATUS_OPTIONS,
  displayTopicLabel,
  getPriorityLabel,
  getPriorityValue,
  getWorkflowStatusLabel,
  getWorkflowStatusValue,
} from "./like_page_labels.js?v=aaa244a29d";
import {
  CUSTOM_TAG_PALETTE,
  applyCustomTagToRecord,
  assignTagColor,
  buildCustomTag,
  collectCustomTagCatalog,
  getCustomTagStyle,
  getPaperCustomTags,
  mergeCustomTagsInRecord,
  removeCustomTagFromRecord,
  reorderCustomTagsInRecord,
  updateCustomTagDefinitionInRecord,
} from "./like_page_tags.js?v=dce6e52df9";
import { installManualLibraryTestCases } from "./manual_test_cases.js?v=2bdd5fc135";
import { readWorkspacePanelDefaultMode, subscribeUserSettings } from "./user_settings.js?v=6c7496f04b";

mountAppToolbar("#queue-toolbar-root", {
  prefix: "queue",
  showFilters: false,
  toolbarSearch: {
    inputId: "queue-search-input",
    placeholder: "Search title, authors, topic, or tags",
    ariaLabel: "Search later queue by title, authors, topic, or custom tags",
  },
  branchActiveKey: null,
  libraryActiveKey: "later",
  quickAddTarget: "later",
});
installManualLibraryTestCases();

const LATER_INITIAL_SIZE = 6;
const LATER_LOAD_MORE_SIZE = 6;
const laterList = document.querySelector("#later-list");
const laterSummary = document.querySelector("#later-summary");
const laterActions = document.querySelector("#later-actions");
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

let laterVisibleCount = LATER_INITIAL_SIZE;
let laterPapers = [];
let likedPapers = [];
let searchQuery = "";
let viewMode = "card";
let workspacePanelDefaultMode = readWorkspacePanelDefaultMode();
let customTagSummaryFrame = 0;
let workspaceUiBindingsInitialized = false;

const workspacePanelOverrides = new Map();
const tagWorkbenchState = {
  openLikeId: "",
  manageLikeId: "",
  editorLikeId: "",
  editorTagKey: "",
};
const showMoreAutoLoad = createShowMoreAutoLoadController({
  bindingFlag: "queueShowMoreAutoLoadBound",
  onTrigger: ({ total }) => {
    if (!expandVisibleLaterCount(total)) {
      return false;
    }
    renderPage();
    return true;
  },
});

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  showMoreAutoLoad.init();
  showMoreAutoLoad.bindUserScrollIntentTracking();
  viewMode = initToolbarPreferences({
    pageKey: "queue",
    onViewModeChange: (mode) => {
      viewMode = mode;
      renderPage();
    },
  });
  bindFilterMenu({
    button: sidebarToggleButton,
    panel: filterMenuPanel,
    labelNode: sidebarToggleLabel,
    iconNode: sidebarToggleIcon,
  });
  bindSearchInput();
  bindWorkspaceUiGlobalEvents();
  bindBranchAuthToolbar("queue");
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("queue", { target: "later" });
  subscribeQueue(renderPage);
  subscribeLikes(renderPage);
  subscribeUserSettings((snapshot) => {
    if (snapshot?.workspacePanelDefaultMode === workspacePanelDefaultMode) {
      return;
    }
    workspacePanelDefaultMode = snapshot?.workspacePanelDefaultMode || "expanded";
    renderPage();
  });
  await Promise.all([initQueue(), initLikesSync()]);
  repairLikeLaterConflicts();
  renderPage();
}

function bindWorkspaceUiGlobalEvents() {
  if (workspaceUiBindingsInitialized || typeof window === "undefined") {
    return;
  }
  workspaceUiBindingsInitialized = true;
  window.addEventListener("resize", scheduleCustomTagSummaryLayout, { passive: true });
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => scheduleCustomTagSummaryLayout()).catch(() => {});
  }
}

function renderPage() {
  laterPapers = readQueue("later");
  likedPapers = readLikes();
  const visiblePapers = filterLaterPapers(laterPapers);
  renderHero(laterPapers, likedPapers);
  renderLaterList(visiblePapers);
}

function bindSearchInput() {
  if (!searchInput) {
    return;
  }

  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    laterVisibleCount = LATER_INITIAL_SIZE;
    renderPage();
  });
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
      ...getPaperCustomTags(paper).map((tag) => tag.label),
      paper.one_line_takeaway,
      paper.next_action,
      getWorkflowStatusLabel(paper.workflow_status),
      getPriorityLabel(paper.priority_level),
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(query);
  });
}

function renderHero(laterQueue, likes) {
  if (!laterHeroCount || !laterHeroLiked || !laterHeroBranches || !laterHeroSource || !laterHeroTopic) {
    return;
  }

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
  if (!laterList || !laterSummary || !laterActions) {
    return;
  }

  if (!papers.length) {
    const emptyText = searchQuery ? "No papers match the current search." : "No papers in Later queue yet.";
    laterSummary.textContent = emptyText;
    laterList.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    laterActions.innerHTML = "";
    showMoreAutoLoad.refresh();
    return;
  }

  const visibleCount = readVisibleLaterCount(papers.length);
  const visiblePapers = papers.slice(0, visibleCount);
  const hasMore = visibleCount < papers.length;
  const canCollapse = visibleCount > Math.min(LATER_INITIAL_SIZE, papers.length);

  laterSummary.textContent = searchQuery
    ? `${papers.length} of ${laterPapers.length} papers match the current search.`
    : `${papers.length} papers queued for later reading.`;

  laterList.innerHTML = visiblePapers
    .map((paper) => (viewMode === "list" ? renderLaterPaperRow(paper) : renderLaterPaperCard(paper)))
    .join("");

  laterActions.innerHTML = `
    <div class="conference-subject-footer">
      <span class="conference-subject-progress">Showing ${visiblePapers.length} of ${papers.length} papers</span>
      <div class="conference-subject-actions">
        ${canCollapse ? `<button class="link-chip button-link" type="button" data-later-action="less">Show less</button>` : ""}
        ${
          hasMore
            ? `<button class="link-chip button-link" type="button" data-later-action="more" data-show-more-auto-load="later" data-show-more-total="${papers.length}">Show more</button>`
            : ""
        }
      </div>
    </div>
  `;
  showMoreAutoLoad.refresh();

  laterActions.querySelectorAll("[data-later-action]").forEach((button) => {
    button.addEventListener("click", () => {
      showMoreAutoLoad.suppress();
      if (button.dataset.laterAction === "more") {
        expandVisibleLaterCount(papers.length);
      } else if (button.dataset.laterAction === "less") {
        laterVisibleCount = Math.min(LATER_INITIAL_SIZE, papers.length);
      }
      renderLaterList(papers);
    });
  });

  laterList.querySelectorAll("[data-like-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const likeId = button.dataset.likeId || "";
      const currentPaper = readQueue("later").find((item) => item.like_id === likeId) || papers.find((item) => item.like_id === likeId);
      if (!currentPaper) {
        return;
      }

      const nextFields = readWorkspaceFieldValues(likeId);
      const updatedRecord = saveWorkspaceFields(likeId, nextFields);
      transferQueuePaperToLikes({
        ...currentPaper,
        ...nextFields,
        ...(updatedRecord || {}),
      });
    });
  });

  laterList.querySelectorAll("[data-remove-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeFromQueue(button.dataset.removeId);
      renderPage();
    });
  });

  bindWorkspacePanels();
  bindWorkspaceEditors();
  bindTagComposer();
  restoreTagWorkbenchState();
  scheduleCustomTagSummaryLayout();
}

function readVisibleLaterCount(totalPapers) {
  const minimum = Math.min(LATER_INITIAL_SIZE, totalPapers);
  laterVisibleCount = Math.max(laterVisibleCount, minimum);
  return Math.min(laterVisibleCount, totalPapers);
}

function expandVisibleLaterCount(totalPapers) {
  const current = readVisibleLaterCount(totalPapers);
  const next = Math.min(current + LATER_LOAD_MORE_SIZE, totalPapers);
  if (next <= current) {
    return false;
  }
  laterVisibleCount = next;
  return true;
}

function renderLaterPaperCard(paper) {
  const workflowStatus = getWorkflowStatusValue(paper.workflow_status);
  const workflowStatusLabel = getWorkflowStatusLabel(workflowStatus);
  const view = buildQueuePaperViewModel(paper);
  return `
    <article class="spotlight-card">
      <div class="spotlight-meta">
        <span>${escapeHtml(displayTopicLabel(paper.topic_label || "Other AI"))}</span>
        <span>${escapeHtml(getSourceLabel(paper.source_kind))}</span>
      </div>
      <h3>${escapeHtml(paper.title || "Untitled")}</h3>
      ${view.customTagSummary}
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
      ${renderWorkspacePanel(view)}
      <div class="paper-links">
        ${renderExternalPaperLink({ href: getArxivUrl(paper), label: "arXiv", brand: "arxiv" })}
        ${renderExternalPaperLink({ href: getCoolUrl(paper), label: "Cool", brand: "cool" })}
        ${renderLaterRemoveButton(paper)}
        ${renderQueueLikeAction(paper.like_id, workflowStatus, workflowStatusLabel)}
      </div>
    </article>
  `;
}

function renderLaterPaperRow(paper) {
  const workflowStatus = getWorkflowStatusValue(paper.workflow_status);
  const workflowStatusLabel = getWorkflowStatusLabel(workflowStatus);
  const view = buildQueuePaperViewModel(paper);
  return `
    <article class="later-paper-row">
      <div class="later-paper-row-main">
        <div class="spotlight-meta later-paper-row-meta">
          <span>${escapeHtml(displayTopicLabel(paper.topic_label || "Other AI"))}</span>
          <span>${escapeHtml(getSourceLabel(paper.source_kind))}</span>
        </div>
        <h3 class="later-paper-row-title">${escapeHtml(paper.title || "Untitled")}</h3>
        ${view.customTagSummary}
        <p class="later-paper-row-authors">${escapeHtml(paper.authors?.join(", ") || "Unknown")}</p>
      </div>
      <div class="paper-links later-paper-row-actions">
        ${renderExternalPaperLink({ href: getArxivUrl(paper), label: "arXiv", brand: "arxiv" })}
        ${renderExternalPaperLink({ href: getCoolUrl(paper), label: "Cool", brand: "cool" })}
        ${renderLaterRemoveButton(paper)}
        ${renderQueueLikeAction(paper.like_id, workflowStatus, workflowStatusLabel)}
      </div>
      <div class="later-paper-row-workspace">
        ${renderWorkspacePanel(view, { showSummaryTags: true })}
      </div>
    </article>
  `;
}

function renderLaterRemoveButton(paper) {
  return `
    <button class="paper-link later-button is-later" type="button" data-remove-id="${escapeAttribute(paper.like_id)}" aria-pressed="true">
      <span class="paper-link-icon later-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
        </svg>
      </span>
      <span class="paper-link-text">Later</span>
    </button>
  `;
}

function renderQueueLikeAction(likeId, workflowStatus, workflowStatusLabel) {
  return `
    <div class="queue-like-action">
      <button
        class="paper-link like-button queue-like-button"
        type="button"
        data-like-id="${escapeAttribute(likeId)}"
        aria-pressed="false"
        title="Move to Liked as ${escapeAttribute(workflowStatusLabel)}"
        aria-label="Move to Liked as ${escapeAttribute(workflowStatusLabel)}"
      >
        <span class="paper-link-icon like-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20">
            <path d="M10 16.3l-5.26-4.98A3.8 3.8 0 0 1 10 5.9a3.8 3.8 0 0 1 5.26 5.42z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
          </svg>
        </span>
        <span class="paper-link-text">Like</span>
      </button>
    </div>
  `;
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

function getWorkspaceStatusTone(value) {
  switch (getWorkflowStatusValue(value)) {
    case "reading":
      return "status-reading";
    case "digesting":
      return "status-digesting";
    case "synthesized":
      return "status-synthesized";
    case "archived":
      return "status-archived";
    default:
      return "status-inbox";
  }
}

function getWorkspacePriorityTone(value) {
  switch (getPriorityValue(value)) {
    case "high":
      return "priority-high";
    case "low":
      return "priority-low";
    default:
      return "priority-medium";
  }
}

function renderWorkspaceSummaryTag(label, toneClass) {
  return `
    <span class="paper-workspace-summary-tag ${escapeAttribute(toneClass)}">
      <span class="paper-workspace-summary-dot" aria-hidden="true"></span>
      <span>${escapeHtml(label)}</span>
    </span>
  `;
}

function renderWorkspaceSummaryTags(view) {
  return [
    renderWorkspaceSummaryTag(view.statusLabel, view.statusTone),
    renderWorkspaceSummaryTag(view.priorityLabel, view.priorityTone),
  ].join("");
}

function renderCustomTagSummary(tags) {
  if (!tags.length) {
    return "";
  }

  return `
    <div class="paper-custom-tag-summary" aria-label="Custom tags">
      <span class="paper-custom-tag-label">Tags</span>
      <div class="paper-custom-tag-summary-list" data-tag-summary-list>
        ${tags
          .map(
            (tag) => `
              <span class="custom-tag-chip custom-tag-chip-summary" data-tag-summary-chip style="${escapeAttribute(getCustomTagStyle(tag.color))}">
                <span>${escapeHtml(tag.label)}</span>
              </span>
            `
          )
          .join("")}
        <span class="paper-custom-tag-overflow" data-tag-summary-overflow hidden></span>
      </div>
    </div>
  `;
}

function layoutCustomTagSummaries() {
  document.querySelectorAll(".paper-custom-tag-summary").forEach((summary) => {
    const list = summary.querySelector("[data-tag-summary-list]");
    const overflow = summary.querySelector("[data-tag-summary-overflow]");
    const chips = [...summary.querySelectorAll("[data-tag-summary-chip]")];
    if (!list || !overflow || !chips.length) {
      return;
    }

    chips.forEach((chip) => {
      chip.hidden = false;
    });
    overflow.hidden = true;
    overflow.textContent = "";

    if (list.scrollWidth <= list.clientWidth) {
      return;
    }

    for (let visibleCount = chips.length - 1; visibleCount >= 0; visibleCount -= 1) {
      const hiddenCount = chips.length - visibleCount;
      overflow.hidden = hiddenCount <= 0;
      overflow.textContent = hiddenCount > 0 ? `+${hiddenCount}` : "";
      chips.forEach((chip, index) => {
        chip.hidden = index >= visibleCount;
      });
      if (list.scrollWidth <= list.clientWidth) {
        return;
      }
    }
  });
}

function scheduleCustomTagSummaryLayout() {
  if (customTagSummaryFrame || typeof window === "undefined") {
    return;
  }
  customTagSummaryFrame = window.requestAnimationFrame(() => {
    customTagSummaryFrame = 0;
    layoutCustomTagSummaries();
  });
}

function buildQueuePaperViewModel(paper) {
  const customTags = getPaperCustomTags(paper);
  const tagCatalog = getWorkspaceTagCatalog();
  const availableTags = tagCatalog.filter((tag) => !customTags.some((item) => item.key === tag.key));

  const tagChips = customTags.length
    ? customTags
        .map(
          (tag) => `
            <button
              class="custom-tag-chip is-interactive"
              type="button"
              data-tag-remove="${escapeAttribute(paper.like_id)}"
              data-tag-key="${escapeAttribute(tag.key)}"
              style="${escapeAttribute(getCustomTagStyle(tag.color))}"
              title="Remove ${escapeAttribute(tag.label)}"
            >
              <span>${escapeHtml(tag.label)}</span>
              <span class="custom-tag-chip-remove" aria-hidden="true">×</span>
            </button>
          `
        )
        .join("")
    : `<span class="custom-tag-empty">No custom tags yet.</span>`;

  const tagOptions = availableTags
    .map(
      (tag) => `
        <button
          class="custom-tag-option"
          type="button"
          data-tag-option="${escapeAttribute(paper.like_id)}"
          data-tag-key="${escapeAttribute(tag.key)}"
          data-tag-label="${escapeAttribute(tag.label)}"
        >
          <span class="custom-tag-swatch" style="${escapeAttribute(getCustomTagStyle(tag.color))}"></span>
          <span>${escapeHtml(tag.label)}</span>
        </button>
      `
    )
    .join("");

  const manageItems = tagCatalog.length
    ? tagCatalog
        .map((tag) => {
          const applied = customTags.some((item) => item.key === tag.key);
          return `
            <div
              class="custom-tag-library-item"
              draggable="true"
              data-tag-library-item="${escapeAttribute(paper.like_id)}"
              data-tag-key="${escapeAttribute(tag.key)}"
            >
              <button
                class="custom-tag-drag"
                type="button"
                data-tag-drag-handle="${escapeAttribute(paper.like_id)}"
                data-tag-key="${escapeAttribute(tag.key)}"
                aria-label="Drag to reorder ${escapeAttribute(tag.label)}"
                title="Drag to reorder"
              >
                ≡
              </button>
              <button
                class="custom-tag-chip custom-tag-library-chip${applied ? " is-applied" : ""}"
                type="button"
                data-tag-option="${escapeAttribute(paper.like_id)}"
                data-tag-key="${escapeAttribute(tag.key)}"
                style="${escapeAttribute(getCustomTagStyle(tag.color))}"
                ${applied ? 'disabled aria-disabled="true"' : ""}
              >
                <span>${escapeHtml(tag.label)}</span>
              </button>
              <button
                class="custom-tag-manage"
                type="button"
                data-tag-edit-start="${escapeAttribute(paper.like_id)}"
                data-tag-key="${escapeAttribute(tag.key)}"
              >
                Edit
              </button>
            </div>
          `;
        })
        .join("")
    : `<span class="custom-tag-empty">No reusable tags yet.</span>`;

  const paletteButtons = CUSTOM_TAG_PALETTE.map(
    (color) => `
      <button
        class="custom-tag-color-option"
        type="button"
        data-tag-color-option="${escapeAttribute(paper.like_id)}"
        data-tag-color="${escapeAttribute(color)}"
        style="${escapeAttribute(getCustomTagStyle(color))}"
        aria-label="Use color ${escapeAttribute(color)}"
      >
        <span class="custom-tag-swatch" aria-hidden="true"></span>
      </button>
    `
  ).join("");

  const statusValue = getWorkflowStatusValue(paper.workflow_status);
  const priorityValue = getPriorityValue(paper.priority_level);
  const statusTone = getWorkspaceStatusTone(statusValue);
  const priorityTone = getWorkspacePriorityTone(priorityValue);
  const statusButtons = WORKFLOW_STATUS_OPTIONS.map(
    (item) => `
      <button
        class="paper-workspace-segment ${escapeAttribute(getWorkspaceStatusTone(item.value))}${statusValue === item.value ? " is-selected" : ""}"
        type="button"
        data-workspace-status-option="${escapeAttribute(paper.like_id)}"
        data-workspace-value="${escapeAttribute(item.value)}"
      >
        <span class="paper-workspace-segment-dot" aria-hidden="true"></span>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `
  ).join("");
  const priorityButtons = PRIORITY_OPTIONS.map(
    (item) => `
      <button
        class="paper-workspace-segment ${escapeAttribute(getWorkspacePriorityTone(item.value))}${priorityValue === item.value ? " is-selected" : ""}"
        type="button"
        data-workspace-priority-option="${escapeAttribute(paper.like_id)}"
        data-workspace-value="${escapeAttribute(item.value)}"
      >
        <span class="paper-workspace-segment-dot" aria-hidden="true"></span>
        <span>${escapeHtml(item.label)}</span>
      </button>
    `
  ).join("");

  return {
    paper,
    tagCatalog,
    tagChips,
    tagOptions,
    manageItems,
    paletteButtons,
    customTagSummary: renderCustomTagSummary(customTags),
    customTagCount: customTags.length,
    availableTagCount: availableTags.length,
    tagPaletteCount: tagCatalog.length,
    statusValue,
    priorityValue,
    statusLabel: getWorkflowStatusLabel(statusValue),
    priorityLabel: getPriorityLabel(priorityValue),
    statusTone,
    priorityTone,
    statusButtons,
    priorityButtons,
    takeaway: paper.one_line_takeaway || "",
    nextAction: paper.next_action || "",
  };
}

function renderWorkspaceTagSection(view) {
  const composerOpen = tagWorkbenchState.openLikeId === view.paper.like_id;
  const manageOpen =
    tagWorkbenchState.manageLikeId === view.paper.like_id || tagWorkbenchState.editorLikeId === view.paper.like_id;
  const activeEditorTag =
    tagWorkbenchState.editorLikeId === view.paper.like_id
      ? view.tagCatalog.find((tag) => tag.key === tagWorkbenchState.editorTagKey) || null
      : null;
  const activeEditorColor = activeEditorTag?.color || assignTagColor(activeEditorTag?.key || "", new Map());

  return `
    <div class="paper-workspace-field paper-workspace-choice paper-workspace-choice-tags">
      <span class="paper-detail-label custom-tag-property-label">Custom Tags</span>
      <div class="custom-tag-picker">
        <div class="custom-tag-list">
          ${view.tagChips}
          <button
            class="custom-tag-trigger"
            type="button"
            data-tag-toggle="${escapeAttribute(view.paper.like_id)}"
            aria-label="Add tag"
            aria-expanded="${composerOpen}"
          >
            <span aria-hidden="true">+</span>
          </button>
        </div>
        <div class="custom-tag-composer custom-tag-panel" data-tag-popover="${escapeAttribute(view.paper.like_id)}"${composerOpen ? "" : " hidden"}>
          <div class="custom-tag-composer-field custom-tag-creator-row">
            <input
              class="custom-tag-input"
              type="text"
              data-tag-input="${escapeAttribute(view.paper.like_id)}"
              placeholder="Search or create a tag"
              autocomplete="off"
              spellcheck="false"
            />
            <button class="custom-tag-create" type="button" data-tag-create="${escapeAttribute(view.paper.like_id)}">Create</button>
          </div>
          ${view.customTagCount ? `
          <div class="custom-tag-composer-section custom-tag-surface">
            <div class="custom-tag-section-heading">
              <span class="custom-tag-section-label">Selected tags</span>
              <span class="custom-tag-section-meta">Click a tag to remove it</span>
            </div>
            <div class="custom-tag-current-list">
              ${view.tagChips}
            </div>
          </div>
          ` : ""}
          <div class="custom-tag-composer-section custom-tag-surface">
            <div class="custom-tag-section-heading">
              <div class="custom-tag-panel-copy">
                <span class="custom-tag-section-label">Reuse tags</span>
                <span
                  class="custom-tag-section-meta"
                  data-tag-options-meta="${escapeAttribute(view.paper.like_id)}"
                  data-tag-options-total="${escapeAttribute(String(view.availableTagCount))}"
                >
                  ${view.availableTagCount} available for this paper
                </span>
              </div>
              ${
                view.tagPaletteCount
                  ? `
                    <button
                      class="custom-tag-manage ghost custom-tag-manage-toggle"
                      type="button"
                      data-tag-manage-toggle="${escapeAttribute(view.paper.like_id)}"
                      data-tag-manage-open-label="Hide palette"
                      data-tag-manage-closed-label="${escapeAttribute(`Manage palette (${view.tagPaletteCount})`)}"
                      aria-expanded="${manageOpen}"
                    >
                      ${manageOpen ? "Hide palette" : `Manage palette (${view.tagPaletteCount})`}
                    </button>
                  `
                  : ""
              }
            </div>
            <div class="custom-tag-options" data-tag-options-root="${escapeAttribute(view.paper.like_id)}">
              ${view.tagOptions || ""}
              <span class="custom-tag-empty" data-tag-options-empty="${escapeAttribute(view.paper.like_id)}"${view.availableTagCount ? " hidden" : ""}>
                ${view.availableTagCount ? "No matching tags." : "No reusable tags yet."}
              </span>
            </div>
          </div>
          <div class="custom-tag-advanced" data-tag-advanced="${escapeAttribute(view.paper.like_id)}"${manageOpen ? "" : " hidden"}>
            <div class="custom-tag-composer-section custom-tag-surface">
              <div class="custom-tag-section-heading">
                <span class="custom-tag-section-label">Tag palette</span>
                <span class="custom-tag-section-meta">Rename, recolor, merge, or drag to reorder</span>
              </div>
              <div class="custom-tag-library">
                ${view.manageItems}
              </div>
            </div>
            <div
              class="custom-tag-editor"
              data-tag-editor="${escapeAttribute(view.paper.like_id)}"
              data-tag-edit-key="${escapeAttribute(activeEditorTag?.key || "")}"
              data-tag-edit-color="${escapeAttribute(activeEditorColor)}"
              ${activeEditorTag ? "" : " hidden"}
            >
              <input type="hidden" data-tag-edit-key-field="${escapeAttribute(view.paper.like_id)}" value="${escapeAttribute(activeEditorTag?.key || "")}" />
              <label class="custom-tag-editor-label">
                <span class="custom-tag-section-label">Tag name</span>
                <input
                  class="custom-tag-input"
                  type="text"
                  data-tag-edit-label="${escapeAttribute(view.paper.like_id)}"
                  value="${escapeAttribute(activeEditorTag?.label || "")}"
                  placeholder="Rename tag"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <div class="custom-tag-composer-section">
                <span class="custom-tag-section-label">Color</span>
                <div class="custom-tag-color-grid">
                  ${view.paletteButtons}
                </div>
              </div>
              <div class="custom-tag-composer-section">
                <div class="custom-tag-section-heading">
                  <span class="custom-tag-section-label">Merge</span>
                  <span class="custom-tag-section-meta">Move papers from this tag into another tag</span>
                </div>
                <div class="custom-tag-editor-actions">
                  <select class="control-input custom-tag-merge-select" data-tag-merge-target="${escapeAttribute(view.paper.like_id)}">
                    <option value="">Select target tag</option>
                  </select>
                  <button class="custom-tag-manage warn" type="button" data-tag-merge-apply="${escapeAttribute(view.paper.like_id)}">Merge</button>
                </div>
              </div>
              <div class="custom-tag-editor-actions">
                <button class="custom-tag-create" type="button" data-tag-edit-save="${escapeAttribute(view.paper.like_id)}">Save</button>
                <button class="custom-tag-manage ghost" type="button" data-tag-edit-cancel="${escapeAttribute(view.paper.like_id)}">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWorkspacePanel(view, options = {}) {
  const { showSummaryTags = true } = options;
  const panelOpen = isWorkspacePanelOpen(view.paper.like_id);
  return `
    <details class="paper-workspace-panel" data-workspace-panel="${escapeAttribute(view.paper.like_id)}"${panelOpen ? " open" : ""}>
      <summary class="paper-workspace-header">
        <div class="paper-workspace-header-copy">
          <span class="paper-detail-label">Workspace</span>
        </div>
        <div class="paper-workspace-header-right">
          ${showSummaryTags ? `<div class="paper-workspace-summary">${renderWorkspaceSummaryTags(view)}</div>` : ""}
          <span class="paper-workspace-chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16">
              <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </span>
        </div>
      </summary>
      <div class="paper-workspace-body">
        <div class="paper-workspace-controls">
          <div class="paper-workspace-field paper-workspace-choice">
            <span class="paper-detail-label">Status</span>
            <input type="hidden" data-workspace-status="${escapeAttribute(view.paper.like_id)}" value="${escapeAttribute(view.statusValue)}" />
            <div class="paper-workspace-segmented" role="tablist" aria-label="Status">
              ${view.statusButtons}
            </div>
          </div>
          <div class="paper-workspace-field paper-workspace-choice">
            <span class="paper-detail-label">Priority</span>
            <input type="hidden" data-workspace-priority="${escapeAttribute(view.paper.like_id)}" value="${escapeAttribute(view.priorityValue)}" />
            <div class="paper-workspace-segmented" role="tablist" aria-label="Priority">
              ${view.priorityButtons}
            </div>
          </div>
          ${renderWorkspaceTagSection(view)}
        </div>
        <div class="paper-workspace-grid">
          ${renderWorkspaceMarkdownField({
            likeId: view.paper.like_id,
            field: "takeaway",
            label: "Takeaway",
            value: view.takeaway,
            placeholder: "Capture the one-line reason this paper matters.",
          })}
          ${renderWorkspaceMarkdownField({
            likeId: view.paper.like_id,
            field: "next-action",
            label: "Next Action",
            value: view.nextAction,
            placeholder: "Leave a concrete follow-up step for yourself.",
          })}
        </div>
      </div>
    </details>
  `;
}

function renderWorkspaceMarkdownField({ likeId, field, label, value, placeholder }) {
  const normalizedValue = String(value || "");
  const previewContent = renderWorkspaceMarkdownPreviewContent(normalizedValue, { emptyText: placeholder });
  const fieldAttribute =
    field === "takeaway"
      ? `data-workspace-takeaway="${escapeAttribute(likeId)}"`
      : `data-workspace-next-action="${escapeAttribute(likeId)}"`;

  return `
    <div
      class="paper-workspace-card paper-workspace-field paper-workspace-markdown-field${normalizedValue.trim() ? "" : " is-empty"}"
      data-workspace-markdown-field="${escapeAttribute(likeId)}"
      data-workspace-markdown-kind="${escapeAttribute(field)}"
    >
      <span class="paper-detail-label">${escapeHtml(label)}</span>
      <div
        class="paper-workspace-markdown-display workspace-markdown-render"
        data-workspace-preview-id="${escapeAttribute(likeId)}"
        data-workspace-preview-field="${escapeAttribute(field)}"
        data-workspace-editor-toggle
        role="button"
        tabindex="0"
        aria-label="Edit ${escapeAttribute(label)}"
      >
        ${previewContent}
      </div>
      <textarea
        class="paper-workspace-textarea paper-workspace-markdown-editor"
        rows="2"
        ${fieldAttribute}
        placeholder="${escapeAttribute(placeholder)}"
      >${escapeHtml(normalizedValue)}</textarea>
    </div>
  `;
}

function normalizeTagSearchQuery(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function getVisibleTagOptionButtons(likeId) {
  const key = String(likeId || "").trim();
  if (!key) {
    return [];
  }
  const optionsRoot = document.querySelector(`[data-tag-options-root="${CSS.escape(key)}"]`);
  if (!optionsRoot) {
    return [];
  }
  return [...optionsRoot.querySelectorAll("[data-tag-option]")].filter((button) => !button.hidden && !button.disabled);
}

function clearActiveTagOption(likeId) {
  const key = String(likeId || "").trim();
  if (!key) {
    return;
  }
  document
    .querySelectorAll(`[data-tag-options-root="${CSS.escape(key)}"] [data-tag-option].is-active`)
    .forEach((button) => button.classList.remove("is-active"));
  const input = document.querySelector(`[data-tag-input="${CSS.escape(key)}"]`);
  input?.removeAttribute("aria-activedescendant");
}

function setActiveTagOption(likeId, nextButton) {
  const key = String(likeId || "").trim();
  if (!key) {
    return null;
  }

  const buttons = getVisibleTagOptionButtons(key);
  if (!buttons.length) {
    clearActiveTagOption(key);
    return null;
  }

  const target = nextButton && buttons.includes(nextButton) ? nextButton : buttons[0];
  const input = document.querySelector(`[data-tag-input="${CSS.escape(key)}"]`);
  const activeId = target.id || `tag-option-${key}-${target.dataset.tagKey || buttons.indexOf(target)}`;
  target.id = activeId;

  buttons.forEach((button) => {
    button.classList.toggle("is-active", button === target);
  });
  input?.setAttribute("aria-activedescendant", activeId);
  target.scrollIntoView({ block: "nearest" });
  return target;
}

function syncActiveTagOption(likeId, { preserveCurrent = true } = {}) {
  const buttons = getVisibleTagOptionButtons(likeId);
  if (!buttons.length) {
    clearActiveTagOption(likeId);
    return null;
  }
  const current = buttons.find((button) => button.classList.contains("is-active"));
  if (preserveCurrent && current) {
    return current;
  }
  return setActiveTagOption(likeId, buttons[0]);
}

function moveActiveTagOption(likeId, direction) {
  const buttons = getVisibleTagOptionButtons(likeId);
  if (!buttons.length) {
    clearActiveTagOption(likeId);
    return null;
  }

  const currentIndex = buttons.findIndex((button) => button.classList.contains("is-active"));
  const nextIndex =
    currentIndex < 0
      ? direction < 0
        ? buttons.length - 1
        : 0
      : (currentIndex + direction + buttons.length) % buttons.length;

  return setActiveTagOption(likeId, buttons[nextIndex]);
}

function updateTagOptionFiltering(likeId, query = "") {
  const key = String(likeId || "").trim();
  if (!key) {
    return;
  }

  const optionsRoot = document.querySelector(`[data-tag-options-root="${CSS.escape(key)}"]`);
  if (!optionsRoot) {
    return;
  }

  const meta = document.querySelector(`[data-tag-options-meta="${CSS.escape(key)}"]`);
  const empty = optionsRoot.querySelector(`[data-tag-options-empty="${CSS.escape(key)}"]`);
  const optionButtons = [...optionsRoot.querySelectorAll("[data-tag-option]")];
  const normalizedQuery = normalizeTagSearchQuery(query);
  let visibleCount = 0;

  optionButtons.forEach((button) => {
    const label = normalizeTagSearchQuery(button.dataset.tagLabel || button.textContent);
    const matched = !normalizedQuery || label.includes(normalizedQuery);
    button.hidden = !matched;
    if (matched) {
      visibleCount += 1;
    }
  });

  if (empty) {
    if (!optionButtons.length) {
      empty.hidden = false;
      empty.textContent = "No reusable tags yet.";
    } else if (!visibleCount) {
      empty.hidden = false;
      empty.textContent = normalizedQuery ? "No matching tags. Use Create to add it." : "No reusable tags yet.";
    } else {
      empty.hidden = true;
      empty.textContent = "No matching tags.";
    }
  }

  if (meta) {
    const total = Number(meta.dataset.tagOptionsTotal || optionButtons.length);
    if (!optionButtons.length) {
      meta.textContent = "No reusable tags yet";
    } else if (!normalizedQuery) {
      meta.textContent = `${total} available for this paper`;
    } else {
      meta.textContent = visibleCount === 1 ? "1 matching tag" : `${visibleCount} matching tags`;
    }
  }

  syncActiveTagOption(key, { preserveCurrent: true });
}

function bindTagComposer() {
  document.querySelectorAll("[data-tag-toggle]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const likeId = button.dataset.tagToggle;
      const popover = document.querySelector(`[data-tag-popover="${CSS.escape(likeId)}"]`);
      if (!likeId || !popover) {
        return;
      }
      hideAllWorkspacePickers();
      const shouldClose = tagWorkbenchState.openLikeId === likeId && !popover.hidden;
      if (shouldClose) {
        hideAllTagPopovers();
        return;
      }
      hideAllTagPopovers();
      tagWorkbenchState.openLikeId = likeId;
      popover.hidden = false;
      button.setAttribute("aria-expanded", "true");
      const input = popover.querySelector("[data-tag-input]");
      updateTagOptionFiltering(likeId, input?.value || "");
      input?.focus();
    });
  });

  document.querySelectorAll("[data-tag-manage-toggle]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagManageToggle;
      const advanced = document.querySelector(`[data-tag-advanced="${CSS.escape(likeId)}"]`);
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
      if (!likeId || !advanced) {
        return;
      }
      const shouldClose = tagWorkbenchState.manageLikeId === likeId && !advanced.hidden;
      if (shouldClose) {
        tagWorkbenchState.manageLikeId = "";
        if (tagWorkbenchState.editorLikeId === likeId) {
          tagWorkbenchState.editorLikeId = "";
          tagWorkbenchState.editorTagKey = "";
        }
        advanced.hidden = true;
        if (editor) {
          editor.hidden = true;
        }
        button.setAttribute("aria-expanded", "false");
        button.textContent = button.dataset.tagManageClosedLabel || "Manage palette";
        return;
      }
      tagWorkbenchState.openLikeId = likeId;
      tagWorkbenchState.manageLikeId = likeId;
      advanced.hidden = false;
      button.setAttribute("aria-expanded", "true");
      button.textContent = button.dataset.tagManageOpenLabel || "Hide palette";
    });
  });

  document.querySelectorAll("[data-tag-option]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagOption;
      const tagKey = button.dataset.tagKey;
      const tag = getWorkspaceTagCatalog().find((item) => item.key === tagKey);
      if (!likeId || !tag) {
        return;
      }
      setActiveTagOption(likeId, button);
      applyTagToPaper(likeId, tag);
    });
  });

  document.querySelectorAll("[data-tag-create]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagCreate;
      const input = document.querySelector(`[data-tag-input="${CSS.escape(likeId)}"]`);
      const tag = buildCustomTag(String(input?.value || ""), getTagCatalogRecords());
      if (!likeId || !tag) {
        return;
      }
      applyTagToPaper(likeId, tag);
    });
  });

  document.querySelectorAll("[data-tag-input]").forEach((input) => {
    if (input.dataset.bound === "true") {
      return;
    }
    input.dataset.bound = "true";
    input.addEventListener("input", () => {
      updateTagOptionFiltering(input.dataset.tagInput, input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        hideAllTagPopovers();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActiveTagOption(input.dataset.tagInput, 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActiveTagOption(input.dataset.tagInput, -1);
        return;
      }
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const likeId = input.dataset.tagInput;
      const activeOption = getVisibleTagOptionButtons(likeId).find((button) => button.classList.contains("is-active"));
      if (activeOption) {
        activeOption.click();
        return;
      }
      const tag = buildCustomTag(String(input.value || ""), getTagCatalogRecords());
      if (!likeId || !tag) {
        return;
      }
      applyTagToPaper(likeId, tag);
    });
  });

  document.querySelectorAll("[data-tag-remove]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagRemove;
      const tagKey = button.dataset.tagKey;
      if (!likeId || !tagKey) {
        return;
      }
      removeTagFromPaper(likeId, tagKey);
    });
  });

  document.querySelectorAll("[data-tag-edit-start]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagEditStart;
      const tagKey = button.dataset.tagKey;
      const tag = getWorkspaceTagCatalog().find((item) => item.key === tagKey);
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
      const keyField = document.querySelector(`[data-tag-edit-key-field="${CSS.escape(likeId)}"]`);
      const labelInput = document.querySelector(`[data-tag-edit-label="${CSS.escape(likeId)}"]`);
      if (!likeId || !tag || !editor || !keyField || !labelInput) {
        return;
      }
      tagWorkbenchState.openLikeId = likeId;
      tagWorkbenchState.manageLikeId = likeId;
      tagWorkbenchState.editorLikeId = likeId;
      tagWorkbenchState.editorTagKey = tag.key;
      keyField.value = tag.key;
      labelInput.value = tag.label;
      editor.hidden = false;
      syncTagEditorPalette(editor, tag.key, tag.color || assignTagColor(tag.key, new Map()));
      labelInput.focus();
      labelInput.select();
    });
  });

  document.querySelectorAll("[data-tag-color-option]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagColorOption;
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
      const color = button.dataset.tagColor || "";
      if (!editor || !color || button.disabled) {
        return;
      }
      const tagKey = editor.dataset.tagEditKey || "";
      syncTagEditorPalette(editor, tagKey, color);
    });
  });

  document.querySelectorAll("[data-tag-edit-save]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagEditSave;
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
      const keyField = document.querySelector(`[data-tag-edit-key-field="${CSS.escape(likeId)}"]`);
      const labelInput = document.querySelector(`[data-tag-edit-label="${CSS.escape(likeId)}"]`);
      if (!editor || !keyField || !labelInput) {
        return;
      }
      const tagKey = keyField.value;
      const label = String(labelInput.value || "").replace(/\s+/g, " ").trim();
      const color = editor.dataset.tagEditColor || "";
      if (!tagKey || !label || !color) {
        return;
      }
      updateCustomTagDefinition(tagKey, { label, color });
    });
  });

  document.querySelectorAll("[data-tag-edit-cancel]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagEditCancel;
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
      if (tagWorkbenchState.editorLikeId === likeId) {
        tagWorkbenchState.editorLikeId = "";
        tagWorkbenchState.editorTagKey = "";
      }
      if (editor) {
        editor.hidden = true;
      }
    });
  });

  document.querySelectorAll("[data-tag-merge-apply]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.tagMergeApply;
      const keyField = document.querySelector(`[data-tag-edit-key-field="${CSS.escape(likeId)}"]`);
      const mergeSelect = document.querySelector(`[data-tag-merge-target="${CSS.escape(likeId)}"]`);
      const sourceKey = keyField?.value || "";
      const targetKey = mergeSelect?.value || "";
      if (!sourceKey || !targetKey) {
        return;
      }
      if (tagWorkbenchState.editorLikeId === likeId) {
        tagWorkbenchState.editorLikeId = "";
        tagWorkbenchState.editorTagKey = "";
      }
      mergeCustomTags(sourceKey, targetKey);
    });
  });

  document.querySelectorAll("[data-tag-library-item]").forEach((item) => {
    if (item.dataset.bound === "true") {
      return;
    }
    item.dataset.bound = "true";
    item.addEventListener("dragstart", (event) => {
      item.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", item.dataset.tagKey || "");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
      }
    });
    item.addEventListener("dragend", () => {
      item.classList.remove("is-dragging");
      document.querySelectorAll(".custom-tag-library-item.is-drop-target").forEach((node) => node.classList.remove("is-drop-target"));
    });
    item.addEventListener("dragover", (event) => {
      event.preventDefault();
      item.classList.add("is-drop-target");
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
      }
    });
    item.addEventListener("dragleave", () => {
      item.classList.remove("is-drop-target");
    });
    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("is-drop-target");
      const sourceKey = event.dataTransfer?.getData("text/plain") || "";
      const targetKey = item.dataset.tagKey || "";
      if (!sourceKey || !targetKey || sourceKey === targetKey) {
        return;
      }
      const targetItem = item;
      const parent = targetItem.parentElement;
      const sourceItem = parent?.querySelector(`[data-tag-library-item][data-tag-key="${CSS.escape(sourceKey)}"]`);
      if (!sourceItem || !targetItem || !parent || sourceItem.parentElement !== parent) {
        return;
      }
      parent.insertBefore(sourceItem, targetItem);
      const orderedKeys = [...parent.querySelectorAll("[data-tag-library-item]")].map((node) => node.dataset.tagKey).filter(Boolean);
      reorderCustomTags(orderedKeys);
    });
  });

  if (document.body.dataset.queueTagDismissBound !== "true") {
    document.body.dataset.queueTagDismissBound = "true";
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.closest(".custom-tag-picker")) {
          return;
        }
        hideAllWorkspacePickers();
        hideAllTagPopovers();
      },
      { capture: true }
    );
  }
}

function hideAllTagPopovers() {
  tagWorkbenchState.openLikeId = "";
  tagWorkbenchState.manageLikeId = "";
  tagWorkbenchState.editorLikeId = "";
  tagWorkbenchState.editorTagKey = "";

  document.querySelectorAll("[data-tag-toggle]").forEach((node) => {
    node.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll("[data-tag-popover]").forEach((node) => {
    node.hidden = true;
  });
  document.querySelectorAll("[data-tag-input]").forEach((input) => {
    input.value = "";
    updateTagOptionFiltering(input.dataset.tagInput, "");
  });
  document.querySelectorAll("[data-tag-advanced]").forEach((node) => {
    node.hidden = true;
  });
  document.querySelectorAll("[data-tag-editor]").forEach((node) => {
    node.hidden = true;
    delete node.dataset.tagEditKey;
    delete node.dataset.tagEditColor;
  });
}

function hideAllWorkspacePickers() {}

function restoreTagWorkbenchState() {
  const openLikeId = String(tagWorkbenchState.openLikeId || "").trim();
  if (!openLikeId) {
    return;
  }

  const popover = document.querySelector(`[data-tag-popover="${CSS.escape(openLikeId)}"]`);
  if (!popover) {
    hideAllTagPopovers();
    return;
  }
  popover.hidden = false;
  const toggle = document.querySelector(`[data-tag-toggle="${CSS.escape(openLikeId)}"]`);
  toggle?.setAttribute("aria-expanded", "true");
  const input = popover.querySelector("[data-tag-input]");
  updateTagOptionFiltering(openLikeId, input?.value || "");

  const manageLikeId = String(tagWorkbenchState.manageLikeId || "").trim();
  const editorLikeId = String(tagWorkbenchState.editorLikeId || "").trim();
  const advanced = document.querySelector(`[data-tag-advanced="${CSS.escape(openLikeId)}"]`);
  if (advanced) {
    advanced.hidden = !((manageLikeId && manageLikeId === openLikeId) || (editorLikeId && editorLikeId === openLikeId));
  }

  const editorTagKey = String(tagWorkbenchState.editorTagKey || "").trim();
  if (!editorLikeId || !editorTagKey || editorLikeId !== openLikeId) {
    return;
  }

  const editor = document.querySelector(`[data-tag-editor="${CSS.escape(editorLikeId)}"]`);
  const keyField = document.querySelector(`[data-tag-edit-key-field="${CSS.escape(editorLikeId)}"]`);
  const labelInput = document.querySelector(`[data-tag-edit-label="${CSS.escape(editorLikeId)}"]`);
  const tag = getWorkspaceTagCatalog().find((item) => item.key === editorTagKey);
  if (!editor || !keyField || !labelInput || !tag) {
    tagWorkbenchState.editorLikeId = "";
    tagWorkbenchState.editorTagKey = "";
    return;
  }

  keyField.value = tag.key;
  labelInput.value = tag.label;
  editor.hidden = false;
  syncTagEditorPalette(editor, tag.key, tag.color || assignTagColor(tag.key, new Map()));
}

function bindWorkspacePanels() {
  document.querySelectorAll("[data-workspace-panel]").forEach((details) => {
    if (details.dataset.bound === "true") {
      return;
    }
    details.dataset.bound = "true";
    details.addEventListener("toggle", () => {
      const likeId = details.dataset.workspacePanel;
      if (!likeId) {
        return;
      }
      workspacePanelOverrides.set(likeId, details.open);
    });
  });
}

function bindWorkspaceEditors() {
  document.querySelectorAll("[data-workspace-editor-toggle]").forEach((surface) => {
    if (surface.dataset.bound === "true") {
      return;
    }
    surface.dataset.bound = "true";
    surface.addEventListener("click", () => {
      activateWorkspaceMarkdownEditor(surface);
    });
    surface.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      activateWorkspaceMarkdownEditor(surface);
    });
  });

  document.querySelectorAll("[data-workspace-status-option], [data-workspace-priority-option]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const likeId = button.dataset.workspaceStatusOption || button.dataset.workspacePriorityOption;
      const nextValue = button.dataset.workspaceValue || "";
      if (!likeId) {
        return;
      }
      if (button.dataset.workspaceStatusOption) {
        const input = document.querySelector(`[data-workspace-status="${CSS.escape(likeId)}"]`);
        if (input) {
          input.value = nextValue;
        }
      }
      if (button.dataset.workspacePriorityOption) {
        const input = document.querySelector(`[data-workspace-priority="${CSS.escape(likeId)}"]`);
        if (input) {
          input.value = nextValue;
        }
      }
      saveWorkspaceFields(likeId, readWorkspaceFieldValues(likeId));
    });
  });

  document.querySelectorAll("[data-workspace-takeaway], [data-workspace-next-action]").forEach((field) => {
    if (field.dataset.bound === "true") {
      return;
    }
    field.dataset.bound = "true";
    field.addEventListener("input", () => {
      const likeId = field.dataset.workspaceTakeaway || field.dataset.workspaceNextAction;
      if (!likeId) {
        return;
      }
      const previewField = field.dataset.workspaceTakeaway ? "takeaway" : "next-action";
      updateWorkspaceMarkdownPreview(likeId, previewField, field.value);
    });
    field.addEventListener("blur", () => {
      const wrapper = field.closest("[data-workspace-markdown-field]");
      wrapper?.classList.remove("is-editing");
    });
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      field.blur();
    });
    field.addEventListener("change", () => {
      const likeId = field.dataset.workspaceTakeaway || field.dataset.workspaceNextAction;
      if (!likeId) {
        return;
      }
      saveWorkspaceFields(likeId, readWorkspaceFieldValues(likeId));
    });
  });
}

function readWorkspaceFieldValues(likeId) {
  return {
    workflow_status: document.querySelector(`[data-workspace-status="${CSS.escape(likeId)}"]`)?.value || "inbox",
    priority_level: document.querySelector(`[data-workspace-priority="${CSS.escape(likeId)}"]`)?.value || "medium",
    one_line_takeaway: document.querySelector(`[data-workspace-takeaway="${CSS.escape(likeId)}"]`)?.value || "",
    next_action: document.querySelector(`[data-workspace-next-action="${CSS.escape(likeId)}"]`)?.value || "",
  };
}

function updateWorkspaceMarkdownPreview(likeId, fieldName, value) {
  const preview = document.querySelector(
    `[data-workspace-preview-id="${CSS.escape(likeId)}"][data-workspace-preview-field="${CSS.escape(fieldName)}"]`
  );
  if (!preview) {
    return;
  }
  preview.innerHTML = renderWorkspaceMarkdownPreviewContent(value);
  preview.closest("[data-workspace-markdown-field]")?.classList.toggle("is-empty", !String(value || "").trim());
}

function activateWorkspaceMarkdownEditor(surface) {
  const wrapper = surface.closest("[data-workspace-markdown-field]");
  const textarea = wrapper?.querySelector(".paper-workspace-markdown-editor");
  if (!wrapper || !(textarea instanceof HTMLTextAreaElement)) {
    return;
  }
  wrapper.classList.add("is-editing");
  window.requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
}

function isWorkspacePanelOpen(likeId) {
  if (workspacePanelOverrides.has(likeId)) {
    return workspacePanelOverrides.get(likeId) === true;
  }
  return workspacePanelDefaultMode !== "collapsed";
}

function getTagCatalogRecords() {
  return [...likedPapers, ...laterPapers];
}

function getWorkspaceTagCatalog() {
  return collectCustomTagCatalog(getTagCatalogRecords());
}

function updateRecordsAcrossLibrary(updater) {
  updateQueuedPapers(updater);
  updateLikedPapers(updater);
}

function updateCustomTagDefinition(tagKey, nextDefinition) {
  const key = String(tagKey || "").trim();
  if (!key) {
    return null;
  }

  updateRecordsAcrossLibrary((record) => updateCustomTagDefinitionInRecord(record, key, nextDefinition));
  return true;
}

function reorderCustomTags(orderedKeys) {
  updateRecordsAcrossLibrary((record) => reorderCustomTagsInRecord(record, orderedKeys));
  return true;
}

function mergeCustomTags(sourceKey, targetKey) {
  const source = String(sourceKey || "").trim();
  const target = String(targetKey || "").trim();
  if (!source || !target || source === target) {
    return null;
  }

  const catalog = getWorkspaceTagCatalog();
  const targetTag = catalog.find((tag) => tag.key === target);
  if (!targetTag) {
    return null;
  }

  updateRecordsAcrossLibrary((record) => mergeCustomTagsInRecord(record, source, targetTag));
  return true;
}

function syncTagEditorPalette(editor, tagKey, selectedColor) {
  if (!editor) {
    return;
  }

  const currentCatalog = getWorkspaceTagCatalog();
  const selected = selectedColor || assignTagColor(tagKey, new Map(currentCatalog.map((tag) => [tag.key, tag])));
  editor.dataset.tagEditKey = tagKey || "";
  editor.dataset.tagEditColor = selected;

  editor.querySelectorAll("[data-tag-color-option]").forEach((button) => {
    const color = button.dataset.tagColor || "";
    const usedByOther = currentCatalog.some((tag) => tag.key !== tagKey && tag.color === color);
    button.disabled = usedByOther;
    button.classList.toggle("is-selected", color === selected);
    button.setAttribute("aria-pressed", String(color === selected));
    button.title = usedByOther ? "Color already used by another tag" : `Use ${color}`;
  });

  const mergeSelect = editor.querySelector("[data-tag-merge-target]");
  if (mergeSelect) {
    const mergeOptions = currentCatalog.filter((tag) => tag.key !== tagKey);
    mergeSelect.innerHTML = [
      `<option value="">Select target tag</option>`,
      ...mergeOptions.map((tag) => `<option value="${escapeAttribute(tag.key)}">${escapeHtml(tag.label)}</option>`),
    ].join("");
    mergeSelect.disabled = !mergeOptions.length;
  }
}

function applyTagToPaper(likeId, tag) {
  updateQueuedPaper(likeId, (record) => applyCustomTagToRecord(record, tag));
}

function removeTagFromPaper(likeId, tagKey) {
  updateQueuedPaper(likeId, (record) => removeCustomTagFromRecord(record, tagKey));
}

function saveWorkspaceFields(likeId, nextFields) {
  return updateQueuedPaper(likeId, (record) => {
    const workflowStatus = getWorkflowStatusValue(nextFields.workflow_status || record.workflow_status);
    const priorityLevel = getPriorityValue(nextFields.priority_level || record.priority_level);
    const takeaway = String(nextFields.one_line_takeaway || "").trim();
    const nextAction = String(nextFields.next_action || "").trim();

    if (
      workflowStatus === getWorkflowStatusValue(record.workflow_status) &&
      priorityLevel === getPriorityValue(record.priority_level) &&
      takeaway === String(record.one_line_takeaway || "").trim() &&
      nextAction === String(record.next_action || "").trim()
    ) {
      return null;
    }

    return {
      ...record,
      workflow_status: workflowStatus,
      priority_level: priorityLevel,
      one_line_takeaway: takeaway,
      next_action: nextAction,
    };
  });
}

function transferQueuePaperToLikes(paper) {
  hideAllTagPopovers();
  movePaperToLikes(paper);
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
