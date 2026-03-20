import { collectCustomTagCatalog } from "./like_page_tags.js?v=dce6e52df9";
import {
  PRIORITY_OPTIONS,
  WORKFLOW_STATUS_OPTIONS,
  displayTopicLabel,
  getLibraryGroupLabel,
  getPriorityLabel,
  getWorkflowStatusLabel,
} from "./like_page_labels.js?v=aaa244a29d";
import { getLikeSortLabel, normalizeLikeSortMode } from "./like_page_sorting.js?v=6ae385c61b";

export function normalizeFilterState(value) {
  const workflowStatus = String(value.workflowStatus || "").trim();
  const priorityLevel = String(value.priorityLevel || "").trim();
  const viewMode = String(value.viewMode || "").trim().toLowerCase();
  return {
    source: String(value.source || "").trim(),
    topic: String(value.topic || "").trim(),
    customTag: String(value.customTag || "").trim(),
    workflowStatus: workflowStatus && WORKFLOW_STATUS_OPTIONS.some((item) => item.value === workflowStatus) ? workflowStatus : "",
    priorityLevel: priorityLevel && PRIORITY_OPTIONS.some((item) => item.value === priorityLevel) ? priorityLevel : "",
    query: String(value.query || "").trim().toLowerCase(),
    sortMode: normalizeLikeSortMode(value.sortMode),
    viewMode: viewMode === "list" ? "list" : "card",
  };
}

export function areFilterStatesEqual(left, right) {
  const nextLeft = normalizeFilterState(left);
  const nextRight = normalizeFilterState(right);
  return (
    nextLeft.source === nextRight.source &&
    nextLeft.topic === nextRight.topic &&
    nextLeft.customTag === nextRight.customTag &&
    nextLeft.workflowStatus === nextRight.workflowStatus &&
    nextLeft.priorityLevel === nextRight.priorityLevel &&
    nextLeft.query === nextRight.query &&
    nextLeft.sortMode === nextRight.sortMode &&
    nextLeft.viewMode === nextRight.viewMode
  );
}

export function describeSavedView(filters, likes) {
  const normalized = normalizeFilterState(filters);
  const parts = [];
  if (normalized.source) {
    parts.push(getLibraryGroupLabel(normalized.source));
  }
  if (normalized.topic) {
    parts.push(displayTopicLabel(normalized.topic));
  }
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
    parts.push("Search");
  }
  if (normalized.sortMode !== "saved_desc") {
    parts.push(getLikeSortLabel(normalized.sortMode));
  }
  parts.push(normalized.viewMode === "list" ? "List" : "Gallery");
  return parts.length ? parts.join(" · ") : "Full scan";
}

export function getActiveFilters(filterState, likes) {
  const filters = [];
  if (filterState.source) {
    filters.push(`Group: ${getLibraryGroupLabel(filterState.source)}`);
  }
  if (filterState.workflowStatus) {
    filters.push(`Status: ${getWorkflowStatusLabel(filterState.workflowStatus)}`);
  }
  if (filterState.priorityLevel) {
    filters.push(`Priority: ${getPriorityLabel(filterState.priorityLevel)}`);
  }
  if (filterState.customTag) {
    const tag = collectCustomTagCatalog(likes).find((item) => item.key === filterState.customTag);
    filters.push(`Custom Tag: ${tag?.label || filterState.customTag}`);
  }
  if (filterState.topic) {
    filters.push(`Topic: ${displayTopicLabel(filterState.topic)}`);
  }
  if (filterState.query) {
    filters.push(`Search: ${filterState.query}`);
  }
  if (filterState.sortMode !== "saved_desc") {
    filters.push(`Sort: ${getLikeSortLabel(filterState.sortMode)}`);
  }
  return filters;
}

export function createSavedViewId() {
  return `view_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
