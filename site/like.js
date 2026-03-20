import {
  bindLikeButtons,
  getSourceLabel,
  initLikesSync,
  readLikes,
  subscribeAuth,
  subscribeLikes,
  updateLikedPaper,
  updateLikedPapers,
} from "./likes.js?v=d409e691d1";
import { getSupabaseClient, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js?v=606e1fd811";
import { initReviewSync, setPageReviewed, subscribePageReviews } from "./reading_state.js?v=f943be8314";
import { bindQueueButtons, initQueue, isInQueue, readQueue, subscribeQueue } from "./paper_queue.js?v=8b696292c3";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=1060920198";
import { mountAppToolbar } from "./app_toolbar.js?v=625fba0996";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=c2effc3556";
import { initToolbarPreferences, setPageViewMode } from "./toolbar_preferences.js?v=a0ed68b91d";
import { bindBackToTop, bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { escapeAttribute, escapeHtml, fetchJson, formatDateTime, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";
import {
  LIKE_TIME_FORMAT,
  PRIORITY_OPTIONS,
  WORKFLOW_STATUS_OPTIONS,
  displayTopicLabel,
  getLibraryGroupKey,
  getLibraryGroupLabel,
  getPriorityLabel,
  getPriorityValue,
  getWorkflowStatusLabel,
  getWorkflowStatusValue,
} from "./like_page_labels.js?v=aaa244a29d";
import { createSavedViewId, describeSavedView, getActiveFilters, normalizeFilterState, areFilterStatesEqual } from "./like_page_saved_views.js?v=eea77993c0";
import {
  CUSTOM_TAG_PALETTE,
  assignTagColor,
  buildCustomTag,
  collectCustomTagCatalog,
  compareCustomTagMeta,
  getCustomTagOrder,
  getCustomTagStyle,
  getPaperCustomTags,
} from "./like_page_tags.js?v=8ad782742a";
import { formatWeekLabel, getSnapshotSourceKind, getToReadSnapshots, loadSnapshotQueueData } from "./like_page_snapshots.js?v=30e01ecd4f";
import {
  initSavedViewsSync,
  readSavedViews as readSavedViewsStore,
  removeSavedView as removeSavedViewStore,
  subscribeSavedViews,
  upsertSavedView,
} from "./like_saved_views_store.js?v=fbaaa1606a";

mountAppToolbar("#like-toolbar-root", {
  prefix: "like",
  filtersTemplateId: "like-toolbar-filters",
  branchActiveKey: null,
  libraryActiveKey: "liked",
  quickAddTarget: "later",
});

const state = {
  likes: [],
  snapshots: [],
  source: "",
  topic: "",
  customTag: "",
  workflowStatus: "",
  priorityLevel: "",
  query: "",
  viewMode: "card",
  savedViews: [],
  selectedSavedViewId: "",
  savedViewDraftName: "",
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);

const sourceFilter = document.querySelector("#like-source-filter");
const topicFilter = document.querySelector("#like-topic-filter");
const customTagFilter = document.querySelector("#like-custom-tag-filter");
const statusFilter = document.querySelector("#like-status-filter");
const priorityFilter = document.querySelector("#like-priority-filter");
const searchInput = document.querySelector("#like-search-input");
const resetFiltersButton = document.querySelector("#like-reset-filters");
const savedViewNameInput = document.querySelector("#like-saved-view-name");
const saveViewButton = document.querySelector("#like-save-view");
const updateViewButton = document.querySelector("#like-update-view");
const deleteViewButton = document.querySelector("#like-delete-view");
const sidebarToggleButton = document.querySelector("#like-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#like-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#like-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#like-filters-menu");
const backToTopButton = document.querySelector("#like-back-to-top");
const likeRecords = new Map();
let toReadSyncPromise = null;
const openWorkspaceEditors = new Set();
const openListRowDetails = new Set();

const LATER_PAGE_SIZE = 6;
let laterPage = 0;
const TO_READ_PAGE_SIZE = 6;
let toReadPage = 0;
const BRANCH_PAGE_SIZE = 6;
const branchPages = new Map();

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  likeRecords.render = renderPage;
  state.savedViews = readSavedViewsStore();
  state.viewMode = initToolbarPreferences({
    pageKey: "like",
    fallbackViewKeys: ["cool-paper-like-view-mode-v1"],
    onViewModeChange: (mode) => {
      if (state.viewMode === mode) {
        return;
      }
      state.viewMode = mode;
      renderPage();
    },
  });
  bindFilterMenu({
    button: sidebarToggleButton,
    panel: filterMenuPanel,
    labelNode: sidebarToggleLabel,
    iconNode: sidebarToggleIcon,
  });
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("like", { target: "later" });
  bindBranchAuthToolbar("like");
  bindBackToTop(backToTopButton);
  bindFilters();
  bindSavedViews();
  subscribeAuth((snapshot) => {
    if (snapshot.configured && snapshot.signedIn) {
      scheduleToReadSnapshotSync();
    }
  });
  subscribeLikes((likes) => {
    state.likes = likes;
    renderPage();
  });
  subscribeSavedViews((savedViews) => {
    state.savedViews = savedViews;
    renderPage();
  });
  subscribeQueue(() => renderPage());
  subscribePageReviews(() => {
    renderPage();
    scheduleToReadSnapshotSync();
  });
  await Promise.all([initLikesSync(), initReviewSync(), initQueue(), initSavedViewsSync()]);
  repairLikeLaterConflicts();
  state.snapshots = await loadSnapshotQueueData(fetchJson);
  state.likes = readLikes();
  renderPage();
  scheduleToReadSnapshotSync();
}

function bindFilters() {
  sourceFilter.addEventListener("change", (event) => {
    state.source = event.target.value;
    renderPage();
  });

  topicFilter.addEventListener("change", (event) => {
    state.topic = event.target.value;
    renderPage();
  });

  customTagFilter.addEventListener("change", (event) => {
    state.customTag = event.target.value;
    renderPage();
  });

  statusFilter.addEventListener("change", (event) => {
    state.workflowStatus = event.target.value;
    renderPage();
  });

  priorityFilter.addEventListener("change", (event) => {
    state.priorityLevel = event.target.value;
    renderPage();
  });

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderPage();
  });

  resetFiltersButton.addEventListener("click", () => {
    state.source = "";
    state.topic = "";
    state.customTag = "";
    state.workflowStatus = "";
    state.priorityLevel = "";
    state.query = "";
    sourceFilter.value = "";
    topicFilter.value = "";
    customTagFilter.value = "";
    statusFilter.value = "";
    priorityFilter.value = "";
    searchInput.value = "";
    renderPage();
  });
}

function bindSavedViews() {
  savedViewNameInput?.addEventListener("input", (event) => {
    state.savedViewDraftName = String(event.target.value || "");
    updateSavedViewActionState();
  });

  saveViewButton?.addEventListener("click", () => {
    const name = String(savedViewNameInput?.value || "").trim();
    if (!name) {
      return;
    }
    const nextView = upsertSavedView({
      view_id: createSavedViewId(),
      name,
      filters: getCurrentFilterState(),
    });
    if (!nextView) {
      return;
    }
    state.selectedSavedViewId = nextView.view_id;
    state.savedViewDraftName = nextView.name;
    renderPage();
  });

  updateViewButton?.addEventListener("click", () => {
    const selectedView = getSelectedSavedView();
    if (!selectedView) {
      return;
    }
    const name = String(savedViewNameInput?.value || "").trim() || selectedView.name;
    upsertSavedView({
      ...selectedView,
      view_id: selectedView.view_id,
      name,
      filters: getCurrentFilterState(),
    });
    state.savedViewDraftName = name;
    renderPage();
  });

  deleteViewButton?.addEventListener("click", () => {
    const selectedView = getSelectedSavedView();
    if (!selectedView) {
      return;
    }
    removeSavedViewStore(selectedView.view_id);
    state.selectedSavedViewId = "";
    state.savedViewDraftName = "";
    renderPage();
  });
}

function renderPage() {
  try {
    const likes = readLikes();
    state.likes = likes;
    const laterQueue = readQueue("later");
    const toReadSnapshots = getToReadSnapshots(state.snapshots);
    populateFilters(likes, laterQueue, toReadSnapshots);
    renderHero(likes, laterQueue, toReadSnapshots);
    renderSourceCards(likes, laterQueue, toReadSnapshots);

    likeRecords.clear();
    renderLaterQueue(laterQueue);
    renderToReadList(toReadSnapshots);
    bindLikeButtons(document, likeRecords);

    if (!likes.length) {
      renderSavedViews();
      renderEmpty(toReadSnapshots);
      bindQueueButtons(document, likeRecords);
      return;
    }

    const visibleLikes = getVisibleLikes(likes);
    const topicDistribution = computeTopicDistribution(visibleLikes);
    const sourceSections = groupBySource(visibleLikes);

    renderOverview(likes, visibleLikes, sourceSections, toReadSnapshots);
    renderSavedViews();
    renderTagMap(likes, topicDistribution);
    renderDistribution(topicDistribution);
    renderResults(likes, visibleLikes, sourceSections);
    renderSourceSections(sourceSections);
    bindTagComposer();
    bindWorkspaceEditors();
    bindLikeButtons(document, likeRecords);
    bindQueueButtons(document, likeRecords);
  } catch (error) {
    console.error('renderPage failed:', error);
  }
}

function populateFilters(likes, laterQueue, toReadSnapshots) {
  const currentSource = state.source;
  const currentTopic = state.topic;
  const currentCustomTag = state.customTag;
  const currentWorkflowStatus = state.workflowStatus;
  const currentPriorityLevel = state.priorityLevel;
  const sources = [...new Set([
    ...likes.map((item) => getLibraryGroupKey(item.source_kind)),
    ...laterQueue.map((item) => getLibraryGroupKey(item.source_kind)),
    ...toReadSnapshots.map((snapshot) => getLibraryGroupKey(getSnapshotSourceKind(snapshot))),
  ].filter(Boolean))].sort((left, right) => {
    if (left === right) {
      return 0;
    }
    if (left === "trending") {
      return -1;
    }
    if (right === "trending") {
      return 1;
    }
    return getLibraryGroupLabel(left).localeCompare(getLibraryGroupLabel(right), "en");
  });
  const topics = [...new Set(likes.map((item) => item.topic_label || "Other AI"))].sort((a, b) =>
    displayTopicLabel(a).localeCompare(displayTopicLabel(b), "en")
  );
  const customTags = collectCustomTagCatalog(likes);

  sourceFilter.innerHTML = [
    `<option value="">All Groups</option>`,
    ...sources.map((source) => `<option value="${escapeAttribute(source)}">${escapeHtml(getLibraryGroupLabel(source))}</option>`),
  ].join("");
  topicFilter.innerHTML = [
    `<option value="">All Topics</option>`,
    ...topics.map((topic) => `<option value="${escapeAttribute(topic)}">${escapeHtml(displayTopicLabel(topic))}</option>`),
  ].join("");
  customTagFilter.innerHTML = [
    `<option value="">All Tags</option>`,
    ...customTags.map((tag) => `<option value="${escapeAttribute(tag.key)}">${escapeHtml(tag.label)}</option>`),
  ].join("");
  statusFilter.innerHTML = [
    `<option value="">All Statuses</option>`,
    ...WORKFLOW_STATUS_OPTIONS.map((item) => `<option value="${escapeAttribute(item.value)}">${escapeHtml(item.label)}</option>`),
  ].join("");
  priorityFilter.innerHTML = [
    `<option value="">All Priorities</option>`,
    ...PRIORITY_OPTIONS.map((item) => `<option value="${escapeAttribute(item.value)}">${escapeHtml(item.label)}</option>`),
  ].join("");

  sourceFilter.value = sources.includes(currentSource) ? currentSource : "";
  topicFilter.value = topics.includes(currentTopic) ? currentTopic : "";
  customTagFilter.value = customTags.some((tag) => tag.key === currentCustomTag) ? currentCustomTag : "";
  statusFilter.value = WORKFLOW_STATUS_OPTIONS.some((item) => item.value === currentWorkflowStatus) ? currentWorkflowStatus : "";
  priorityFilter.value = PRIORITY_OPTIONS.some((item) => item.value === currentPriorityLevel) ? currentPriorityLevel : "";
  state.source = sourceFilter.value;
  state.topic = topicFilter.value;
  state.customTag = customTagFilter.value;
  state.workflowStatus = statusFilter.value;
  state.priorityLevel = priorityFilter.value;
}

function renderHero(likes, laterQueue, toReadSnapshots) {
  const topTopic = computeTopicDistribution(likes)[0];
  const focusCount = likes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const groups = new Set([
    ...likes.map((item) => getLibraryGroupKey(item.source_kind)),
    ...laterQueue.map((item) => getLibraryGroupKey(item.source_kind)),
    ...toReadSnapshots.map((snapshot) => getLibraryGroupKey(getSnapshotSourceKind(snapshot))),
  ].filter(Boolean));
  const latest = likes[0];

  document.querySelector("#like-hero-count").textContent =
    likes.length || laterQueue.length || toReadSnapshots.length
      ? `${likes.length} liked / ${laterQueue.length} later`
      : "0 items";
  document.querySelector("#like-hero-sources").textContent = String(groups.size);
  document.querySelector("#like-hero-focus").textContent = String(laterQueue.length);
  document.querySelector("#like-hero-latest").textContent = String(toReadSnapshots.length);
  document.querySelector("#like-hero-topic").textContent = topTopic ? displayTopicLabel(topTopic.topic_label) : "-";

  document.querySelector("#like-hero-signals").innerHTML = [
    topTopic ? `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(displayTopicLabel(topTopic.topic_label))}</strong></div>` : "",
    likes.length ? `<div class="signal-chip"><span>Liked Papers</span><strong>${likes.length}</strong></div>` : "",
    laterQueue.length ? `<div class="signal-chip"><span>Later Queue</span><strong>${laterQueue.length}</strong></div>` : "",
    toReadSnapshots.length ? `<div class="signal-chip"><span>Unread Snapshots</span><strong>${toReadSnapshots.length}</strong></div>` : "",
    latest ? `<div class="signal-chip"><span>Latest Like</span><strong>${escapeHtml(getSourceLabel(latest.source_kind))}</strong></div>` : "",
  ]
    .filter(Boolean)
    .join("");
}

function renderSourceCards(likes, laterQueue, toReadSnapshots) {
  const root = document.querySelector("#like-home-cards");
  const summary = document.querySelector("#like-board-summary");
  const sections = buildLibrarySourceSections(likes, laterQueue, toReadSnapshots);

  if (!sections.length) {
    summary.textContent = "No library activity yet.";
    root.innerHTML = `<div class="empty-state">Groups will appear here after you like papers, add Later items, or accumulate unread snapshots.</div>`;
    return;
  }

  summary.textContent = `Tracking ${likes.length} liked papers, ${laterQueue.length} Later items, and ${toReadSnapshots.length} unread snapshots across ${sections.length} groups.`;
  root.innerHTML = sections
    .map(
      (section) => `
        <button class="home-category-card library-home-card${state.source === section.group_key ? " active" : ""}" type="button" data-like-source="${escapeAttribute(section.group_key)}">
          <div class="home-category-card-top">
            <span class="home-category-label">${escapeHtml(section.group_label)}</span>
            <span class="home-category-date">${escapeHtml(section.latest_snapshot || "Library group")}</span>
          </div>
          <div class="library-home-hero">
            <div class="library-home-count-block">
              <strong class="home-category-count">${section.liked_count}</strong>
              <span class="library-home-count-label">liked papers</span>
            </div>
            <div class="library-home-glance">
              <span>${section.later_count} later</span>
              <span>${section.to_read_count} unread</span>
            </div>
          </div>
          <p class="home-category-topic">${escapeHtml(section.lede)}</p>
          <div class="library-source-metrics">
            <span><strong>${section.liked_count}</strong><small>Liked</small></span>
            <span><strong>${section.later_count}</strong><small>Later</small></span>
            <span><strong>${section.to_read_count}</strong><small>Unread</small></span>
          </div>
          <div class="home-category-meta">
            <span>${escapeHtml(displayTopicLabel(section.top_topic || "No topic summary"))}</span>
            <span>${escapeHtml(section.latest_liked || section.latest_snapshot || "-")}</span>
          </div>
        </button>
      `
    )
    .join("");

  root.querySelectorAll("[data-like-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const next = button.dataset.likeSource;
      state.source = state.source === next ? "" : next;
      sourceFilter.value = state.source;
      renderPage();
    });
  });
}

function renderOverview(likes, visibleLikes, sourceSections, toReadSnapshots) {
  const focusCount = visibleLikes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const focusShare = visibleLikes.length ? (focusCount / visibleLikes.length) * 100 : 0;
  const latest = visibleLikes[0] || likes[0];
  const topSource = sourceSections[0];

  document.querySelector("#like-overview-title").textContent = "Liked Papers Overview";
  document.querySelector("#like-overview-summary").textContent = `Currently liked: ${visibleLikes.length} papers for later reading and revisit. ${toReadSnapshots.length} fetched snapshots are still not reviewed.`;
  document.querySelector("#like-focus-summary").textContent = `${focusCount} papers hit your focus topics, accounting for ${focusShare.toFixed(2)}% of the current view.`;
  document.querySelector("#like-branch-summary").textContent = topSource
    ? `${escapeHtml(topSource.group_label)} currently has the most liked papers, with ${topSource.liked_count} papers.`
    : "No visible groups yet.";
  document.querySelector("#like-latest-summary").textContent = latest
    ? `${formatDateTime(latest.liked_at || latest.saved_at, LIKE_TIME_FORMAT)} liked from ${escapeHtml(getSourceLabel(latest.source_kind))}.`
    : "No latest like record yet.";
}

function renderSavedViews() {
  const root = document.querySelector("#like-saved-view-list");
  const summary = document.querySelector("#like-saved-view-summary");
  if (!root || !summary || !savedViewNameInput) {
    return;
  }

  const currentFilters = getCurrentFilterState();
  const selectedView = getSelectedSavedView();
  const appliedView = state.savedViews.find((view) => areFilterStatesEqual(view.filters, currentFilters)) || null;

  summary.textContent = state.savedViews.length
    ? appliedView
      ? `Applied view: ${appliedView.name}`
      : `${state.savedViews.length} saved view${state.savedViews.length === 1 ? "" : "s"} available.`
    : "No saved views yet.";

  if (document.activeElement !== savedViewNameInput) {
    savedViewNameInput.value = state.savedViewDraftName || selectedView?.name || "";
  }

  root.innerHTML = state.savedViews.length
    ? state.savedViews
        .map((view) => {
          const isSelected = view.view_id === state.selectedSavedViewId;
          const isApplied = areFilterStatesEqual(view.filters, currentFilters);
          return `
            <button
              class="saved-view-chip${isSelected ? " is-selected" : ""}${isApplied ? " is-applied" : ""}"
              type="button"
              data-saved-view-id="${escapeAttribute(view.view_id)}"
            >
              <span class="saved-view-chip-name">${escapeHtml(view.name)}</span>
              <span class="saved-view-chip-meta">${escapeHtml(describeSavedView(view.filters, state.likes))}</span>
            </button>
          `;
        })
        .join("")
    : `<span class="saved-view-empty">Save a filter combination to reopen it in one click.</span>`;

  root.querySelectorAll("[data-saved-view-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const viewId = button.dataset.savedViewId;
      if (!viewId) {
        return;
      }
      applySavedView(viewId);
    });
  });

  updateSavedViewActionState();
}

function renderTagMap(likes, topicDistribution) {
  const topTopic = topicDistribution[0]?.topic_label || "Other AI";
  const tagCatalog = collectCustomTagCatalog(likes);
  const activeTag = tagCatalog.find((tag) => tag.key === state.customTag) || null;
  document.querySelector("#like-tag-map").innerHTML = [
    {
      label: "Group",
      value: state.source ? getLibraryGroupLabel(state.source) : "All groups",
      meta: state.source ? "current filtered group" : "all liked groups",
    },
    {
      label: "Status",
      value: state.workflowStatus ? getWorkflowStatusLabel(state.workflowStatus) : "All statuses",
      meta: state.workflowStatus ? "current workflow state" : "workspace not filtered",
    },
    {
      label: "Priority",
      value: state.priorityLevel ? getPriorityLabel(state.priorityLevel) : "All priorities",
      meta: state.priorityLevel ? "current priority filter" : "priority not filtered",
    },
    {
      label: "Custom Tag",
      value: activeTag?.label || (tagCatalog[0]?.label || "No tag"),
      meta: activeTag ? "current custom tag" : tagCatalog.length ? "available tag palette" : "no custom tag yet",
    },
    {
      label: "Topic",
      value: state.topic ? displayTopicLabel(state.topic) : topTopic,
      meta: state.topic ? "current filtered topic" : "current dominant topic",
    },
    {
      label: "Search",
      value: state.query || "No query",
      meta: state.query ? "current search query" : "search disabled",
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

function renderLaterQueue(laterQueue) {
  const summary = document.querySelector("#like-later-summary");
  const root = document.querySelector("#like-later-list");

  if (!laterQueue.length) {
    summary.textContent = "No papers in Later queue.";
    root.innerHTML = `<div class="empty-state">Papers marked as Later will appear here.</div>`;
    document.querySelector("#like-later-pagination").innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(laterQueue.length / LATER_PAGE_SIZE);
  laterPage = Math.min(laterPage, totalPages - 1);
  const start = laterPage * LATER_PAGE_SIZE;
  const pageItems = laterQueue.slice(start, start + LATER_PAGE_SIZE);

  summary.textContent = `${laterQueue.length} papers marked for later reading.`;

  const cardsHtml = pageItems
    .map((paper) => {
      likeRecords.set(paper.like_id, {
        paper: paper,
        context: {
          sourceKind: paper.source_kind,
          sourceLabel: paper.source_label,
          sourcePage: paper.source_page,
          snapshotLabel: paper.snapshot_label,
        }
      });
      return `
        <article class="spotlight-card">
          <div class="spotlight-meta">
            <span class="paper-badge">${escapeHtml(displayTopicLabel(paper.topic_label || "Other AI"))}</span>
            <span class="paper-badge subdued">${escapeHtml(getSourceLabel(paper.source_kind))}</span>
          </div>
          <h3>${escapeHtml(paper.title)}</h3>
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
            ${getArxivUrl(paper) ? renderExternalPaperLink({ href: getArxivUrl(paper), label: "arXiv", brand: "arxiv" }) : ""}
            ${getCoolUrl(paper) ? renderExternalPaperLink({ href: getCoolUrl(paper), label: "Cool", brand: "cool" }) : ""}
            <button class="paper-link later-button is-later" type="button" data-later-id="${escapeAttribute(paper.like_id)}" aria-pressed="true">
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
      `;
    })
    .join("");

  root.innerHTML = cardsHtml;

  const pagRoot = document.querySelector("#like-later-pagination");
  pagRoot.innerHTML = totalPages > 1
    ? `<div class="pagination">
        <button class="pill-button" data-later-page="prev" ${laterPage === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="pagination-info">${laterPage + 1} / ${totalPages}</span>
        <button class="pill-button" data-later-page="next" ${laterPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
      </div>`
    : "";

  pagRoot.querySelectorAll("[data-later-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.laterPage === "prev" && laterPage > 0) laterPage--;
      else if (btn.dataset.laterPage === "next" && laterPage < totalPages - 1) laterPage++;
      renderLaterQueue(laterQueue);
      bindLikeButtons(document, likeRecords);
      bindQueueButtons(document, likeRecords);
    });
  });
}

function renderToReadList(toReadSnapshots) {
  const summary = document.querySelector("#like-to-read-summary");
  const root = document.querySelector("#like-to-read-list");

  if (!toReadSnapshots.length) {
    summary.textContent = "Every fetched snapshot has been reviewed.";
    root.innerHTML = `<div class="empty-state">No unread snapshots remain in your queue.</div>`;
    document.querySelector("#like-to-read-pagination").innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(toReadSnapshots.length / TO_READ_PAGE_SIZE);
  toReadPage = Math.min(toReadPage, totalPages - 1);
  const start = toReadPage * TO_READ_PAGE_SIZE;
  const pageItems = toReadSnapshots.slice(start, start + TO_READ_PAGE_SIZE);

  summary.textContent = `${toReadSnapshots.length} fetched snapshots are currently in your queue because they are not reviewed.`;

  const cardsHtml = pageItems
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

  root.innerHTML = cardsHtml;

  const pagRoot = document.querySelector("#like-to-read-pagination");
  pagRoot.innerHTML = totalPages > 1
    ? `<div class="pagination">
        <button class="pill-button" data-to-read-page="prev" ${toReadPage === 0 ? 'disabled' : ''}>← Prev</button>
        <span class="pagination-info">${toReadPage + 1} / ${totalPages}</span>
        <button class="pill-button" data-to-read-page="next" ${toReadPage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
      </div>`
    : "";

  pagRoot.querySelectorAll("[data-to-read-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.toReadPage === "prev" && toReadPage > 0) toReadPage--;
      else if (btn.dataset.toReadPage === "next" && toReadPage < totalPages - 1) toReadPage++;
      renderToReadList(toReadSnapshots);
    });
  });

  root.querySelectorAll("[data-review-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const reviewKey = button.dataset.reviewKey;
      if (!reviewKey) {
        return;
      }
      setPageReviewed(reviewKey, true, {
        branch: button.dataset.branchLabel || "Library",
        snapshot_label: button.dataset.snapshotLabel || "",
      });
    });
  });
}

function renderDistribution(distribution) {
  const root = document.querySelector("#like-distribution-list");
  if (!distribution.length) {
    root.innerHTML = `<div class="empty-state">No topic statistics are available.</div>`;
    return;
  }
  root.innerHTML = distribution
    .slice(0, 8)
    .map(
      (item) => `
        <div class="distribution-row">
          <div class="distribution-top">
            <span>${escapeHtml(displayTopicLabel(item.topic_label))}</span>
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

function renderResults(likes, visibleLikes, sourceSections) {
  const activeFilters = getActiveFilters(getCurrentFilterState(), state.likes);
  const activeCustomTag = state.customTag
    ? collectCustomTagCatalog(state.likes).find((item) => item.key === state.customTag)?.label || state.customTag
    : "";
  document.querySelector("#like-results-title").textContent = activeFilters.length
    ? `${visibleLikes.length} papers visible after filtering`
    : `${likes.length} liked papers`;
  document.querySelector("#like-results-stats").innerHTML = [
    renderResultStat("Visible Liked", visibleLikes.length, activeFilters.length ? `of ${likes.length}` : "full liked set"),
    renderResultStat("Visible Groups", sourceSections.length, activeFilters.length ? "filtered" : "all groups"),
    renderResultStat(
      "View Mode",
      state.viewMode === "list" ? "List" : "Gallery",
      activeCustomTag || getWorkflowStatusLabel(state.workflowStatus) || getPriorityLabel(state.priorityLevel) || state.topic || (state.query ? `search: ${state.query}` : "cross-group browsing")
    ),
  ].join("");
  document.querySelector("#like-active-filters").innerHTML = activeFilters.length
    ? activeFilters.map((item) => `<span class="active-filter-pill">${escapeHtml(item)}</span>`).join("")
    : `<span class="active-filter-pill">No filters applied. You are looking at the full liked set.</span>`;
  resetFiltersButton.disabled = !activeFilters.length;
}

function renderSourceSections(sections) {
  const root = document.querySelector("#like-source-sections");
  if (!sections.length) {
    root.innerHTML = `<div class="glass-card empty-state">No liked papers match the current filters.</div>`;
    return;
  }

  root.innerHTML = sections
    .map(
      (section, index) => {
        const key = section.group_key;
        const page = branchPages.get(key) || 0;
        const totalPages = Math.ceil(section.liked_count / BRANCH_PAGE_SIZE);
        const safePage = Math.min(page, totalPages - 1);
        if (safePage !== page) branchPages.set(key, safePage);
        const start = safePage * BRANCH_PAGE_SIZE;
        const pageItems = section.papers.slice(start, start + BRANCH_PAGE_SIZE);

        const paginationHtml = totalPages > 1
          ? `<div class="pagination">
              <button class="pill-button" data-branch-page="prev" data-branch-key="${escapeAttribute(key)}" ${safePage === 0 ? 'disabled' : ''}>← Prev</button>
              <span class="pagination-info">${safePage + 1} / ${totalPages}</span>
              <button class="pill-button" data-branch-page="next" data-branch-key="${escapeAttribute(key)}" ${safePage >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
            </div>`
          : "";

        return `
          <section class="glass-card conference-subject-card">
            <div class="conference-subject-header">
              <div>
                <p class="eyebrow">GROUP</p>
                <h3>${index + 1}. ${escapeHtml(section.group_label)}</h3>
              </div>
              <div class="conference-subject-meta">
                <span>${section.liked_count} papers</span>
                <span>${escapeHtml(section.latest_snapshot || "No snapshot")}</span>
              </div>
            </div>
            <div class="${state.viewMode === "list" ? "liked-paper-list" : "conference-paper-grid"}">
              ${pageItems.map((paper) => (state.viewMode === "list" ? renderLikeListRow(paper) : renderLikeCard(paper))).join("")}
            </div>
            ${paginationHtml}
          </section>
        `;
      }
    )
    .join("");

  root.querySelectorAll("[data-branch-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.branchKey;
      const current = branchPages.get(key) || 0;
      if (btn.dataset.branchPage === "prev" && current > 0) {
        branchPages.set(key, current - 1);
      } else if (btn.dataset.branchPage === "next") {
        branchPages.set(key, current + 1);
      }
      renderPage();
    });
  });

  bindListRowDetails();
}

function bindListRowDetails() {
  document.querySelectorAll("[data-like-row-details]").forEach((details) => {
    if (details.dataset.bound === "true") {
      return;
    }
    details.dataset.bound = "true";
    details.addEventListener("toggle", () => {
      const likeId = details.dataset.likeRowDetails;
      if (!likeId) {
        return;
      }
      const body = details.closest(".liked-paper-row")?.querySelector(".liked-paper-row-body");
      if (details.open) {
        openListRowDetails.add(likeId);
        if (body) {
          body.hidden = false;
        }
      } else {
        openListRowDetails.delete(likeId);
        if (body) {
          body.hidden = true;
        }
      }
    });
  });
}

function renderLikeCard(paper) {
  const view = buildLikePaperViewModel(paper);
  const summaryNote = view.takeaway || view.nextAction || "";

  return `
    <article class="conference-paper-card liked-paper-card">
      <div class="liked-paper-card-top">
        <div class="conference-paper-top">${view.metaBadges}</div>
        <div class="paper-links liked-paper-card-links">${view.links}</div>
      </div>
      <h4>${escapeHtml(view.paper.title)}</h4>
      <div class="liked-paper-card-copy">
        <div class="paper-authors-box">
          <span class="paper-detail-label">Authors</span>
          <p class="paper-authors-line">${view.authors}</p>
        </div>
        ${summaryNote ? `<p class="liked-paper-card-note">${escapeHtml(summaryNote)}</p>` : ""}
      </div>
      ${view.abstract}
      <div class="liked-paper-card-secondary">
        ${renderCustomTagPanel(view)}
        ${renderWorkspacePanel(view)}
      </div>
    </article>
  `;
}

function renderLikeListRow(paper) {
  const view = buildLikePaperViewModel(paper);
  const rowOpen = openListRowDetails.has(view.paper.like_id);
  const summaryText = view.takeaway || view.nextAction || view.paper.abstract || "No note yet.";

  return `
    <article class="liked-paper-row">
      <div class="liked-paper-row-main">
        <div class="liked-paper-row-copy">
          <div class="liked-paper-row-top">${view.metaBadges}</div>
          <h4>${escapeHtml(view.paper.title)}</h4>
          <p class="liked-paper-row-authors">${view.authors}</p>
          <p class="liked-paper-row-summary">${escapeHtml(summaryText)}</p>
        </div>
        <div class="liked-paper-row-actions">
          <div class="paper-links liked-paper-row-links">${view.links}</div>
          <details class="liked-paper-row-details" data-like-row-details="${escapeAttribute(view.paper.like_id)}"${rowOpen ? " open" : ""}>
            <summary>
              <span class="paper-abstract-label">Open details</span>
              <span class="paper-abstract-arrow" aria-hidden="true">
                <svg viewBox="0 0 20 20" width="14" height="14">
                  <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                </svg>
              </span>
            </summary>
          </details>
        </div>
      </div>
      <div class="liked-paper-row-body"${rowOpen ? "" : " hidden"}>
        <div class="paper-authors-box liked-paper-row-authors-box">
          <span class="paper-detail-label">Authors</span>
          <p class="paper-authors-line">${view.authors}</p>
        </div>
        ${view.abstract}
        ${renderCustomTagPanel(view)}
        ${renderWorkspacePanel(view)}
      </div>
    </article>
  `;
}

function buildLikePaperViewModel(paper) {
  const inLater = isInQueue(paper.like_id);
  likeRecords.set(paper.like_id, {
    paper,
    context: {
      sourceKind: paper.source_kind,
      sourceLabel: getSourceLabel(paper.source_kind),
      sourcePage: paper.source_page,
      snapshotLabel: paper.snapshot_label,
    },
  });

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

  const metaBadges = [
    `<span class="paper-badge">${escapeHtml(displayTopicLabel(paper.topic_label || "Other AI"))}</span>`,
    `<span class="paper-badge subdued">${escapeHtml(getSourceLabel(paper.source_kind))}</span>`,
    paper.snapshot_label ? `<span class="paper-badge subdued">${escapeHtml(paper.snapshot_label)}</span>` : "",
    inLater ? `<span class="paper-badge queued-badge">Queued</span>` : "",
    `<span class="paper-badge workspace-status-badge">${escapeHtml(getWorkflowStatusLabel(paper.workflow_status))}</span>`,
    `<span class="paper-badge workspace-priority-badge">${escapeHtml(getPriorityLabel(paper.priority_level))}</span>`,
  ]
    .filter(Boolean)
    .join("");

  const links = [
    getArxivUrl(paper) ? renderExternalPaperLink({ href: getArxivUrl(paper), label: "arXiv", brand: "arxiv" }) : "",
    getCoolUrl(paper) ? renderExternalPaperLink({ href: getCoolUrl(paper), label: "Cool", brand: "cool" }) : "",
    renderLikeButton(paper),
  ]
    .filter(Boolean)
    .join("");

  const customTags = getPaperCustomTags(paper);
  const tagCatalog = collectCustomTagCatalog(state.likes);
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

  const tagOptions = tagCatalog
    .filter((tag) => !customTags.some((item) => item.key === tag.key))
    .map(
      (tag) => `
        <button
          class="custom-tag-option"
          type="button"
          data-tag-option="${escapeAttribute(paper.like_id)}"
          data-tag-key="${escapeAttribute(tag.key)}"
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
                class="custom-tag-option${applied ? " is-applied" : ""}"
                type="button"
                data-tag-option="${escapeAttribute(paper.like_id)}"
                data-tag-key="${escapeAttribute(tag.key)}"
                ${applied ? 'disabled aria-disabled="true"' : ""}
              >
                <span class="custom-tag-swatch" style="${escapeAttribute(getCustomTagStyle(tag.color))}"></span>
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

  const statusOptions = WORKFLOW_STATUS_OPTIONS.map(
    (item) => `<option value="${escapeAttribute(item.value)}" ${getWorkflowStatusValue(paper.workflow_status) === item.value ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  ).join("");
  const priorityOptions = PRIORITY_OPTIONS.map(
    (item) => `<option value="${escapeAttribute(item.value)}" ${getPriorityValue(paper.priority_level) === item.value ? "selected" : ""}>${escapeHtml(item.label)}</option>`
  ).join("");

  return {
    paper,
    inLater,
    authors,
    abstract,
    metaBadges,
    links,
    tagChips,
    tagOptions,
    manageItems,
    paletteButtons,
    statusOptions,
    priorityOptions,
    takeaway: paper.one_line_takeaway || "",
    nextAction: paper.next_action || "",
    workspaceEditorOpen: openWorkspaceEditors.has(paper.like_id),
  };
}

function renderCustomTagPanel(view) {
  return `
    <section class="custom-tag-panel">
      <div class="custom-tag-panel-top">
        <span class="paper-detail-label">Custom Tags</span>
        <button class="custom-tag-trigger" type="button" data-tag-toggle="${escapeAttribute(view.paper.like_id)}">Add Tag</button>
      </div>
      <div class="custom-tag-list">${view.tagChips}</div>
      <div class="custom-tag-composer" data-tag-popover="${escapeAttribute(view.paper.like_id)}" hidden>
        <div class="custom-tag-composer-field">
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
        <div class="custom-tag-composer-section">
          <span class="custom-tag-section-label">Reuse tags</span>
          <div class="custom-tag-options">
            ${view.tagOptions || `<span class="custom-tag-empty">No reusable tags yet.</span>`}
          </div>
        </div>
        <div class="custom-tag-composer-section">
          <div class="custom-tag-section-heading">
            <span class="custom-tag-section-label">Tag palette</span>
            <span class="custom-tag-section-meta">Rename or recolor once, update everywhere</span>
          </div>
          <div class="custom-tag-library">
            ${view.manageItems}
          </div>
        </div>
        <div class="custom-tag-editor" data-tag-editor="${escapeAttribute(view.paper.like_id)}" hidden>
          <input type="hidden" data-tag-edit-key-field="${escapeAttribute(view.paper.like_id)}" value="" />
          <label class="custom-tag-editor-label">
            <span class="custom-tag-section-label">Tag name</span>
            <input
              class="custom-tag-input"
              type="text"
              data-tag-edit-label="${escapeAttribute(view.paper.like_id)}"
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
    </section>
  `;
}

function renderWorkspacePanel(view) {
  return `
    <section class="paper-workspace-panel">
      <div class="paper-workspace-top">
        <span class="paper-detail-label">Workspace</span>
        <span class="paper-workspace-meta">${escapeHtml([view.inLater ? "Queued" : "", getWorkflowStatusLabel(view.paper.workflow_status), getPriorityLabel(view.paper.priority_level)].filter(Boolean).join(" · "))}</span>
      </div>
      <div class="paper-workspace-grid">
        <article class="paper-workspace-card">
          <span class="paper-detail-label">Takeaway</span>
          <p>${escapeHtml(view.takeaway || "Capture the one-line reason this paper matters.")}</p>
        </article>
        <article class="paper-workspace-card">
          <span class="paper-detail-label">Next Action</span>
          <p>${escapeHtml(view.nextAction || "Leave a concrete follow-up step for yourself.")}</p>
        </article>
      </div>
      <details class="paper-workspace-editor" data-workspace-editor-id="${escapeAttribute(view.paper.like_id)}"${view.workspaceEditorOpen ? " open" : ""}>
        <summary>
          <span class="paper-abstract-label">Edit notes</span>
          <span class="paper-abstract-arrow" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="14" height="14">
              <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </span>
        </summary>
        <div class="paper-workspace-form">
          <div class="paper-workspace-fields">
            <label class="paper-workspace-field">
              <span class="paper-detail-label">Status</span>
              <select class="control-input" data-workspace-status="${escapeAttribute(view.paper.like_id)}">
                ${view.statusOptions}
              </select>
            </label>
            <label class="paper-workspace-field">
              <span class="paper-detail-label">Priority</span>
              <select class="control-input" data-workspace-priority="${escapeAttribute(view.paper.like_id)}">
                ${view.priorityOptions}
              </select>
            </label>
          </div>
          <label class="paper-workspace-field">
            <span class="paper-detail-label">One-line takeaway</span>
            <textarea class="paper-workspace-textarea" rows="2" data-workspace-takeaway="${escapeAttribute(view.paper.like_id)}" placeholder="What is the main reason to keep this paper?">${escapeHtml(view.takeaway)}</textarea>
          </label>
          <label class="paper-workspace-field">
            <span class="paper-detail-label">Next action</span>
            <textarea class="paper-workspace-textarea" rows="2" data-workspace-next-action="${escapeAttribute(view.paper.like_id)}" placeholder="What should future-you do with this paper?">${escapeHtml(view.nextAction)}</textarea>
          </label>
        </div>
      </details>
    </section>
  `;
}

function renderLikeButton(paper) {
  const inLater = isInQueue(paper.like_id);
  const liked = true;
  return `
    <button class="paper-link later-button${inLater ? " is-later" : ""}" type="button" data-later-id="${escapeAttribute(paper.like_id)}" aria-pressed="${inLater}">
      <span class="paper-link-icon later-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M4 6h12M4 10h12M4 14h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
        </svg>
      </span>
      <span class="paper-link-text">Later</span>
    </button>
    <button class="paper-link like-button${liked ? " is-liked" : ""}" type="button" data-like-id="${escapeAttribute(paper.like_id)}" aria-pressed="${liked}">
      <span class="paper-link-icon like-icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M10 16.3l-5.26-4.98A3.8 3.8 0 0 1 10 5.9a3.8 3.8 0 0 1 5.26 5.42z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
        </svg>
      </span>
      <span class="paper-link-text">Like</span>
    </button>
  `;
}

function renderExternalPaperLink({ href, label, brand }) {
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

function bindTagComposer() {
  document.querySelectorAll("[data-tag-toggle]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      const likeId = button.dataset.tagToggle;
      const popover = document.querySelector(`[data-tag-popover="${CSS.escape(likeId)}"]`);
      if (!popover) {
        return;
      }
      const nextHidden = !popover.hidden;
      hideAllTagPopovers();
      popover.hidden = nextHidden;
      if (!nextHidden) {
        const input = popover.querySelector("[data-tag-input]");
        input?.focus();
      }
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
      const tag = collectCustomTagCatalog(state.likes).find((item) => item.key === tagKey);
      if (!likeId || !tag) {
        return;
      }
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
      const tag = buildCustomTag(String(input?.value || ""), state.likes);
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
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const likeId = input.dataset.tagInput;
      const tag = buildCustomTag(String(input.value || ""), state.likes);
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
      const tag = collectCustomTagCatalog(state.likes).find((item) => item.key === tagKey);
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
      const keyField = document.querySelector(`[data-tag-edit-key-field="${CSS.escape(likeId)}"]`);
      const labelInput = document.querySelector(`[data-tag-edit-label="${CSS.escape(likeId)}"]`);
      if (!likeId || !tag || !editor || !keyField || !labelInput) {
        return;
      }
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
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
      const keyField = document.querySelector(`[data-tag-edit-key-field="${CSS.escape(likeId)}"]`);
      const mergeSelect = document.querySelector(`[data-tag-merge-target="${CSS.escape(likeId)}"]`);
      const sourceKey = keyField?.value || "";
      const targetKey = mergeSelect?.value || "";
      if (!sourceKey || !targetKey) {
        return;
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
      event.dataTransfer?.setData("application/x-tag-order", JSON.stringify({
        likeId: item.dataset.tagLibraryItem || "",
        tagKey: item.dataset.tagKey || "",
      }));
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

  if (document.body.dataset.likeTagDismissBound !== "true") {
    document.body.dataset.likeTagDismissBound = "true";
    document.addEventListener(
      "click",
      (event) => {
        if (event.target.closest(".custom-tag-panel")) {
          return;
        }
        hideAllTagPopovers();
      },
      { capture: true }
    );
  }
}

function hideAllTagPopovers() {
  document.querySelectorAll("[data-tag-popover]").forEach((node) => {
    node.hidden = true;
  });
  document.querySelectorAll("[data-tag-editor]").forEach((node) => {
    node.hidden = true;
    delete node.dataset.tagEditKey;
    delete node.dataset.tagEditColor;
  });
}

function bindWorkspaceEditors() {
  document.querySelectorAll("[data-workspace-editor-id]").forEach((editor) => {
    if (editor.dataset.bound === "true") {
      return;
    }
    editor.dataset.bound = "true";
    editor.addEventListener("toggle", () => {
      const likeId = editor.dataset.workspaceEditorId;
      if (!likeId) {
        return;
      }
      if (editor.open) {
        openWorkspaceEditors.add(likeId);
      } else {
        openWorkspaceEditors.delete(likeId);
      }
    });
  });

  document.querySelectorAll("[data-workspace-status], [data-workspace-priority]").forEach((field) => {
    if (field.dataset.bound === "true") {
      return;
    }
    field.dataset.bound = "true";
    field.addEventListener("change", () => {
      const likeId = field.dataset.workspaceStatus || field.dataset.workspacePriority;
      if (!likeId) {
        return;
      }
      saveWorkspaceFields(likeId, readWorkspaceFieldValues(likeId));
    });
  });

  document.querySelectorAll("[data-workspace-takeaway], [data-workspace-next-action]").forEach((field) => {
    if (field.dataset.bound === "true") {
      return;
    }
    field.dataset.bound = "true";
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

function updateCustomTagDefinition(tagKey, nextDefinition) {
  const key = String(tagKey || "").trim();
  const label = String(nextDefinition?.label || "").replace(/\s+/g, " ").trim();
  const color = String(nextDefinition?.color || "").trim();
  const order = Number.isFinite(Number(nextDefinition?.order)) ? Number(nextDefinition.order) : null;
  if (!key || !label || !color) {
    return null;
  }

  return updateLikedPapers((record) => {
    const existingTags = getPaperCustomTags(record);
    if (!existingTags.some((tag) => tag.key === key)) {
      return null;
    }

    let changed = false;
    const nextTags = existingTags.map((tag) => {
      if (tag.key !== key) {
        return tag;
      }
      const nextOrder = order ?? (Number.isFinite(tag.order) ? tag.order : null);
      if (tag.label === label && tag.color === color && (tag.order ?? null) === nextOrder) {
        return tag;
      }
      changed = true;
      return { ...tag, label, color, order: nextOrder };
    });

    return changed ? { ...record, custom_tags: nextTags.sort(compareCustomTagMeta) } : null;
  });
}

function saveWorkspaceFields(likeId, nextFields) {
  return updateLikedPaper(likeId, (record) => {
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

function reorderCustomTags(orderedKeys) {
  const normalizedKeys = orderedKeys.map((key) => String(key || "").trim()).filter(Boolean);
  if (!normalizedKeys.length) {
    return null;
  }

  const orderByKey = new Map(normalizedKeys.map((key, index) => [key, index]));
  return updateLikedPapers((record) => {
    const existingTags = getPaperCustomTags(record);
    let changed = false;
    const nextTags = existingTags.map((tag) => {
      const nextOrder = orderByKey.get(tag.key);
      if (nextOrder === undefined || getCustomTagOrder(tag) === nextOrder) {
        return tag;
      }
      changed = true;
      return { ...tag, order: nextOrder };
    });
    return changed ? { ...record, custom_tags: nextTags.sort(compareCustomTagMeta) } : null;
  });
}

function mergeCustomTags(sourceKey, targetKey) {
  const source = String(sourceKey || "").trim();
  const target = String(targetKey || "").trim();
  if (!source || !target || source === target) {
    return null;
  }

  const catalog = collectCustomTagCatalog(state.likes);
  const targetTag = catalog.find((tag) => tag.key === target);
  if (!targetTag) {
    return null;
  }

  const result = updateLikedPapers((record) => {
    const existingTags = getPaperCustomTags(record);
    if (!existingTags.some((tag) => tag.key === source)) {
      return null;
    }

    let changed = false;
    const nextTags = [];
    existingTags.forEach((tag) => {
      if (tag.key === source) {
        changed = true;
        if (!existingTags.some((item) => item.key === target) && !nextTags.some((item) => item.key === target)) {
          nextTags.push({ ...targetTag });
        }
        return;
      }
      if (tag.key === target) {
        nextTags.push({ ...tag, label: targetTag.label, color: targetTag.color, order: targetTag.order });
        return;
      }
      nextTags.push(tag);
    });

    const deduped = [];
    const seen = new Set();
    nextTags.forEach((tag) => {
      if (!seen.has(tag.key)) {
        seen.add(tag.key);
        deduped.push(tag);
      }
    });

    return changed ? { ...record, custom_tags: deduped.sort(compareCustomTagMeta) } : null;
  });

  if (state.customTag === source) {
    state.customTag = target;
  }
  return result;
}

function syncTagEditorPalette(editor, tagKey, selectedColor) {
  if (!editor) {
    return;
  }

  const currentCatalog = collectCustomTagCatalog(state.likes);
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
  updateLikedPaper(likeId, (record) => {
    const existingTags = getPaperCustomTags(record);
    if (existingTags.some((item) => item.key === tag.key)) {
      return null;
    }
    return {
      ...record,
      custom_tags: [...existingTags, { key: tag.key, label: tag.label, color: tag.color }],
    };
  });
}

function removeTagFromPaper(likeId, tagKey) {
  updateLikedPaper(likeId, (record) => {
    const nextTags = getPaperCustomTags(record).filter((tag) => tag.key !== tagKey);
    if (nextTags.length === getPaperCustomTags(record).length) {
      return null;
    }
    return {
      ...record,
      custom_tags: nextTags,
    };
  });
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

function getVisibleLikes(likes) {
  return likes.filter((paper) => {
    if (state.source && getLibraryGroupKey(paper.source_kind) !== state.source) {
      return false;
    }
    if (state.workflowStatus && getWorkflowStatusValue(paper.workflow_status) !== state.workflowStatus) {
      return false;
    }
    if (state.priorityLevel && getPriorityValue(paper.priority_level) !== state.priorityLevel) {
      return false;
    }
    if (state.customTag && !getPaperCustomTags(paper).some((tag) => tag.key === state.customTag)) {
      return false;
    }
    if (state.topic && (paper.topic_label || "Other AI") !== state.topic) {
      return false;
    }
    if (!state.query) {
      return true;
    }
    const haystack = [
      paper.title,
      ...(paper.authors || []),
      ...getPaperCustomTags(paper).map((tag) => tag.label),
      paper.one_line_takeaway,
      paper.next_action,
      getWorkflowStatusLabel(paper.workflow_status),
      getPriorityLabel(paper.priority_level),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(state.query);
  });
}

function groupBySource(likes) {
  const map = new Map();
  likes.forEach((paper) => {
    const group = getLibraryGroupKey(paper.source_kind || "daily");
    if (!map.has(group)) {
      map.set(group, []);
    }
    map.get(group).push(paper);
  });
  return [...map.entries()]
    .map(([group_key, papers]) => {
      const distribution = computeTopicDistribution(papers);
      return {
        group_key,
        group_label: getLibraryGroupLabel(group_key),
        liked_count: papers.length,
        latest_snapshot: papers[0]?.snapshot_label || "",
        latest_liked: formatDateTime(papers[0]?.liked_at || papers[0]?.saved_at, LIKE_TIME_FORMAT),
        top_topic: distribution[0]?.topic_label || "",
        papers,
      };
    })
    .sort((a, b) => b.liked_count - a.liked_count || a.group_label.localeCompare(b.group_label, "en"));
}

function buildLibrarySourceSections(likes, laterQueue, toReadSnapshots) {
  const likesBySource = groupBySource(likes);
  const laterBySource = new Map();
  laterQueue.forEach((paper) => {
    const groupKey = getLibraryGroupKey(paper.source_kind || "daily");
    laterBySource.set(groupKey, (laterBySource.get(groupKey) || 0) + 1);
  });
  const toReadBySource = new Map();
  toReadSnapshots.forEach((snapshot) => {
    const groupKey = getLibraryGroupKey(getSnapshotSourceKind(snapshot));
    toReadBySource.set(groupKey, (toReadBySource.get(groupKey) || 0) + 1);
  });

  const sourceKinds = new Set([
    ...likesBySource.map((section) => section.group_key),
    ...laterBySource.keys(),
    ...toReadBySource.keys(),
  ]);

  return [...sourceKinds]
    .map((groupKey) => {
      const likesSection = likesBySource.find((section) => section.group_key === groupKey);
      const likedCount = likesSection?.liked_count || 0;
      const laterCount = laterBySource.get(groupKey) || 0;
      const toReadCount = toReadBySource.get(groupKey) || 0;
      const latestSnapshot = likesSection?.latest_snapshot || toReadSnapshots.find((snapshot) => getLibraryGroupKey(getSnapshotSourceKind(snapshot)) === groupKey)?.snapshot_label || "";
      const topTopic = likesSection?.top_topic || "";
      return {
        group_key: groupKey,
        group_label: getLibraryGroupLabel(groupKey),
        liked_count: likedCount,
        later_count: laterCount,
        to_read_count: toReadCount,
        latest_snapshot: latestSnapshot,
        latest_liked: likesSection?.latest_liked || "",
        top_topic: topTopic,
        lede: buildLibrarySourceLede(likedCount, laterCount, toReadCount),
        sort_score: likedCount * 100 + laterCount * 10 + toReadCount,
      };
    })
    .sort((a, b) => b.sort_score - a.sort_score || a.group_label.localeCompare(b.group_label, "en"));
}

function buildLibrarySourceLede(likedCount, laterCount, toReadCount) {
  if (toReadCount) {
    return `${toReadCount} unread snapshots waiting for review`;
  }
  if (likedCount) {
    return `${likedCount} liked papers ready to revisit`;
  }
  if (laterCount) {
    return `${laterCount} papers queued for later reading`;
  }
  return "Start liking papers to build this group";
}

function computeTopicDistribution(papers) {
  const counts = new Map();
  papers.forEach((paper) => {
    const topic = displayTopicLabel(paper.topic_label || "Other AI");
    counts.set(topic, (counts.get(topic) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([topic_label, count]) => ({
      topic_label,
      count,
      share: papers.length ? (count / papers.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.topic_label.localeCompare(b.topic_label, "en"));
}

function renderResultStat(label, value, meta) {
  return `
    <article class="result-stat">
      <span class="result-stat-label">${escapeHtml(label)}</span>
      <strong class="result-stat-value">${escapeHtml(String(value))}</strong>
      <span class="result-stat-meta">${escapeHtml(meta)}</span>
    </article>
  `;
}

function renderEmpty(toReadSnapshots) {
  document.querySelector("#like-overview-summary").textContent = "No liked papers yet.";
  document.querySelector("#like-focus-summary").textContent = "This area will populate after you like papers.";
  document.querySelector("#like-branch-summary").textContent = "No group distribution yet.";
  document.querySelector("#like-latest-summary").textContent = "No latest like record yet.";
  document.querySelector("#like-tag-map").innerHTML = "";
  document.querySelector("#like-distribution-list").innerHTML = `<div class="empty-state">No like statistics yet.</div>`;
  document.querySelector("#like-results-title").textContent = "No liked papers yet";
  document.querySelector("#like-results-stats").innerHTML = "";
  document.querySelector("#like-active-filters").innerHTML = `<span class="active-filter-pill">Like any paper and this area will update automatically.</span>`;
  document.querySelector("#like-source-sections").innerHTML =
    `<div class="glass-card empty-state">Click Like in Cool Daily, Conference, or HF Daily to add papers here.</div>`;
  resetFiltersButton.disabled = true;
}

function getCurrentFilterState() {
  return normalizeFilterState({
    source: state.source,
    topic: state.topic,
    customTag: state.customTag,
    workflowStatus: state.workflowStatus,
    priorityLevel: state.priorityLevel,
    query: state.query,
    viewMode: state.viewMode,
  });
}

function applySavedView(viewId) {
  const view = state.savedViews.find((item) => item.view_id === viewId);
  if (!view) {
    return;
  }
  const filters = normalizeFilterState(view.filters);
  state.selectedSavedViewId = view.view_id;
  state.savedViewDraftName = view.name;
  state.source = filters.source;
  state.topic = filters.topic;
  state.customTag = filters.customTag;
  state.workflowStatus = filters.workflowStatus;
  state.priorityLevel = filters.priorityLevel;
  state.query = filters.query;
  state.viewMode = filters.viewMode;
  setPageViewMode("like", filters.viewMode, { persist: true, notify: false });
  sourceFilter.value = state.source;
  topicFilter.value = state.topic;
  customTagFilter.value = state.customTag;
  statusFilter.value = state.workflowStatus;
  priorityFilter.value = state.priorityLevel;
  searchInput.value = state.query;
  renderPage();
}

function getSelectedSavedView() {
  return state.savedViews.find((view) => view.view_id === state.selectedSavedViewId) || null;
}

function updateSavedViewActionState() {
  const selectedView = getSelectedSavedView();
  const draftName = String(savedViewNameInput?.value || state.savedViewDraftName || "").trim();
  if (saveViewButton) {
    saveViewButton.disabled = !draftName;
  }
  if (updateViewButton) {
    updateViewButton.disabled = !selectedView;
  }
  if (deleteViewButton) {
    deleteViewButton.disabled = !selectedView;
  }
}

function renderFatal(error) {
  const message = getErrorMessage(error);
  document.querySelector("#like-source-sections").innerHTML =
    `<div class="glass-card empty-state">Like page failed to load: ${escapeHtml(message)}</div>`;
}

function scheduleToReadSnapshotSync() {
  if (!state.snapshots.length) {
    return;
  }
  syncToReadSnapshotsNow().catch((error) => {
    console.error("Failed to sync to-read snapshots to Supabase", error);
  });
}

async function syncToReadSnapshotsNow() {
  if (toReadSyncPromise) {
    return toReadSyncPromise;
  }
  toReadSyncPromise = performToReadSnapshotSync();
  try {
    return await toReadSyncPromise;
  } finally {
    toReadSyncPromise = null;
  }
}

async function performToReadSnapshotSync() {
  await loadRuntimeConfig();
  if (!isSupabaseConfigured()) {
    return [];
  }

  const supabaseClient = await getSupabaseClient();
  if (!supabaseClient) {
    return [];
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  const user = session?.user || null;
  if (!user) {
    return [];
  }

  const snapshots = getToReadSnapshots(state.snapshots);
  const upsertRows = snapshots.map((snapshot) => ({
    user_id: user.id,
    snapshot_id: snapshot.review_key,
    queued_at: new Date().toISOString(),
    payload: snapshot,
  }));

  if (upsertRows.length) {
    const { error } = await supabaseClient.from("to_read_snapshots").upsert(upsertRows, {
      onConflict: "user_id,snapshot_id",
    });
    if (error) {
      throw error;
    }
  }

  const { data: remoteRows, error: remoteError } = await supabaseClient
    .from("to_read_snapshots")
    .select("snapshot_id")
    .eq("user_id", user.id);
  if (remoteError) {
    throw remoteError;
  }

  const localIds = new Set(snapshots.map((snapshot) => snapshot.review_key));
  const staleIds = (remoteRows || []).map((item) => item.snapshot_id).filter((snapshotId) => !localIds.has(snapshotId));
  if (staleIds.length) {
    const { error } = await supabaseClient
      .from("to_read_snapshots")
      .delete()
      .eq("user_id", user.id)
      .in("snapshot_id", staleIds);
    if (error) {
      throw error;
    }
  }

  return snapshots;
}
