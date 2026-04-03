import { bindLikeButtons, initLikesSync, subscribeLikes } from "./likes.js?v=010cf1b2c9";
import { bindQueueButtons, initQueue, subscribeQueue } from "./paper_queue.js?v=033bd186d1";
import { repairLikeLaterConflicts } from "./paper_selection.js?v=964dbe6c53";
import { createPageReviewKey, initReviewSync, isPageReviewed, setPageReviewed, subscribePageReviews } from "./reading_state.js?v=dd3f79ade0";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=66a12f1edc";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=88024f7cbb";
import { initToolbarPreferences } from "./toolbar_preferences.js?v=c889d6e375";
import { bindBackToTop, bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { fetchJson } from "./ui_utils.js?v=e2da3b3a11";

export function buildBranchReviewKey(reviewScope, currentPath) {
  return currentPath ? createPageReviewKey(reviewScope, currentPath) : "";
}

export async function initBranchReportPage({
  pageKey,
  toolbarPrefix,
  manifestUrl,
  sidebarToggleButton,
  sidebarToggleLabel,
  sidebarToggleIcon,
  filterMenuPanel,
  backToTopButton,
  likeRecords,
  bindPageControls,
  renderReviewState,
  onLibraryStateChange,
  onManifestLoaded,
  isManifestEmpty = (manifest) => !manifest?.reports?.length,
  onEmptyManifest,
  getInitialReportPath,
  loadReport,
  manifestValidator,
}) {
  let libraryStateChangeQueued = false;
  const scheduleLibraryStateChange = () => {
    if (typeof onLibraryStateChange !== "function" || libraryStateChangeQueued) {
      return;
    }
    libraryStateChangeQueued = true;
    const flush = () => {
      libraryStateChangeQueued = false;
      onLibraryStateChange();
    };
    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(flush);
      return;
    }
    setTimeout(flush, 0);
  };

  initToolbarPreferences({ pageKey });
  bindFilterMenu({
    button: sidebarToggleButton,
    panel: filterMenuPanel,
    labelNode: sidebarToggleLabel,
    iconNode: sidebarToggleIcon,
  });
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd(toolbarPrefix, { target: "later" });
  bindBranchAuthToolbar(toolbarPrefix);
  bindBackToTop(backToTopButton);
  bindPageControls();
  subscribeLikes(() => {
    bindLikeButtons(document, likeRecords);
    scheduleLibraryStateChange();
  });
  subscribeQueue(() => {
    bindQueueButtons(document, likeRecords);
    scheduleLibraryStateChange();
  });
  subscribePageReviews(() => renderReviewState());
  await Promise.all([initLikesSync(), initReviewSync(), initQueue()]);
  repairLikeLaterConflicts();

  const manifest = await fetchJson(manifestUrl, {
    validator: manifestValidator,
  });
  onManifestLoaded(manifest);

  if (isManifestEmpty(manifest)) {
    onEmptyManifest?.(manifest);
    return manifest;
  }

  const initialReportPath = getInitialReportPath(manifest);
  if (initialReportPath) {
    await loadReport(initialReportPath);
  }
  return manifest;
}

export function createBranchReviewController({
  reviewScope,
  branchLabel,
  reviewToggleButton,
  reviewToggleMeta,
  heroReviewStatus,
  getCurrentReport,
  getCurrentPath,
  getSnapshotLabel,
  emptyText = "Mark this snapshot as reviewed",
}) {
  const readCurrentReviewKey = () => {
    const currentPath = getCurrentPath();
    return buildBranchReviewKey(reviewScope, currentPath);
  };

  const readSnapshotLabel = () => {
    const report = getCurrentReport();
    return report ? getSnapshotLabel(report) : "";
  };

  const renderReviewState = () => {
    if (!reviewToggleButton || !reviewToggleMeta) {
      return;
    }

    const report = getCurrentReport();
    const reviewKey = readCurrentReviewKey();
    if (!report || !reviewKey) {
      reviewToggleButton.classList.remove("is-reviewed");
      reviewToggleButton.setAttribute("aria-pressed", "false");
      reviewToggleMeta.textContent = emptyText;
      if (heroReviewStatus) {
        heroReviewStatus.textContent = "Not reviewed";
        heroReviewStatus.classList.remove("is-reviewed");
      }
      return;
    }

    const snapshotLabel = readSnapshotLabel();
    const reviewed = isPageReviewed(reviewKey);
    reviewToggleButton.classList.toggle("is-reviewed", reviewed);
    reviewToggleButton.setAttribute("aria-pressed", String(reviewed));
    reviewToggleMeta.textContent = reviewed ? `Reviewed ${snapshotLabel}` : `Mark ${snapshotLabel} as reviewed`;
    if (heroReviewStatus) {
      heroReviewStatus.textContent = reviewed ? "Reviewed" : "Not reviewed";
      heroReviewStatus.classList.toggle("is-reviewed", reviewed);
    }
  };

  const bindReviewToggle = () => {
    if (!reviewToggleButton) {
      return;
    }

    reviewToggleButton.addEventListener("click", () => {
      const report = getCurrentReport();
      const reviewKey = readCurrentReviewKey();
      if (!report || !reviewKey) {
        return;
      }

      const snapshotLabel = readSnapshotLabel();
      const next = !isPageReviewed(reviewKey);
      setPageReviewed(reviewKey, next, {
        branch: branchLabel,
        snapshot_label: snapshotLabel,
      });
      renderReviewState();
    });
  };

  return {
    bindReviewToggle,
    renderReviewState,
  };
}
