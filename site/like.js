import {
  bindLikeButtons,
  getSourceLabel,
  initLikesSync,
  readLikes,
  subscribeAuth,
  subscribeLikes,
  updateLikedPaper,
  updateLikedPapers,
} from "./likes.js?v=99ec863b62";
import { getSupabaseClient, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js?v=606e1fd811";
import { initReviewSync, setPageReviewed, subscribePageReviews } from "./reading_state.js?v=3a706b914e";
import { bindQueueButtons, initQueue, isInQueue, readQueue, subscribeQueue } from "./paper_queue.js?v=033bd186d1";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=66a12f1edc";
import { mountAppToolbar } from "./app_toolbar.js?v=a2626f682a";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=a318f05c52";
import { initToolbarPreferences, setPageViewMode } from "./toolbar_preferences.js?v=c889d6e375";
import { bindBackToTop, bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { createShowMoreAutoLoadController } from "./show_more_autoload.js?v=5f324a6f25";
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
import { createSavedViewId, getActiveFilters, normalizeFilterState, areFilterStatesEqual } from "./like_page_saved_views.js?v=4379d3608e";
import {
  CUSTOM_TAG_PALETTE,
  applyCustomTagToRecord,
  assignTagColor,
  buildCustomTag,
  collectCustomTagCatalog,
  getCustomTagStyle,
  mergeCustomTagsInRecord,
  getPaperCustomTags,
  removeCustomTagFromRecord,
  reorderCustomTagsInRecord,
  updateCustomTagDefinitionInRecord,
} from "./like_page_tags.js?v=dce6e52df9";
import { formatWeekLabel, getSnapshotSourceKind, getToReadSnapshots, loadSnapshotQueueData } from "./like_page_snapshots.js?v=30e01ecd4f";
import { getLikeSortLabel, normalizeLikeSortMode, sortLikes } from "./like_page_sorting.js?v=6ae385c61b";
import {
  initSavedViewsSync,
  readSavedViews as readSavedViewsStore,
  removeSavedView as removeSavedViewStore,
  subscribeSavedViews,
  upsertSavedView,
} from "./like_saved_views_store.js?v=90877ca133";
import { installManualLibraryTestCases } from "./manual_test_cases.js?v=2bdd5fc135";
import { readWorkspacePanelDefaultMode, subscribeUserSettings } from "./user_settings.js?v=6c7496f04b";

mountAppToolbar("#like-toolbar-root", {
  prefix: "like",
  filtersTemplateId: "like-toolbar-filters",
  toolbarSearch: {
    inputId: "like-search-input",
    placeholder: "Search title, authors, notes, or tags",
    ariaLabel: "Search liked papers by title, authors, notes, or custom tags",
  },
  branchActiveKey: null,
  libraryActiveKey: "liked",
  quickAddTarget: "later",
});
installManualLibraryTestCases();

const state = {
  likes: [],
  snapshots: [],
  source: "",
  topic: "",
  customTag: "",
  workflowStatus: "",
  priorityLevel: "",
  query: "",
  sortMode: "saved_desc",
  viewMode: "card",
  savedViews: [],
  selectedSavedViewId: "",
  savedViewDraftName: "",
  workspacePanelDefaultMode: readWorkspacePanelDefaultMode(),
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
const sortFilter = document.querySelector("#like-sort-filter");
const resetFiltersButton = document.querySelector("#like-reset-filters");
const savedViewNameInput = document.querySelector("#like-saved-view-name");
const saveViewButton = document.querySelector("#like-save-view");
const updateViewButton = document.querySelector("#like-update-view");
const deleteViewButton = document.querySelector("#like-delete-view");
const inlineSearchInput = document.querySelector("#like-inline-search-filter");
const inlineCustomTagFilter = document.querySelector("#like-inline-custom-tag-filter");
const inlineStatusFilter = document.querySelector("#like-inline-status-filter");
const inlinePriorityFilter = document.querySelector("#like-inline-priority-filter");
const inlineSortFilter = document.querySelector("#like-inline-sort-filter");
const inlineResetFiltersButton = document.querySelector("#like-inline-reset-filters");
const sidebarToggleButton = document.querySelector("#like-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#like-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#like-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#like-filters-menu");
const backToTopButton = document.querySelector("#like-back-to-top");
const likeRecords = new Map();
let toReadSyncPromise = null;
const openListRowDetails = new Set();
const workspacePanelOverrides = new Map();
const tagWorkbenchState = {
  openLikeId: "",
  manageLikeId: "",
  editorLikeId: "",
  editorTagKey: "",
};
let customTagSummaryFrame = 0;

const LATER_SECTION_INITIAL_SIZE = 6;
const LATER_SECTION_LOAD_MORE_SIZE = 6;
let laterVisibleCount = LATER_SECTION_INITIAL_SIZE;
const TO_READ_SECTION_INITIAL_SIZE = 6;
const TO_READ_SECTION_LOAD_MORE_SIZE = 6;
let toReadVisibleCount = TO_READ_SECTION_INITIAL_SIZE;
const SOURCE_SECTION_INITIAL_SIZE = 6;
const SOURCE_SECTION_LOAD_MORE_SIZE = 6;
const sourceSectionVisibleCounts = new Map();
const showMoreAutoLoad = createShowMoreAutoLoadController({
  bindingFlag: "likeShowMoreAutoLoadBound",
  onTrigger: ({ key, total }) => {
    if (!expandSourceSection(key, total)) {
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
  likeRecords.render = renderPage;
  state.sortMode = normalizeLikeSortMode(state.sortMode);
  window.addEventListener("resize", scheduleCustomTagSummaryLayout);
  if (document.fonts?.ready) {
    document.fonts.ready.then(() => {
      scheduleCustomTagSummaryLayout();
    }).catch(() => {});
  }
  if (document.fonts?.addEventListener) {
    document.fonts.addEventListener("loadingdone", scheduleCustomTagSummaryLayout);
  }
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
  bindSourceSectionActions();
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
  subscribeUserSettings((snapshot) => {
    if (state.workspacePanelDefaultMode === snapshot.workspacePanelDefaultMode) {
      return;
    }
    state.workspacePanelDefaultMode = snapshot.workspacePanelDefaultMode;
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

  inlineSearchInput?.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderPage();
  });

  sortFilter.addEventListener("change", (event) => {
    state.sortMode = normalizeLikeSortMode(event.target.value);
    renderPage();
  });

  inlineCustomTagFilter?.addEventListener("change", (event) => {
    state.customTag = event.target.value;
    renderPage();
  });

  inlineStatusFilter?.addEventListener("change", (event) => {
    state.workflowStatus = event.target.value;
    renderPage();
  });

  inlinePriorityFilter?.addEventListener("change", (event) => {
    state.priorityLevel = event.target.value;
    renderPage();
  });

  inlineSortFilter?.addEventListener("change", (event) => {
    state.sortMode = normalizeLikeSortMode(event.target.value);
    renderPage();
  });

  resetFiltersButton.addEventListener("click", () => {
    resetAllFilters();
    renderPage();
  });

  inlineResetFiltersButton?.addEventListener("click", () => {
    clearQuickFilters();
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
    const likes = sortLikes(readLikes(), state.sortMode);
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
    bindWorkspacePanels();
    bindTagComposer();
    restoreTagWorkbenchState();
    bindWorkspaceEditors();
    bindLikeButtons(document, likeRecords);
    bindQueueButtons(document, likeRecords);
    scheduleCustomTagSummaryLayout();
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
  const customTagOptions = [
    `<option value="">All Tags</option>`,
    ...customTags.map((tag) => `<option value="${escapeAttribute(tag.key)}">${escapeHtml(tag.label)}</option>`),
  ].join("");
  const statusOptions = [
    `<option value="">All Statuses</option>`,
    ...WORKFLOW_STATUS_OPTIONS.map((item) => `<option value="${escapeAttribute(item.value)}">${escapeHtml(item.label)}</option>`),
  ].join("");
  const priorityOptions = [
    `<option value="">All Priorities</option>`,
    ...PRIORITY_OPTIONS.map((item) => `<option value="${escapeAttribute(item.value)}">${escapeHtml(item.label)}</option>`),
  ].join("");

  customTagFilter.innerHTML = customTagOptions;
  if (inlineCustomTagFilter) {
    inlineCustomTagFilter.innerHTML = customTagOptions;
  }
  statusFilter.innerHTML = statusOptions;
  if (inlineStatusFilter) {
    inlineStatusFilter.innerHTML = statusOptions;
  }
  priorityFilter.innerHTML = priorityOptions;
  if (inlinePriorityFilter) {
    inlinePriorityFilter.innerHTML = priorityOptions;
  }

  sourceFilter.value = sources.includes(currentSource) ? currentSource : "";
  topicFilter.value = topics.includes(currentTopic) ? currentTopic : "";
  customTagFilter.value = customTags.some((tag) => tag.key === currentCustomTag) ? currentCustomTag : "";
  statusFilter.value = WORKFLOW_STATUS_OPTIONS.some((item) => item.value === currentWorkflowStatus) ? currentWorkflowStatus : "";
  priorityFilter.value = PRIORITY_OPTIONS.some((item) => item.value === currentPriorityLevel) ? currentPriorityLevel : "";
  if (inlineCustomTagFilter) {
    inlineCustomTagFilter.value = customTagFilter.value;
  }
  if (inlineStatusFilter) {
    inlineStatusFilter.value = statusFilter.value;
  }
  if (inlinePriorityFilter) {
    inlinePriorityFilter.value = priorityFilter.value;
  }
  searchInput.value = state.query;
  if (inlineSearchInput) {
    inlineSearchInput.value = state.query;
  }
  sortFilter.value = normalizeLikeSortMode(state.sortMode);
  if (inlineSortFilter) {
    inlineSortFilter.value = sortFilter.value;
  }
  state.source = sourceFilter.value;
  state.topic = topicFilter.value;
  state.customTag = customTagFilter.value;
  state.workflowStatus = statusFilter.value;
  state.priorityLevel = priorityFilter.value;
  state.sortMode = sortFilter.value;
}

function renderHero(likes, laterQueue, toReadSnapshots) {
  const heroCount = document.querySelector("#like-hero-count");
  const heroSources = document.querySelector("#like-hero-sources");
  const heroFocus = document.querySelector("#like-hero-focus");
  const heroLatest = document.querySelector("#like-hero-latest");
  const heroTopic = document.querySelector("#like-hero-topic");
  const heroSignals = document.querySelector("#like-hero-signals");
  if (!heroCount && !heroSources && !heroFocus && !heroLatest && !heroTopic && !heroSignals) {
    return;
  }

  const topTopic = computeTopicDistribution(likes)[0];
  const focusCount = likes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const groups = new Set([
    ...likes.map((item) => getLibraryGroupKey(item.source_kind)),
    ...laterQueue.map((item) => getLibraryGroupKey(item.source_kind)),
    ...toReadSnapshots.map((snapshot) => getLibraryGroupKey(getSnapshotSourceKind(snapshot))),
  ].filter(Boolean));
  const latest = likes[0];

  if (heroCount) {
    heroCount.textContent =
      likes.length || laterQueue.length || toReadSnapshots.length
        ? `${likes.length} liked / ${laterQueue.length} later`
        : "0 items";
  }
  if (heroSources) {
    heroSources.textContent = String(groups.size);
  }
  if (heroFocus) {
    heroFocus.textContent = String(laterQueue.length);
  }
  if (heroLatest) {
    heroLatest.textContent = String(toReadSnapshots.length);
  }
  if (heroTopic) {
    heroTopic.textContent = topTopic ? displayTopicLabel(topTopic.topic_label) : "-";
  }

  if (heroSignals) {
    heroSignals.innerHTML = [
    topTopic ? `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(displayTopicLabel(topTopic.topic_label))}</strong></div>` : "",
    likes.length ? `<div class="signal-chip"><span>Liked Papers</span><strong>${likes.length}</strong></div>` : "",
    laterQueue.length ? `<div class="signal-chip"><span>Later Queue</span><strong>${laterQueue.length}</strong></div>` : "",
    toReadSnapshots.length ? `<div class="signal-chip"><span>Unread Snapshots</span><strong>${toReadSnapshots.length}</strong></div>` : "",
    latest ? `<div class="signal-chip"><span>Latest Like</span><strong>${escapeHtml(getSourceLabel(latest.source_kind))}</strong></div>` : "",
  ]
    .filter(Boolean)
    .join("");
  }
}

function renderSourceCards(likes, laterQueue, toReadSnapshots) {
  const root = document.querySelector("#like-home-cards");
  const summary = document.querySelector("#like-board-summary");
  if (!root || !summary) {
    return;
  }
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
  const titleNode = document.querySelector("#like-overview-title");
  const summaryNode = document.querySelector("#like-overview-summary");
  const focusNode = document.querySelector("#like-focus-summary");
  const branchNode = document.querySelector("#like-branch-summary");
  const latestNode = document.querySelector("#like-latest-summary");
  if (!titleNode || !summaryNode || !focusNode || !branchNode || !latestNode) {
    return;
  }

  const focusCount = visibleLikes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const focusShare = visibleLikes.length ? (focusCount / visibleLikes.length) * 100 : 0;
  const latest = getLatestLikedPaper(visibleLikes) || getLatestLikedPaper(likes);
  const topSource = sourceSections[0];

  titleNode.textContent = "Liked Papers Overview";
  summaryNode.textContent = `Currently liked: ${visibleLikes.length} papers for later reading and revisit. ${toReadSnapshots.length} fetched snapshots are still not reviewed.`;
  focusNode.textContent = `${focusCount} papers hit your focus topics, accounting for ${focusShare.toFixed(2)}% of the current view.`;
  branchNode.textContent = topSource
    ? `${escapeHtml(topSource.group_label)} currently has the most liked papers, with ${topSource.liked_count} papers.`
    : "No visible groups yet.";
  latestNode.textContent = latest
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
          const savedViewMeta = describeSavedViewCard(view.filters, state.likes);
          const savedViewScopeNote = getSavedViewScopeNote(view.filters);
          return `
            <button
              class="saved-view-chip${isSelected ? " is-selected" : ""}${isApplied ? " is-applied" : ""}"
              type="button"
              data-saved-view-id="${escapeAttribute(view.view_id)}"
            >
              <span class="saved-view-chip-head">
                <span class="saved-view-chip-name">${escapeHtml(view.name)}</span>
                ${isApplied ? `<span class="saved-view-chip-state">Applied</span>` : isSelected ? `<span class="saved-view-chip-state is-muted">Selected</span>` : ""}
              </span>
              <span class="saved-view-chip-meta">${escapeHtml(savedViewMeta)}</span>
              ${savedViewScopeNote ? `<span class="saved-view-chip-note">${escapeHtml(savedViewScopeNote)}</span>` : ""}
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
  const tagMapRoot = document.querySelector("#like-tag-map");
  if (!tagMapRoot) {
    return;
  }
  const topTopic = topicDistribution[0]?.topic_label || "Other AI";
  const tagCatalog = collectCustomTagCatalog(likes);
  const activeTag = tagCatalog.find((tag) => tag.key === state.customTag) || null;
  tagMapRoot.innerHTML = [
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
  const actionsRoot = document.querySelector("#like-later-actions");
  if (!summary || !root || !actionsRoot) {
    return;
  }

  if (!laterQueue.length) {
    summary.textContent = "No papers in Later queue.";
    root.innerHTML = `<div class="empty-state">Papers marked as Later will appear here.</div>`;
    actionsRoot.innerHTML = "";
    return;
  }

  const visibleCount = readVisibleLikeLaterCount(laterQueue.length);
  const pageItems = laterQueue.slice(0, visibleCount);
  const hasMore = visibleCount < laterQueue.length;
  const canCollapse = visibleCount > Math.min(LATER_SECTION_INITIAL_SIZE, laterQueue.length);

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

  actionsRoot.innerHTML = `
    <div class="conference-subject-footer">
      <span class="conference-subject-progress">Showing ${pageItems.length} of ${laterQueue.length} papers</span>
      <div class="conference-subject-actions">
        ${canCollapse ? `<button class="link-chip button-link" type="button" data-like-later-action="less">Show less</button>` : ""}
        ${hasMore ? `<button class="link-chip button-link" type="button" data-like-later-action="more">Show more</button>` : ""}
      </div>
    </div>
  `;

  actionsRoot.querySelectorAll("[data-like-later-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.likeLaterAction === "more") {
        expandVisibleLikeLaterCount(laterQueue.length);
      } else if (btn.dataset.likeLaterAction === "less") {
        laterVisibleCount = Math.min(LATER_SECTION_INITIAL_SIZE, laterQueue.length);
      }
      renderLaterQueue(laterQueue);
      bindLikeButtons(document, likeRecords);
      bindQueueButtons(document, likeRecords);
    });
  });
}

function renderToReadList(toReadSnapshots) {
  const summary = document.querySelector("#like-to-read-summary");
  const root = document.querySelector("#like-to-read-list");
  const actionsRoot = document.querySelector("#like-to-read-actions");
  if (!summary || !root || !actionsRoot) {
    return;
  }

  if (!toReadSnapshots.length) {
    summary.textContent = "Every fetched snapshot has been reviewed.";
    root.innerHTML = `<div class="empty-state">No unread snapshots remain in your queue.</div>`;
    actionsRoot.innerHTML = "";
    return;
  }

  const visibleCount = readVisibleLikeToReadCount(toReadSnapshots.length);
  const pageItems = toReadSnapshots.slice(0, visibleCount);
  const hasMore = visibleCount < toReadSnapshots.length;
  const canCollapse = visibleCount > Math.min(TO_READ_SECTION_INITIAL_SIZE, toReadSnapshots.length);

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

  actionsRoot.innerHTML = `
    <div class="conference-subject-footer">
      <span class="conference-subject-progress">Showing ${pageItems.length} of ${toReadSnapshots.length} snapshots</span>
      <div class="conference-subject-actions">
        ${canCollapse ? `<button class="link-chip button-link" type="button" data-like-to-read-action="less">Show less</button>` : ""}
        ${hasMore ? `<button class="link-chip button-link" type="button" data-like-to-read-action="more">Show more</button>` : ""}
      </div>
    </div>
  `;

  actionsRoot.querySelectorAll("[data-like-to-read-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.dataset.likeToReadAction === "more") {
        expandVisibleLikeToReadCount(toReadSnapshots.length);
      } else if (btn.dataset.likeToReadAction === "less") {
        toReadVisibleCount = Math.min(TO_READ_SECTION_INITIAL_SIZE, toReadSnapshots.length);
      }
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

function readVisibleLikeLaterCount(totalPapers) {
  const minimum = Math.min(LATER_SECTION_INITIAL_SIZE, totalPapers);
  laterVisibleCount = Math.max(laterVisibleCount, minimum);
  return Math.min(laterVisibleCount, totalPapers);
}

function expandVisibleLikeLaterCount(totalPapers) {
  const current = readVisibleLikeLaterCount(totalPapers);
  const next = Math.min(current + LATER_SECTION_LOAD_MORE_SIZE, totalPapers);
  if (next <= current) {
    return false;
  }
  laterVisibleCount = next;
  return true;
}

function readVisibleLikeToReadCount(totalSnapshots) {
  const minimum = Math.min(TO_READ_SECTION_INITIAL_SIZE, totalSnapshots);
  toReadVisibleCount = Math.max(toReadVisibleCount, minimum);
  return Math.min(toReadVisibleCount, totalSnapshots);
}

function expandVisibleLikeToReadCount(totalSnapshots) {
  const current = readVisibleLikeToReadCount(totalSnapshots);
  const next = Math.min(current + TO_READ_SECTION_LOAD_MORE_SIZE, totalSnapshots);
  if (next <= current) {
    return false;
  }
  toReadVisibleCount = next;
  return true;
}

function renderDistribution(distribution) {
  const root = document.querySelector("#like-distribution-list");
  if (!root) {
    return;
  }
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
  const currentFilterState = getCurrentFilterState();
  const activeFilters = getActiveFilters(currentFilterState, state.likes);
  const hasNarrowingFilters = hasActiveLikeFilters(currentFilterState);
  document.querySelector("#like-results-title").textContent = hasNarrowingFilters
    ? `${visibleLikes.length} visible`
    : `${likes.length} liked papers`;
  document.querySelector("#like-results-stats").innerHTML = [
    renderResultStat(hasNarrowingFilters ? "Visible" : "Liked", visibleLikes.length, hasNarrowingFilters ? `of ${likes.length}` : "full set"),
    renderResultStat("Groups", sourceSections.length, hasNarrowingFilters ? "shown" : "all"),
    renderResultStat("View", state.viewMode === "list" ? "List" : "Gallery"),
    renderResultStat("Sort", getLikeSortLabel(state.sortMode)),
  ].join("");
  document.querySelector("#like-active-filters").innerHTML = activeFilters.length
    ? activeFilters.map((item) => `<span class="active-filter-pill">${escapeHtml(item)}</span>`).join("")
    : "";
  resetFiltersButton.disabled = !activeFilters.length;
  resetFiltersButton.hidden = !activeFilters.length;
}

function renderSourceSections(sections) {
  const root = document.querySelector("#like-source-sections");
  if (!sections.length) {
    root.innerHTML = `<div class="glass-card empty-state">No liked papers match the current filters.</div>`;
    showMoreAutoLoad.refresh();
    return;
  }

  root.innerHTML = sections
    .map(
      (section, index) => {
        const key = section.group_key;
        const visibleCount = readVisibleSourceCount(key, section.papers.length);
        const visiblePapers = section.papers.slice(0, visibleCount);
        const hasMore = visibleCount < section.papers.length;
        const canCollapse = visibleCount > Math.min(SOURCE_SECTION_INITIAL_SIZE, section.papers.length);

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
              ${visiblePapers.map((paper) => (state.viewMode === "list" ? renderLikeListRow(paper) : renderLikeCard(paper))).join("")}
            </div>
            <div class="conference-subject-footer">
              <span class="conference-subject-progress">Showing ${visiblePapers.length} of ${section.papers.length} papers</span>
              <div class="conference-subject-actions">
                ${
                  canCollapse
                    ? `<button class="link-chip button-link" type="button" data-like-source-action="less" data-like-source-section-key="${escapeAttribute(
                        key
                      )}">Show less</button>`
                    : ""
                }
                ${
                  hasMore
                    ? `<button class="link-chip button-link" type="button" data-like-source-action="more" data-like-source-section-key="${escapeAttribute(
                        key
                      )}" data-show-more-auto-load="${escapeAttribute(key)}" data-show-more-total="${section.papers.length}">Show more</button>`
                    : ""
                }
              </div>
            </div>
          </section>
        `;
      }
    )
    .join("");
  showMoreAutoLoad.refresh();

  bindListRowDetails();
}

function bindSourceSectionActions() {
  const root = document.querySelector("#like-source-sections");
  if (!root || root.dataset.bound === "true") {
    return;
  }

  root.dataset.bound = "true";
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-like-source-action]");
    if (!button) {
      return;
    }

    const sectionKey = button.dataset.likeSourceSectionKey || "";
    if (!sectionKey) {
      return;
    }

    const section = findVisibleSourceSection(sectionKey);
    if (!section) {
      return;
    }

    if (button.dataset.likeSourceAction === "more") {
      expandSourceSection(sectionKey, section.papers.length);
    } else if (button.dataset.likeSourceAction === "less") {
      sourceSectionVisibleCounts.set(sectionKey, Math.min(SOURCE_SECTION_INITIAL_SIZE, section.papers.length));
    }

    showMoreAutoLoad.suppress();
    renderPage();
  });
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
      const workspacePanel = body?.querySelector("[data-workspace-panel]");
      if (details.open) {
        openListRowDetails.add(likeId);
        if (body) {
          body.hidden = false;
        }
        if (workspacePanel && !workspacePanelOverrides.has(likeId) && !workspacePanel.open) {
          workspacePanel.open = true;
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
      ${view.customTagSummary}
      <div class="liked-paper-card-copy">
        <div class="paper-authors-box">
          <span class="paper-detail-label">Authors</span>
          <p class="paper-authors-line">${view.authors}</p>
        </div>
        ${summaryNote ? `<p class="liked-paper-card-note">${escapeHtml(summaryNote)}</p>` : ""}
      </div>
      ${view.abstract}
      <div class="liked-paper-card-secondary">
        ${renderWorkspacePanel(view)}
      </div>
    </article>
  `;
}

function renderLikeListRow(paper) {
  const view = buildLikePaperViewModel(paper);
  const rowOpen = openListRowDetails.has(view.paper.like_id);
  const takeawayText = view.takeaway || "";
  const summaryText = takeawayText || (rowOpen ? view.nextAction || "" : "");
  const abstractBlock = view.paper.abstract
    ? `
      <div class="liked-paper-row-abstract">
        <span class="paper-detail-label">Abstract</span>
        <p>${escapeHtml(view.paper.abstract)}</p>
      </div>
    `
    : "";

  return `
    <article class="liked-paper-row${rowOpen ? "" : " is-compact"}">
      <div class="liked-paper-row-main">
        <div class="liked-paper-row-copy">
          <div class="liked-paper-row-top">${view.metaBadges}${renderWorkspaceSummaryTags(view, { includeQueue: false })}</div>
          <h4>${escapeHtml(view.paper.title)}</h4>
          ${view.customTagSummary}
          ${rowOpen ? `<p class="liked-paper-row-authors">${view.authors}</p>` : ""}
          ${summaryText ? `<p class="liked-paper-row-summary">${escapeHtml(summaryText)}</p>` : ""}
        </div>
        <div class="liked-paper-row-actions">
          <div class="paper-links liked-paper-row-links">${view.links}</div>
          <details class="liked-paper-row-details" data-like-row-details="${escapeAttribute(view.paper.like_id)}"${rowOpen ? " open" : ""}>
            <summary>
              <span class="paper-abstract-label">${rowOpen ? "Hide" : "Details"}</span>
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
        ${abstractBlock}
        ${renderWorkspacePanel(view, { showSummaryTags: false })}
      </div>
    </article>
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

function renderWorkspaceSummaryTags(view, { includeQueue = true } = {}) {
  return [
    includeQueue && view.inLater ? renderWorkspaceSummaryTag("Queued", "status-inbox") : "",
    renderWorkspaceSummaryTag(view.statusLabel, view.statusTone),
    renderWorkspaceSummaryTag(view.priorityLabel, view.priorityTone),
  ]
    .filter(Boolean)
    .join("");
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
  if (customTagSummaryFrame) {
    return;
  }
  customTagSummaryFrame = window.requestAnimationFrame(() => {
    customTagSummaryFrame = 0;
    layoutCustomTagSummaries();
  });
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
    paper.snapshot_label ? `<span class="paper-badge subdued">${escapeHtml(paper.snapshot_label)}</span>` : "",
    inLater ? `<span class="paper-badge queued-badge">Queued</span>` : "",
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
    inLater,
    authors,
    abstract,
    metaBadges,
    links,
    customTagSummary: renderCustomTagSummary(customTags),
    customTagCount: customTags.length,
    tagChips,
    tagOptions,
    tagCatalog,
    availableTagCount: tagCatalog.filter((tag) => !customTags.some((item) => item.key === tag.key)).length,
    tagPaletteCount: tagCatalog.length,
    manageItems,
    paletteButtons,
    statusValue,
    priorityValue,
    statusLabel: getWorkflowStatusLabel(paper.workflow_status),
    priorityLabel: getPriorityLabel(paper.priority_level),
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
          <label class="paper-workspace-card paper-workspace-field">
            <span class="paper-detail-label">Takeaway</span>
            <textarea class="paper-workspace-textarea" rows="2" data-workspace-takeaway="${escapeAttribute(view.paper.like_id)}" placeholder="Capture the one-line reason this paper matters.">${escapeHtml(view.takeaway)}</textarea>
          </label>
          <label class="paper-workspace-card paper-workspace-field">
            <span class="paper-detail-label">Next Action</span>
            <textarea class="paper-workspace-textarea" rows="2" data-workspace-next-action="${escapeAttribute(view.paper.like_id)}" placeholder="Leave a concrete follow-up step for yourself.">${escapeHtml(view.nextAction)}</textarea>
          </label>
        </div>
      </div>
    </details>
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
      meta.textContent =
        visibleCount === 1 ? "1 matching tag" : `${visibleCount} matching tags`;
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
      const tag = collectCustomTagCatalog(state.likes).find((item) => item.key === tagKey);
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
    input.addEventListener("input", () => {
      updateTagOptionFiltering(input.dataset.tagInput, input.value);
    });
    input.addEventListener("keydown", (event) => {
      const likeId = input.dataset.tagInput;
      if (event.key === "Escape") {
        event.preventDefault();
        hideAllTagPopovers();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActiveTagOption(likeId, 1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActiveTagOption(likeId, -1);
        return;
      }
      if (event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      const activeOption = getVisibleTagOptionButtons(likeId).find((button) => button.classList.contains("is-active"));
      if (activeOption) {
        activeOption.click();
        return;
      }
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
      const editor = document.querySelector(`[data-tag-editor="${CSS.escape(likeId)}"]`);
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
  const tag = collectCustomTagCatalog(state.likes).find((item) => item.key === editorTagKey);
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

function isWorkspacePanelOpen(likeId) {
  if (workspacePanelOverrides.has(likeId)) {
    return workspacePanelOverrides.get(likeId) === true;
  }
  return state.workspacePanelDefaultMode !== "collapsed";
}

function updateCustomTagDefinition(tagKey, nextDefinition) {
  const key = String(tagKey || "").trim();
  if (!key) {
    return null;
  }

  return updateLikedPapers((record) => updateCustomTagDefinitionInRecord(record, key, nextDefinition));
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
  return updateLikedPapers((record) => reorderCustomTagsInRecord(record, orderedKeys));
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

  const result = updateLikedPapers((record) => mergeCustomTagsInRecord(record, source, targetTag));

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
  updateLikedPaper(likeId, (record) => applyCustomTagToRecord(record, tag));
}

function removeTagFromPaper(likeId, tagKey) {
  updateLikedPaper(likeId, (record) => removeCustomTagFromRecord(record, tagKey));
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
      const latestLikedPaper = getLatestLikedPaper(papers);
      return {
        group_key,
        group_label: getLibraryGroupLabel(group_key),
        liked_count: papers.length,
        latest_snapshot: latestLikedPaper?.snapshot_label || "",
        latest_liked: formatDateTime(latestLikedPaper?.liked_at || latestLikedPaper?.saved_at, LIKE_TIME_FORMAT),
        top_topic: distribution[0]?.topic_label || "",
        papers,
      };
    })
    .sort((a, b) => b.liked_count - a.liked_count || a.group_label.localeCompare(b.group_label, "en"));
}

function getLatestLikedPaper(likes) {
  return sortLikes(likes, "saved_desc")[0] || null;
}

function hasActiveLikeFilters(filterState) {
  return Boolean(
    filterState.source ||
      filterState.topic ||
      filterState.customTag ||
      filterState.workflowStatus ||
      filterState.priorityLevel ||
      filterState.query
  );
}

function getCurrentVisibleSourceSections() {
  return groupBySource(getVisibleLikes(state.likes));
}

function findVisibleSourceSection(sectionKey) {
  return getCurrentVisibleSourceSections().find((section) => section.group_key === sectionKey) || null;
}

function readVisibleSourceCount(sectionKey, totalPapers) {
  const minimum = Math.min(SOURCE_SECTION_INITIAL_SIZE, totalPapers);
  const current = sourceSectionVisibleCounts.get(sectionKey);
  if (typeof current === "number" && current > 0) {
    return Math.min(current, totalPapers);
  }
  sourceSectionVisibleCounts.set(sectionKey, minimum);
  return minimum;
}

function expandSourceSection(sectionKey, totalPapers) {
  const current = readVisibleSourceCount(sectionKey, totalPapers);
  const next = Math.min(current + SOURCE_SECTION_LOAD_MORE_SIZE, totalPapers);
  if (next <= current) {
    return false;
  }
  sourceSectionVisibleCounts.set(sectionKey, next);
  return true;
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
    <article class="like-results-pill">
      <span class="like-results-pill-label">${escapeHtml(label)}</span>
      <strong class="like-results-pill-value">${escapeHtml(String(value))}</strong>
      ${meta ? `<span class="like-results-pill-meta">${escapeHtml(meta)}</span>` : ""}
    </article>
  `;
}

function renderEmpty(toReadSnapshots) {
  const overviewSummary = document.querySelector("#like-overview-summary");
  const focusSummary = document.querySelector("#like-focus-summary");
  const branchSummary = document.querySelector("#like-branch-summary");
  const latestSummary = document.querySelector("#like-latest-summary");
  const tagMapRoot = document.querySelector("#like-tag-map");
  const distributionRoot = document.querySelector("#like-distribution-list");
  const resultsTitle = document.querySelector("#like-results-title");
  const resultsStats = document.querySelector("#like-results-stats");
  const activeFilters = document.querySelector("#like-active-filters");
  const sourceSections = document.querySelector("#like-source-sections");

  if (overviewSummary) {
    overviewSummary.textContent = "No liked papers yet.";
  }
  if (focusSummary) {
    focusSummary.textContent = "This area will populate after you like papers.";
  }
  if (branchSummary) {
    branchSummary.textContent = "No group distribution yet.";
  }
  if (latestSummary) {
    latestSummary.textContent = "No latest like record yet.";
  }
  if (tagMapRoot) {
    tagMapRoot.innerHTML = "";
  }
  if (distributionRoot) {
    distributionRoot.innerHTML = `<div class="empty-state">No like statistics yet.</div>`;
  }
  if (resultsTitle) {
    resultsTitle.textContent = "No liked papers yet";
  }
  if (resultsStats) {
    resultsStats.innerHTML = "";
  }
  if (activeFilters) {
    activeFilters.innerHTML = `<span class="active-filter-pill">Like any paper and this area will update automatically.</span>`;
  }
  if (sourceSections) {
    sourceSections.innerHTML = `<div class="glass-card empty-state">Click Like in Cool Daily, Conference, or HF Daily to add papers here.</div>`;
  }
  resetFiltersButton.disabled = true;
  resetFiltersButton.hidden = true;
}

function getCurrentFilterState() {
  return normalizeFilterState({
    source: state.source,
    topic: state.topic,
    customTag: state.customTag,
    workflowStatus: state.workflowStatus,
    priorityLevel: state.priorityLevel,
    query: state.query,
    sortMode: state.sortMode,
    viewMode: state.viewMode,
  });
}

function resetAllFilters() {
  state.source = "";
  state.topic = "";
  clearQuickFilters();
  sourceFilter.value = "";
  topicFilter.value = "";
}

function clearQuickFilters() {
  state.customTag = "";
  state.workflowStatus = "";
  state.priorityLevel = "";
  state.query = "";
  state.sortMode = "saved_desc";
  customTagFilter.value = "";
  statusFilter.value = "";
  priorityFilter.value = "";
  searchInput.value = "";
  sortFilter.value = state.sortMode;
  if (inlineCustomTagFilter) {
    inlineCustomTagFilter.value = "";
  }
  if (inlineStatusFilter) {
    inlineStatusFilter.value = "";
  }
  if (inlinePriorityFilter) {
    inlinePriorityFilter.value = "";
  }
  if (inlineSearchInput) {
    inlineSearchInput.value = "";
  }
  if (inlineSortFilter) {
    inlineSortFilter.value = state.sortMode;
  }
}

function describeSavedViewCard(filters, likes) {
  const normalized = normalizeFilterState(filters);
  const parts = [];
  if (normalized.customTag) {
    const tag = collectCustomTagCatalog(likes).find((item) => item.key === normalized.customTag);
    parts.push(tag?.label || normalized.customTag);
  }
  if (normalized.workflowStatus) {
    parts.push(getWorkflowStatusLabel(normalized.workflowStatus));
  }
  if (normalized.priorityLevel) {
    parts.push(getPriorityLabel(normalized.priorityLevel));
  }
  if (normalized.query) {
    parts.push(`Search: ${normalized.query}`);
  }
  if (normalized.sortMode !== "saved_desc") {
    parts.push(getLikeSortLabel(normalized.sortMode));
  }
  if (normalized.viewMode === "list") {
    parts.push("List");
  }
  return parts.length ? parts.join(" · ") : "Default browse";
}

function getSavedViewScopeNote(filters) {
  const normalized = normalizeFilterState(filters);
  if (normalized.source || normalized.topic) {
    return "Includes scope filters from the toolbar";
  }
  return "";
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
  state.sortMode = filters.sortMode;
  state.viewMode = filters.viewMode;
  setPageViewMode("like", filters.viewMode, { persist: true, notify: false });
  sourceFilter.value = state.source;
  topicFilter.value = state.topic;
  customTagFilter.value = state.customTag;
  statusFilter.value = state.workflowStatus;
  priorityFilter.value = state.priorityLevel;
  searchInput.value = state.query;
  sortFilter.value = state.sortMode;
  if (inlineCustomTagFilter) {
    inlineCustomTagFilter.value = state.customTag;
  }
  if (inlineStatusFilter) {
    inlineStatusFilter.value = state.workflowStatus;
  }
  if (inlinePriorityFilter) {
    inlinePriorityFilter.value = state.priorityLevel;
  }
  if (inlineSearchInput) {
    inlineSearchInput.value = state.query;
  }
  if (inlineSortFilter) {
    inlineSortFilter.value = state.sortMode;
  }
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
