import { initLikesSync, readLikes, subscribeLikes } from "./likes.js?v=010cf1b2c9";
import { bindBranchAuthToolbar } from "./branch_auth.js?v=66a12f1edc";
import { mountAppToolbar } from "./app_toolbar.js?v=c5124e8940";
import { bindBranchNav } from "./branch_nav.js?v=2ab092d7f1";
import { bindLibraryNav } from "./library_nav.js?v=7b6e095589";
import { bindToolbarQuickAdd } from "./toolbar_quick_add.js?v=88024f7cbb";
import { bindFilterMenu } from "./page_shell.js?v=b0d53b671d";
import { initToolbarPreferences } from "./toolbar_preferences.js?v=c889d6e375";
import { readQueue, initQueue, subscribeQueue } from "./paper_queue.js?v=033bd186d1";
import { initReviewSync, subscribePageReviews } from "./reading_state.js?v=dd3f79ade0";
import { fetchJson, formatDateTime, getErrorMessage, escapeAttribute, escapeHtml } from "./ui_utils.js?v=e2da3b3a11";
import { displayTopicLabel, LIKE_TIME_FORMAT, getLibraryGroupKey, getLibraryGroupLabel } from "./like_page_labels.js?v=aaa244a29d";
import { loadSnapshotQueueData, getSnapshotSourceKind, getToReadSnapshots } from "./like_page_snapshots.js?v=9b7df40d25";
import { initSavedViewsSync, readSavedViews, subscribeSavedViews } from "./like_saved_views_store.js?v=90877ca133";
import { installManualLibraryTestCases } from "./manual_test_cases.js?v=2bdd5fc135";

mountAppToolbar("#library-home-toolbar-root", {
  prefix: "library-home",
  filtersTemplateId: "library-home-toolbar-filters",
  branchActiveKey: null,
  libraryActiveKey: "home",
  quickAddTarget: "later",
});
installManualLibraryTestCases();

const state = {
  snapshots: [],
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);

const heroCountNode = document.querySelector("#library-home-hero-count");
const heroLaterNode = document.querySelector("#library-home-hero-later");
const heroUnreadNode = document.querySelector("#library-home-hero-unread");
const heroSavedNode = document.querySelector("#library-home-hero-saved");
const heroGroupsNode = document.querySelector("#library-home-hero-groups");
const heroSignalsNode = document.querySelector("#library-home-hero-signals");
const sidebarToggleButton = document.querySelector("#library-home-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#library-home-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#library-home-sidebar-toggle-icon");
const filterMenuPanel = document.querySelector("#library-home-filters-menu");
const linkCardsSummaryNode = document.querySelector("#library-home-links-summary");
const linkCardsRoot = document.querySelector("#library-home-link-cards");
const factsSummaryNode = document.querySelector("#library-home-facts-summary");
const factsRoot = document.querySelector("#library-home-facts");
const overviewRoot = document.querySelector("#library-home-overview");
const groupSummaryNode = document.querySelector("#library-home-groups-summary");
const groupsRoot = document.querySelector("#library-home-groups");
const topicsRoot = document.querySelector("#library-home-topics");

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  initToolbarPreferences({ pageKey: "library-home" });
  bindFilterMenu({
    button: sidebarToggleButton,
    panel: filterMenuPanel,
    labelNode: sidebarToggleLabel,
    iconNode: sidebarToggleIcon,
  });
  bindBranchAuthToolbar("library-home");
  bindBranchNav();
  bindLibraryNav();
  bindToolbarQuickAdd("library-home", { target: "later" });
  subscribeLikes(renderPage);
  subscribeQueue(renderPage);
  subscribeSavedViews(renderPage);
  subscribePageReviews(renderPage);
  await Promise.all([initLikesSync(), initQueue(), initReviewSync(), initSavedViewsSync()]);
  state.snapshots = await loadSnapshotQueueData(fetchJson);
  renderPage();
}

function renderPage() {
  const likes = readLikes();
  const laterQueue = readQueue("later");
  const savedViews = readSavedViews();
  const unreadSnapshots = getToReadSnapshots(state.snapshots);
  const groupSections = buildLibrarySourceSections(likes, laterQueue, unreadSnapshots);
  const topicDistribution = computeTopicDistribution(likes);
  const topTopic = topicDistribution[0] || null;
  const topGroup = groupSections[0] || null;
  const latestLike = likes[0] || null;
  const latestUnread = unreadSnapshots[0] || null;
  const reviewedCount = Math.max(state.snapshots.length - unreadSnapshots.length, 0);
  const focusCount = likes.filter((item) => focusTopicKeys.has(item.topic_key)).length;

  renderHero({ likes, laterQueue, savedViews, unreadSnapshots, groupSections, topTopic, latestLike, reviewedCount });
  renderLinkCards({ likes, laterQueue, unreadSnapshots, savedViews, topTopic, latestUnread });
  renderFacts({ likes, laterQueue, savedViews, unreadSnapshots, topTopic, latestLike, reviewedCount, focusCount });
  renderOverview({ likes, laterQueue, unreadSnapshots, topGroup, latestLike, latestUnread, reviewedCount });
  renderGroups({ likes, laterQueue, unreadSnapshots, groupSections });
  renderTopics(topicDistribution);
}

function renderHero({ likes, laterQueue, savedViews, unreadSnapshots, groupSections, topTopic, latestLike, reviewedCount }) {
  if (heroCountNode) {
    heroCountNode.textContent = likes.length ? `${likes.length} liked` : "Library empty";
  }
  if (heroLaterNode) {
    heroLaterNode.textContent = String(laterQueue.length);
  }
  if (heroUnreadNode) {
    heroUnreadNode.textContent = String(unreadSnapshots.length);
  }
  if (heroSavedNode) {
    heroSavedNode.textContent = String(savedViews.length);
  }
  if (heroGroupsNode) {
    heroGroupsNode.textContent = String(groupSections.length);
  }
  if (heroSignalsNode) {
    heroSignalsNode.innerHTML = [
      topTopic ? `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(topTopic.topic_label)}</strong></div>` : "",
      latestLike ? `<div class="signal-chip"><span>Latest Like</span><strong>${escapeHtml(formatLikeMoment(latestLike))}</strong></div>` : "",
      `<div class="signal-chip"><span>Reviewed</span><strong>${reviewedCount}</strong></div>`,
      `<div class="signal-chip"><span>Unread</span><strong>${unreadSnapshots.length}</strong></div>`,
    ]
      .filter(Boolean)
      .join("");
  }
}

function renderLinkCards({ likes, laterQueue, unreadSnapshots, savedViews, topTopic, latestUnread }) {
  if (!linkCardsRoot || !linkCardsSummaryNode) {
    return;
  }

  linkCardsSummaryNode.textContent = "Use Home for macro stats. Open the subpages when you want to act on concrete items.";
  linkCardsRoot.innerHTML = [
    {
      href: "./like.html",
      label: "Liked",
      count: likes.length,
      meta: topTopic ? `Top topic: ${topTopic.topic_label}` : "Review your liked papers",
      detail: savedViews.length ? `${savedViews.length} saved views ready` : "Saved views available here",
    },
    {
      href: "./queue.html",
      label: "Later",
      count: laterQueue.length,
      meta: laterQueue.length ? "Short-term reading queue" : "Queue is clear",
      detail: laterQueue[0]?.title || "Add papers when something is worth reading next",
    },
    {
      href: "./unread-snapshots.html",
      label: "Unread",
      count: unreadSnapshots.length,
      meta: unreadSnapshots.length ? "Snapshots waiting for review" : "Review queue is clear",
      detail: latestUnread?.snapshot_label || "Latest snapshot will appear here",
    },
  ]
    .map(renderEntryCard)
    .join("");
}

function renderFacts({ likes, laterQueue, savedViews, unreadSnapshots, topTopic, latestLike, reviewedCount, focusCount }) {
  if (!factsRoot || !factsSummaryNode) {
    return;
  }

  factsSummaryNode.textContent = `Tracking ${likes.length} liked papers, ${laterQueue.length} Later items, ${unreadSnapshots.length} unread snapshots, and ${savedViews.length} saved views.`;
  factsRoot.innerHTML = [
    renderFactCard("Liked Papers", String(likes.length), likes.length ? "Your retained paper set across all branches." : "Start liking papers to populate the library."),
    renderFactCard("Later Queue", String(laterQueue.length), laterQueue.length ? "Items staged for near-term reading." : "No papers are waiting in Later."),
    renderFactCard("Unread Snapshots", String(unreadSnapshots.length), unreadSnapshots.length ? "Snapshots still waiting for review." : "All fetched snapshots are reviewed."),
    renderFactCard("Saved Views", String(savedViews.length), savedViews.length ? "Reusable filter presets from the liked page." : "No saved views yet."),
    renderFactCard("Top Topic", topTopic?.topic_label || "-", topTopic ? `${topTopic.count} liked papers in the leading topic.` : "Topic mix will appear after you like papers."),
    renderFactCard("Latest Like", latestLike ? formatLikeMoment(latestLike) : "-", latestLike ? latestLike.title || "Recent liked paper" : "No liked activity yet."),
    renderFactCard("Reviewed Snapshots", String(reviewedCount), state.snapshots.length ? `${reviewedCount} of ${state.snapshots.length} fetched snapshots already reviewed.` : "Snapshot coverage appears after manifests load."),
    renderFactCard("Focus Topics", String(focusCount), focusCount ? "Liked papers in your focus topic cluster." : "No liked papers in the focus cluster yet."),
  ].join("");
}

function renderOverview({ likes, laterQueue, unreadSnapshots, topGroup, latestLike, latestUnread, reviewedCount }) {
  if (!overviewRoot) {
    return;
  }

  const totalTracked = likes.length + laterQueue.length + unreadSnapshots.length;
  const reviewedShare = state.snapshots.length ? ((reviewedCount / state.snapshots.length) * 100).toFixed(1) : "0.0";

  overviewRoot.innerHTML = [
    renderOverviewCard("Library Load", totalTracked ? `${totalTracked} active items` : "No active items", totalTracked ? "Liked, Later, and Unread combined." : "The library is currently empty."),
    renderOverviewCard("Dominant Group", topGroup ? `${topGroup.group_label} · ${topGroup.liked_count}` : "-", topGroup ? `${topGroup.later_count} later and ${topGroup.to_read_count} unread in the same group.` : "Group mix appears after activity is recorded."),
    renderOverviewCard("Review Coverage", `${reviewedShare}% reviewed`, state.snapshots.length ? `${reviewedCount} reviewed out of ${state.snapshots.length} fetched snapshots.` : "No snapshot manifests loaded yet."),
    renderOverviewCard("Latest Activity", latestLike ? formatLikeMoment(latestLike) : "-", latestUnread ? `Unread latest: ${latestUnread.snapshot_label}` : "No unread snapshot is waiting right now."),
  ].join("");
}

function renderGroups({ likes, laterQueue, unreadSnapshots, groupSections }) {
  if (!groupsRoot || !groupSummaryNode) {
    return;
  }

  if (!groupSections.length) {
    groupSummaryNode.textContent = "No library activity yet.";
    groupsRoot.innerHTML = `<div class="empty-state">Groups will appear here after you like papers, add Later items, or accumulate unread snapshots.</div>`;
    return;
  }

  groupSummaryNode.textContent = `Tracking ${likes.length} liked papers, ${laterQueue.length} Later items, and ${unreadSnapshots.length} unread snapshots across ${groupSections.length} groups.`;
  groupsRoot.innerHTML = groupSections
    .map(
      (section) => `
        <a class="home-category-card library-home-card" href="./like.html">
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
            <span>${escapeHtml(section.top_topic || "No topic summary")}</span>
            <span>${escapeHtml(section.latest_liked || section.latest_snapshot || "-")}</span>
          </div>
        </a>
      `
    )
    .join("");
}

function renderTopics(topicDistribution) {
  if (!topicsRoot) {
    return;
  }

  if (!topicDistribution.length) {
    topicsRoot.innerHTML = `<div class="empty-state">No liked topic statistics are available yet.</div>`;
    return;
  }

  topicsRoot.innerHTML = topicDistribution
    .slice(0, 8)
    .map(
      (item) => `
        <div class="distribution-row">
          <div class="distribution-top">
            <span>${escapeHtml(item.topic_label)}</span>
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

function renderFatal(error) {
  const message = getErrorMessage(error);
  if (factsSummaryNode) {
    factsSummaryNode.textContent = "Library home failed to load.";
  }
  if (factsRoot) {
    factsRoot.innerHTML = `<div class="empty-state">Library home failed to load: ${escapeHtml(message)}</div>`;
  }
}

function renderEntryCard(item) {
  return `
    <a class="home-category-card library-home-card library-home-entry-card" href="${escapeAttribute(item.href)}">
      <div class="home-category-card-top">
        <span class="home-category-label">${escapeHtml(item.label)}</span>
        <span class="home-category-date">Library page</span>
      </div>
      <div class="library-home-hero">
        <div class="library-home-count-block">
          <strong class="home-category-count">${escapeHtml(String(item.count))}</strong>
          <span class="library-home-count-label">items</span>
        </div>
      </div>
      <p class="home-category-topic">${escapeHtml(item.meta)}</p>
      <div class="home-category-meta">
        <span>${escapeHtml(item.detail)}</span>
      </div>
    </a>
  `;
}

function renderFactCard(label, value, meta) {
  return `
    <article class="settings-fact-card">
      <span class="settings-fact-label">${escapeHtml(label)}</span>
      <strong class="settings-fact-value">${escapeHtml(value)}</strong>
      <p class="settings-fact-meta">${escapeHtml(meta)}</p>
    </article>
  `;
}

function renderOverviewCard(label, value, meta) {
  return `
    <article class="insight-card">
      <span class="insight-label">${escapeHtml(label)}</span>
      <p class="insight-text">${escapeHtml(value)}</p>
      <p class="settings-fact-meta">${escapeHtml(meta)}</p>
    </article>
  `;
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
      return {
        group_key: groupKey,
        group_label: getLibraryGroupLabel(groupKey),
        liked_count: likedCount,
        later_count: laterCount,
        to_read_count: toReadCount,
        latest_snapshot:
          likesSection?.latest_snapshot ||
          toReadSnapshots.find((snapshot) => getLibraryGroupKey(getSnapshotSourceKind(snapshot)) === groupKey)?.snapshot_label ||
          "",
        latest_liked: likesSection?.latest_liked || "",
        top_topic: likesSection?.top_topic || "",
        lede: buildLibrarySourceLede(likedCount, laterCount, toReadCount),
        sort_score: likedCount * 100 + laterCount * 10 + toReadCount,
      };
    })
    .sort((a, b) => b.sort_score - a.sort_score || a.group_label.localeCompare(b.group_label, "en"));
}

function groupBySource(likes) {
  const map = new Map();
  likes.forEach((paper) => {
    const groupKey = getLibraryGroupKey(paper.source_kind || "daily");
    if (!map.has(groupKey)) {
      map.set(groupKey, []);
    }
    map.get(groupKey).push(paper);
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
      };
    })
    .sort((a, b) => b.liked_count - a.liked_count || a.group_label.localeCompare(b.group_label, "en"));
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
  return "Start adding activity to this group";
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

function formatLikeMoment(record) {
  return formatDateTime(record?.liked_at || record?.saved_at || "", LIKE_TIME_FORMAT);
}
