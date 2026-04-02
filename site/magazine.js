import { mountAppToolbar } from "./app_toolbar.js?v=c5124e8940";
import { createBranchReviewController, initBranchReportPage } from "./branch_page.js?v=f27a328acc";
import { createFloatingTocController } from "./floating_toc.js?v=a9ffd5aa93";
import { validateMagazineManifest, validateMagazineReport } from "./site_contract.js?v=be9ddc76a7";
import { escapeAttribute, escapeHtml, fetchJson, formatZhTime, getErrorMessage } from "./ui_utils.js?v=e2da3b3a11";
import { renderWorkspaceMarkdown } from "./workspace_markdown.js?v=7d091b73bd";

mountAppToolbar("#magazine-toolbar-root", {
  prefix: "magazine",
  filtersTemplateId: "magazine-toolbar-filters",
  branchActiveKey: "magazine",
  libraryActiveKey: null,
});

const manifestUrl = "./data/magazine/manifest.json";
const MAGAZINE_ARCHIVE_MAX_CARDS = 6;

const state = {
  manifest: null,
  report: null,
  currentPath: "",
};

const reportSelect = document.querySelector("#magazine-report-select");
const sidebarToggleButton = document.querySelector("#magazine-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#magazine-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#magazine-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#magazine-filters-menu");
const backToTopButton = document.querySelector("#magazine-back-to-top");
const floatingTocRoot = document.querySelector("#magazine-floating-toc");
const reviewToggleButton = document.querySelector("#magazine-review-toggle");
const reviewToggleMeta = document.querySelector("#magazine-review-toggle-meta");
const heroReviewStatus = document.querySelector("#magazine-hero-review-status");
const floatingToc = createFloatingTocController(floatingTocRoot, {
  rootMargin: "-18% 0px -60% 0px",
  threshold: [0.1, 0.3, 0.55],
});
const reviewController = createBranchReviewController({
  reviewScope: "magazine",
  branchLabel: "Magazine",
  reviewToggleButton,
  reviewToggleMeta,
  heroReviewStatus,
  getCurrentReport: () => state.report,
  getCurrentPath: () => state.currentPath,
  getSnapshotLabel: (report) => formatIssueLabel(report.issue_number),
  emptyText: "Mark this issue as reviewed",
});
const { bindReviewToggle, renderReviewState } = reviewController;

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  await initBranchReportPage({
    pageKey: "magazine",
    toolbarPrefix: "magazine",
    manifestUrl,
    sidebarToggleButton,
    sidebarToggleLabel,
    sidebarToggleIcon,
    filterMenuPanel,
    backToTopButton,
    likeRecords: new Map(),
    bindPageControls: () => {
      bindFilters();
      bindReviewToggle();
    },
    renderReviewState,
    onManifestLoaded: (manifest) => {
      state.manifest = manifest;
      populateReportSelect(manifest.reports || []);
      renderHomeCards(manifest);
    },
    onEmptyManifest: () => {
      renderEmpty();
    },
    getInitialReportPath: (manifest) => manifest.default_report_path || manifest.reports[0]?.data_path || "",
    manifestValidator: validateMagazineManifest,
    loadReport,
  });
}

function bindFilters() {
  reportSelect.addEventListener("change", async (event) => {
    const path = event.target.value;
    if (path && path !== state.currentPath) {
      await loadReport(path);
    }
  });
}

async function loadReport(path) {
  const report = await fetchJson(path, { validator: validateMagazineReport });
  state.report = report;
  state.currentPath = path;
  reportSelect.value = path;
  renderHomeCards(state.manifest, path);
  renderReviewState();
  renderReport();
}

function populateReportSelect(reports) {
  reportSelect.innerHTML = reports
    .map(
      (report) =>
        `<option value="${escapeAttribute(report.data_path)}">${escapeHtml(formatIssueLabel(report.issue_number))} · ${report.sections_count} sections</option>`
    )
    .join("");
}

function renderHomeCards(manifest, activePath = "") {
  const root = document.querySelector("#magazine-home-cards");
  const summary = document.querySelector("#magazine-board-summary");
  const reports = manifest?.reports || [];
  const visibleReports = reports.slice(0, MAGAZINE_ARCHIVE_MAX_CARDS);

  if (!reports.length) {
    summary.textContent = "No synced magazine issues are available yet.";
    root.innerHTML = `<div class="empty-state">Run the magazine sync job first, then refresh the page.</div>`;
    return;
  }

  summary.textContent = `Currently indexed: ${reports.length} synced issues. Showing the latest ${visibleReports.length} issues.`;
  root.innerHTML = visibleReports
    .map(
      (report) => `
        <button
          class="home-category-card ${report.data_path === activePath ? "active" : ""}"
          type="button"
          data-magazine-report="${escapeAttribute(report.data_path)}"
        >
          <div class="home-category-card-top">
            <span class="home-category-label">Magazine</span>
            <span class="home-category-date">${escapeHtml(formatIssueLabel(report.issue_number))}</span>
          </div>
          <strong class="home-category-count">${escapeHtml(report.issue_title || formatIssueLabel(report.issue_number))}</strong>
          <p class="home-category-topic">${escapeHtml(report.excerpt || "No summary yet")}</p>
          <div class="home-category-meta">
            <span>${report.sections_count} sections</span>
            <span>${escapeHtml(report.sync_date || "-")}</span>
          </div>
        </button>
      `
    )
    .join("");

  root.querySelectorAll("[data-magazine-report]").forEach((button) => {
    button.addEventListener("click", async () => {
      const path = button.dataset.magazineReport;
      if (path && path !== state.currentPath) {
        await loadReport(path);
      }
    });
  });
}

function renderReport() {
  if (!state.report) {
    renderEmpty();
    return;
  }

  const report = state.report;
  renderHero(report);
  renderOverview(report);
  renderLead(report);
  renderSections(report);
}

function renderHero(report) {
  const issueLabel = formatIssueLabel(report.issue_number);
  document.querySelector("#magazine-hero-title").textContent = report.issue_title || issueLabel;
  document.querySelector("#magazine-hero-excerpt").textContent = report.excerpt || "Synced magazine archive for ruanyf/weekly.";
  document.querySelector("#magazine-hero-issue").textContent = issueLabel;
  document.querySelector("#magazine-hero-sections").textContent = String(report.sections_count || report.sections?.length || 0);
  document.querySelector("#magazine-hero-sync-date").textContent = report.sync_date || "-";
  document.querySelector("#magazine-hero-updated").textContent = formatZhTime(report.generated_at);
  document.querySelector("#magazine-hero-source").href = report.source_url;
  document.querySelector("#magazine-hero-signals").innerHTML = [
    `<div class="signal-chip"><span>Issue</span><strong>${escapeHtml(issueLabel)}</strong></div>`,
    `<div class="signal-chip"><span>Sections</span><strong>${report.sections_count || 0}</strong></div>`,
    `<div class="signal-chip"><span>Synced</span><strong>${escapeHtml(report.sync_date || "-")}</strong></div>`,
  ].join("");
}

function renderOverview(report) {
  document.querySelector("#magazine-overview-title").textContent = `${formatIssueLabel(report.issue_number)} Overview`;
  document.querySelector("#magazine-source-link").href = report.source_url;
  document.querySelector("#magazine-overview-summary").textContent = report.excerpt || "This synced issue does not expose an opening summary yet.";
  document.querySelector("#magazine-cover-summary").textContent = report.cover_image_url
    ? "The issue includes a cover image in the synced markdown."
    : "No cover image was detected in the synced markdown.";
  document.querySelector("#magazine-body-summary").textContent = `${report.sections_count || 0} titled sections were extracted for reading.`;
  document.querySelector("#magazine-archive-summary").textContent = `${state.manifest?.reports_count || state.manifest?.reports?.length || 0} issues are currently available in this branch.`;
}

function renderLead(report) {
  const root = document.querySelector("#magazine-lead-content");
  if (!report.lead_markdown) {
    root.innerHTML = `<p class="paper-workspace-markdown-empty">No opening notes were extracted from this issue.</p>`;
    return;
  }
  root.innerHTML = renderWorkspaceMarkdown(report.lead_markdown, { headingOffset: 0 });
}

function renderSections(report) {
  const root = document.querySelector("#magazine-section-list");
  const sections = Array.isArray(report.sections) ? report.sections : [];
  if (!sections.length) {
    root.innerHTML = `<div class="empty-state">No titled sections were extracted from the synced markdown.</div>`;
    floatingToc.render([
      { id: "magazine-overview-section", label: "Overview" },
      { id: "magazine-intro-section", label: "Opening Notes" },
    ]);
    return;
  }

  root.innerHTML = sections
    .map(
      (section, index) => `
        <section id="${escapeAttribute(section.slug || `magazine-section-${index + 1}`)}" class="glass-card overview reveal">
          <div class="section-heading">
            <p class="eyebrow">SECTION ${index + 1}</p>
            <h2>${escapeHtml(section.title || `Section ${index + 1}`)}</h2>
          </div>
          <div class="paper-workspace-markdown-display workspace-markdown-render">${renderWorkspaceMarkdown(section.markdown || "", {
            headingOffset: 0,
          })}</div>
        </section>
      `
    )
    .join("");

  floatingToc.render([
    { id: "magazine-overview-section", label: "Overview" },
    { id: "magazine-intro-section", label: "Opening Notes" },
    ...sections.map((section, index) => ({
      id: section.slug || `magazine-section-${index + 1}`,
      label: section.title || `Section ${index + 1}`,
    })),
  ]);
}

function renderEmpty() {
  document.querySelector("#magazine-hero-title").textContent = "Magazine Archive";
  document.querySelector("#magazine-hero-excerpt").textContent = "No synced magazine issues are available yet.";
  document.querySelector("#magazine-home-cards").innerHTML = `<div class="empty-state">Run the magazine sync job first, then refresh the page.</div>`;
  document.querySelector("#magazine-board-summary").textContent = "No synced magazine issues are available yet.";
  document.querySelector("#magazine-lead-content").innerHTML = `<p class="paper-workspace-markdown-empty">No issue selected.</p>`;
  document.querySelector("#magazine-section-list").innerHTML = "";
  floatingToc.render([]);
}

function renderFatal(error) {
  const message = getErrorMessage(error);
  document.querySelector("#magazine-hero-title").textContent = "Magazine Archive";
  document.querySelector("#magazine-hero-excerpt").textContent = "Magazine page failed to load.";
  document.querySelector("#magazine-home-cards").innerHTML = `<div class="empty-state">Magazine page failed to load: ${escapeHtml(message)}</div>`;
  document.querySelector("#magazine-board-summary").textContent = "Magazine page failed to load.";
  document.querySelector("#magazine-lead-content").innerHTML = `<p class="paper-workspace-markdown-empty">${escapeHtml(message)}</p>`;
  document.querySelector("#magazine-section-list").innerHTML = "";
  floatingToc.render([]);
}

function formatIssueLabel(issueNumber) {
  const normalized = Number(issueNumber);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return "-";
  }
  return `Issue ${normalized}`;
}
