import { readLikes, updateLikedPaper } from "./likes.js?v=010cf1b2c9";
import { readQueue, updateQueuedPaper } from "./paper_queue.js?v=033bd186d1";
import { movePaperToLikes, movePaperToLater } from "./paper_selection.js?v=964dbe6c53";
import {
  PRIORITY_OPTIONS,
  WORKFLOW_STATUS_OPTIONS,
  getPriorityLabel,
  getPriorityValue,
  getWorkflowStatusLabel,
  getWorkflowStatusValue,
} from "./like_page_labels.js?v=aaa244a29d";
import { readWorkspacePanelDefaultMode, subscribeUserSettings } from "./user_settings.js?v=6c7496f04b";
import { escapeAttribute, escapeHtml } from "./ui_utils.js?v=e2da3b3a11";
import { renderWorkspaceMarkdownPreviewContent } from "./workspace_markdown.js?v=7d091b73bd";

let workspacePanelDefaultMode = readWorkspacePanelDefaultMode();
const workspacePanelOverrides = new Map();
const pendingWorkspaceEditorActivations = new Map();
let workspaceSettingsBound = false;

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
  const tags = [];

  if (view.libraryLabel) {
    tags.push(renderWorkspaceSummaryTag(view.libraryLabel, view.libraryTone));
  }
  if (view.statusLabel) {
    tags.push(renderWorkspaceSummaryTag(view.statusLabel, view.statusTone));
  }
  if (view.priorityLabel) {
    tags.push(renderWorkspaceSummaryTag(view.priorityLabel, view.priorityTone));
  }

  return tags.join("");
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

function buildWorkspaceView(record, sourceKind) {
  const statusValue = getWorkflowStatusValue(record.workflow_status);
  const priorityValue = getPriorityValue(record.priority_level);

  return {
    record,
    sourceKind,
    statusValue,
    priorityValue,
    statusLabel: getWorkflowStatusLabel(statusValue),
    priorityLabel: getPriorityLabel(priorityValue),
    statusTone: getWorkspaceStatusTone(statusValue),
    priorityTone: getWorkspacePriorityTone(priorityValue),
    libraryLabel: sourceKind === "like" ? "Liked" : "Later",
    libraryTone: sourceKind === "like" ? "workspace-origin-liked" : "workspace-origin-later",
    statusButtons: WORKFLOW_STATUS_OPTIONS.map(
      (item) => `
        <button
          class="paper-workspace-segment ${escapeAttribute(getWorkspaceStatusTone(item.value))}${statusValue === item.value ? " is-selected" : ""}"
          type="button"
          data-workspace-status-option="${escapeAttribute(record.like_id)}"
          data-workspace-value="${escapeAttribute(item.value)}"
        >
          <span class="paper-workspace-segment-dot" aria-hidden="true"></span>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `
    ).join(""),
    priorityButtons: PRIORITY_OPTIONS.map(
      (item) => `
        <button
          class="paper-workspace-segment ${escapeAttribute(getWorkspacePriorityTone(item.value))}${priorityValue === item.value ? " is-selected" : ""}"
          type="button"
          data-workspace-priority-option="${escapeAttribute(record.like_id)}"
          data-workspace-value="${escapeAttribute(item.value)}"
        >
          <span class="paper-workspace-segment-dot" aria-hidden="true"></span>
          <span>${escapeHtml(item.label)}</span>
        </button>
      `
    ).join(""),
    takeaway: record.one_line_takeaway || "",
    nextAction: record.next_action || "",
  };
}

function renderTrackedWorkspacePanel(view) {
  const panelOpen = isWorkspacePanelOpen(view.record.like_id);
  return `
    <details class="paper-workspace-panel branch-workspace-panel" data-workspace-panel="${escapeAttribute(view.record.like_id)}"${
      panelOpen ? " open" : ""
    }>
      <summary class="paper-workspace-header">
        <div class="paper-workspace-header-copy">
          <span class="paper-detail-label">Workspace</span>
        </div>
        <div class="paper-workspace-header-right">
          <div class="paper-workspace-summary">${renderWorkspaceSummaryTags(view)}</div>
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
            <input type="hidden" data-workspace-status="${escapeAttribute(view.record.like_id)}" value="${escapeAttribute(view.statusValue)}" />
            <div class="paper-workspace-segmented" role="tablist" aria-label="Status">
              ${view.statusButtons}
            </div>
          </div>
          <div class="paper-workspace-field paper-workspace-choice">
            <span class="paper-detail-label">Priority</span>
            <input
              type="hidden"
              data-workspace-priority="${escapeAttribute(view.record.like_id)}"
              value="${escapeAttribute(view.priorityValue)}"
            />
            <div class="paper-workspace-segmented" role="tablist" aria-label="Priority">
              ${view.priorityButtons}
            </div>
          </div>
        </div>
        <div class="paper-workspace-grid">
          ${renderWorkspaceMarkdownField({
            likeId: view.record.like_id,
            field: "takeaway",
            label: "Takeaway",
            value: view.takeaway,
            placeholder: "Capture the one-line reason this item matters.",
          })}
          ${renderWorkspaceMarkdownField({
            likeId: view.record.like_id,
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

function renderEmptyWorkspacePanel(likeId) {
  const panelOpen = isWorkspacePanelOpen(likeId);
  return `
    <details class="paper-workspace-panel branch-workspace-panel is-empty" data-workspace-panel="${escapeAttribute(likeId)}"${
      panelOpen ? " open" : ""
    }>
      <summary class="paper-workspace-header">
        <div class="paper-workspace-header-copy">
          <span class="paper-detail-label">Workspace</span>
        </div>
        <div class="paper-workspace-header-right">
          <div class="paper-workspace-summary">
            ${renderWorkspaceSummaryTag("Not saved", "status-inbox")}
          </div>
          <span class="paper-workspace-chevron" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="16" height="16">
              <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </span>
        </div>
      </summary>
      <div class="paper-workspace-body">
        <div class="branch-workspace-empty">
          <p class="branch-workspace-empty-copy">Save this item to Later or Like first, then edit workflow state and notes here.</p>
          <div class="branch-workspace-empty-actions">
            <button
              class="branch-workspace-start branch-workspace-start-primary"
              type="button"
              data-branch-workspace-start="later"
              data-branch-workspace-start-id="${escapeAttribute(likeId)}"
            >
              Start in Later
            </button>
            <button
              class="branch-workspace-start"
              type="button"
              data-branch-workspace-start="like"
              data-branch-workspace-start-id="${escapeAttribute(likeId)}"
            >
              Save as Like
            </button>
          </div>
        </div>
      </div>
    </details>
  `;
}

export function createBranchWorkspaceLookup() {
  const likedById = new Map(safeReadLikes().map((record) => [record.like_id, record]));
  const queuedById = new Map(safeReadQueue().map((record) => [record.like_id, record]));

  return {
    likedById,
    queuedById,
    get(likeId) {
      const normalizedLikeId = String(likeId || "").trim();
      if (!normalizedLikeId) {
        return { sourceKind: "", record: null };
      }
      if (likedById.has(normalizedLikeId)) {
        return {
          sourceKind: "like",
          record: likedById.get(normalizedLikeId),
        };
      }
      if (queuedById.has(normalizedLikeId)) {
        return {
          sourceKind: "later",
          record: queuedById.get(normalizedLikeId),
        };
      }
      return { sourceKind: "", record: null };
    },
  };
}

export function initBranchWorkspace({ onSettingsChange } = {}) {
  if (workspaceSettingsBound) {
    return;
  }
  workspaceSettingsBound = true;
  subscribeUserSettings((snapshot) => {
    const nextMode = snapshot?.workspacePanelDefaultMode || "expanded";
    if (workspacePanelDefaultMode === nextMode) {
      return;
    }
    workspacePanelDefaultMode = nextMode;
    if (typeof onSettingsChange === "function") {
      onSettingsChange();
    }
  });
}

export function renderBranchWorkspacePanel(likeId, workspaceLookup = createBranchWorkspaceLookup()) {
  const normalizedLikeId = String(likeId || "").trim();
  if (!normalizedLikeId) {
    return "";
  }

  const workspaceEntry = workspaceLookup.get(normalizedLikeId);
  if (!workspaceEntry.record) {
    return renderEmptyWorkspacePanel(normalizedLikeId);
  }

  return renderTrackedWorkspacePanel(buildWorkspaceView(workspaceEntry.record, workspaceEntry.sourceKind));
}

export function bindBranchWorkspace(root = document, { recordLookup } = {}) {
  if (!root?.querySelectorAll) {
    return;
  }

  bindWorkspacePanels(root);

  root.querySelectorAll("[data-workspace-editor-toggle]").forEach((surface) => {
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

  root.querySelectorAll("[data-workspace-status-option], [data-workspace-priority-option]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const likeId = button.dataset.workspaceStatusOption || button.dataset.workspacePriorityOption || "";
      const nextValue = button.dataset.workspaceValue || "";
      if (!likeId) {
        return;
      }
      if (button.dataset.workspaceStatusOption) {
        const input = root.querySelector(`[data-workspace-status="${escapeSelectorValue(likeId)}"]`);
        if (input) {
          input.value = nextValue;
        }
      }
      if (button.dataset.workspacePriorityOption) {
        const input = root.querySelector(`[data-workspace-priority="${escapeSelectorValue(likeId)}"]`);
        if (input) {
          input.value = nextValue;
        }
      }
      saveWorkspaceFields(likeId, readWorkspaceFieldValues(root, likeId));
    });
  });

  root.querySelectorAll("[data-workspace-takeaway], [data-workspace-next-action]").forEach((field) => {
    if (field.dataset.bound === "true") {
      return;
    }
    field.dataset.bound = "true";
    field.addEventListener("input", () => {
      const likeId = field.dataset.workspaceTakeaway || field.dataset.workspaceNextAction || "";
      if (!likeId) {
        return;
      }
      updateWorkspaceMarkdownPreview(
        root,
        likeId,
        field.dataset.workspaceTakeaway ? "takeaway" : "next-action",
        field.value
      );
    });
    field.addEventListener("blur", () => {
      field.closest("[data-workspace-markdown-field]")?.classList.remove("is-editing");
    });
    field.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      field.blur();
    });
    field.addEventListener("change", () => {
      const likeId = field.dataset.workspaceTakeaway || field.dataset.workspaceNextAction || "";
      if (!likeId) {
        return;
      }
      saveWorkspaceFields(likeId, readWorkspaceFieldValues(root, likeId));
    });
  });

  root.querySelectorAll("[data-branch-workspace-start]").forEach((button) => {
    if (button.dataset.bound === "true") {
      return;
    }
    button.dataset.bound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const likeId = button.dataset.branchWorkspaceStartId || "";
      const target = button.dataset.branchWorkspaceStart === "like" ? "like" : "later";
      const sourceRecord = resolveBranchRecord(recordLookup, likeId);
      if (!likeId || !sourceRecord) {
        return;
      }
      workspacePanelOverrides.set(likeId, true);
      pendingWorkspaceEditorActivations.set(likeId, "takeaway");
      if (target === "like") {
        movePaperToLikes(sourceRecord);
        return;
      }
      movePaperToLater(sourceRecord);
    });
  });

  flushPendingWorkspaceEditorActivations(root);
}

function bindWorkspacePanels(root) {
  root.querySelectorAll("[data-workspace-panel]").forEach((details) => {
    if (details.dataset.workspaceBound === "true") {
      return;
    }
    details.dataset.workspaceBound = "true";
    details.addEventListener("toggle", () => {
      const likeId = details.dataset.workspacePanel || "";
      if (!likeId) {
        return;
      }
      workspacePanelOverrides.set(likeId, details.open);
    });
  });
}

function resolveBranchRecord(recordLookup, likeId) {
  if (!recordLookup?.get || !likeId) {
    return null;
  }

  const entry = recordLookup.get(likeId);
  if (!entry) {
    return null;
  }

  if (entry.like_id) {
    return entry;
  }

  if (entry.paper?.like_id) {
    return entry.paper;
  }

  return null;
}

function readWorkspaceFieldValues(root, likeId) {
  return {
    workflow_status: root.querySelector(`[data-workspace-status="${escapeSelectorValue(likeId)}"]`)?.value || "inbox",
    priority_level: root.querySelector(`[data-workspace-priority="${escapeSelectorValue(likeId)}"]`)?.value || "medium",
    one_line_takeaway: root.querySelector(`[data-workspace-takeaway="${escapeSelectorValue(likeId)}"]`)?.value || "",
    next_action: root.querySelector(`[data-workspace-next-action="${escapeSelectorValue(likeId)}"]`)?.value || "",
  };
}

function saveWorkspaceFields(likeId, nextFields) {
  const workspaceEntry = createBranchWorkspaceLookup().get(likeId);
  if (!workspaceEntry.record) {
    return null;
  }

  const updater = (record) => {
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
      return record;
    }

    return {
      ...record,
      workflow_status: workflowStatus,
      priority_level: priorityLevel,
      one_line_takeaway: takeaway,
      next_action: nextAction,
    };
  };

  if (workspaceEntry.sourceKind === "like") {
    return updateLikedPaper(likeId, updater);
  }
  if (workspaceEntry.sourceKind === "later") {
    return updateQueuedPaper(likeId, updater);
  }
  return null;
}

function updateWorkspaceMarkdownPreview(root, likeId, fieldName, value) {
  const preview = root.querySelector(
    `[data-workspace-preview-id="${escapeSelectorValue(likeId)}"][data-workspace-preview-field="${escapeSelectorValue(fieldName)}"]`
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
  const focusEditor = () => {
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(focusEditor);
    return;
  }
  setTimeout(focusEditor, 0);
}

function flushPendingWorkspaceEditorActivations(root) {
  if (!pendingWorkspaceEditorActivations.size || !root?.querySelector) {
    return;
  }

  const pendingEntries = [...pendingWorkspaceEditorActivations.entries()];
  pendingWorkspaceEditorActivations.clear();
  const activatePending = () => {
    pendingEntries.forEach(([likeId, fieldName]) => {
      const surface = root.querySelector(
        `[data-workspace-preview-id="${escapeSelectorValue(likeId)}"][data-workspace-preview-field="${escapeSelectorValue(fieldName)}"]`
      );
      if (surface) {
        activateWorkspaceMarkdownEditor(surface);
      }
    });
  };

  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(activatePending);
    return;
  }
  setTimeout(activatePending, 0);
}

function isWorkspacePanelOpen(likeId) {
  if (workspacePanelOverrides.has(likeId)) {
    return workspacePanelOverrides.get(likeId) === true;
  }
  return workspacePanelDefaultMode !== "collapsed";
}

function escapeSelectorValue(value) {
  const raw = String(value || "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(raw);
  }
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeReadLikes() {
  try {
    return readLikes();
  } catch (_error) {
    return [];
  }
}

function safeReadQueue() {
  try {
    return readQueue("later");
  } catch (_error) {
    return [];
  }
}
