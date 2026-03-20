import { readDetailPanelDefaultMode } from "./user_settings.js?v=0f028ca95d";

const branchDetailOverrides = new Map();

function escapeAttribute(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function shouldOpenBranchDetail(key = "") {
  if (key && branchDetailOverrides.has(key)) {
    return branchDetailOverrides.get(key) === true;
  }
  return readDetailPanelDefaultMode() === "expanded";
}

export function renderBranchListDetails(content, { label = "Details", openLabel = "Hide", detailKey = "" } = {}) {
  const body = typeof content === "string" ? content.trim() : "";
  if (!body) {
    return "";
  }

  const key = typeof detailKey === "string" ? detailKey.trim() : "";
  const isOpen = shouldOpenBranchDetail(key);
  const closedLabel = typeof label === "string" && label.trim() ? label.trim() : "Details";
  const expandedLabel = typeof openLabel === "string" && openLabel.trim() ? openLabel.trim() : "Hide";

  return `
    <div class="branch-card-details-shell">
      <details
        class="branch-card-details"
        data-branch-card-details="${escapeAttribute(key)}"
        data-branch-card-label="${escapeAttribute(closedLabel)}"
        data-branch-card-open-label="${escapeAttribute(expandedLabel)}"${isOpen ? " open" : ""}
      >
        <summary>
          <span class="paper-abstract-label">${isOpen ? expandedLabel : closedLabel}</span>
          <span class="branch-card-details-arrow paper-abstract-arrow" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="14" height="14">
              <path d="M5.5 7.5L10 12l4.5-4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
          </span>
        </summary>
      </details>
      <div class="branch-card-details-body" data-branch-card-details-body${isOpen ? "" : " hidden"}>
        ${body}
      </div>
    </div>
  `;
}

export function renderBranchDetailSection({ label, body, muted = false } = {}) {
  const title = typeof label === "string" ? label.trim() : "";
  const content = typeof body === "string" ? body.trim() : "";
  if (!title || !content) {
    return "";
  }

  return `
    <section class="branch-card-detail-section">
      <span class="paper-detail-label">${title}</span>
      <div class="branch-card-detail-body">
        <p class="branch-card-detail-copy${muted ? " is-muted" : ""}">${content}</p>
      </div>
    </section>
  `;
}

export function renderBranchDetailGroup({ label, body } = {}) {
  const title = typeof label === "string" ? label.trim() : "";
  const content = typeof body === "string" ? body.trim() : "";
  if (!title || !content) {
    return "";
  }

  return `
    <section class="branch-card-detail-section">
      <span class="paper-detail-label">${title}</span>
      <div class="branch-card-detail-body">
        ${content}
      </div>
    </section>
  `;
}

export function bindBranchListDetails(root = document) {
  if (!root?.querySelectorAll) {
    return;
  }

  root.querySelectorAll("[data-branch-card-details]").forEach((details) => {
    if (details.dataset.bound === "true") {
      return;
    }
    details.dataset.bound = "true";
    details.addEventListener("toggle", () => {
      const detailKey = details.dataset.branchCardDetails || "";
      const body = details.closest(".branch-card-details-shell")?.querySelector("[data-branch-card-details-body]");
      const labelNode = details.querySelector(".paper-abstract-label");
      const closedLabel = details.dataset.branchCardLabel || "Details";
      const openLabel = details.dataset.branchCardOpenLabel || "Hide";

      if (details.open) {
        if (detailKey) {
          branchDetailOverrides.set(detailKey, true);
        }
        if (body) {
          body.hidden = false;
        }
        if (labelNode) {
          labelNode.textContent = openLabel;
        }
      } else {
        if (detailKey) {
          branchDetailOverrides.set(detailKey, false);
        }
        if (body) {
          body.hidden = true;
        }
        if (labelNode) {
          labelNode.textContent = closedLabel;
        }
      }
    });
  });
}
