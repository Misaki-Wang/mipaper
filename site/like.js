import {
  bindLikeButtons,
  getAuthSnapshot,
  getSourceLabel,
  initLikesSync,
  readLikes,
  signInWithGitHub,
  signOutFromGitHub,
  subscribeAuth,
  subscribeLikes,
  syncLikesNow,
} from "./likes.js";

const state = {
  likes: [],
  source: "",
  topic: "",
  query: "",
};

const focusTopicKeys = new Set([
  "generative_foundations",
  "multimodal_generative",
  "multimodal_agents",
]);

const sourceFilter = document.querySelector("#like-source-filter");
const topicFilter = document.querySelector("#like-topic-filter");
const searchInput = document.querySelector("#like-search-input");
const resetFiltersButton = document.querySelector("#like-reset-filters");
const sidebarToggleButton = document.querySelector("#like-sidebar-toggle");
const sidebarToggleLabel = document.querySelector("#like-sidebar-toggle-label");
const sidebarToggleIcon = document.querySelector("#like-sidebar-toggle-icon");
const layoutRoot = document.querySelector(".layout");
const backToTopButton = document.querySelector("#like-back-to-top");
const likeRecords = new Map();
const authStatus = document.querySelector("#like-auth-status");
const signInButton = document.querySelector("#like-sign-in");
const signOutButton = document.querySelector("#like-sign-out");
const syncNowButton = document.querySelector("#like-sync-now");
const accountBanner = document.querySelector("#like-current-account");
const accountCard = document.querySelector("#like-account-card");
const authWarning = document.querySelector("#like-auth-warning");

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

async function init() {
  bindThemeToggle();
  bindSidebarToggle();
  bindBackToTop();
  bindFilters();
  bindAuthActions();
  subscribeAuth(renderAuthState);
  subscribeLikes((likes) => {
    state.likes = likes;
    renderPage();
  });
  await initLikesSync();
  state.likes = readLikes();
  renderPage();
}

function bindThemeToggle() {
  const toggles = [...document.querySelectorAll("[data-theme-toggle]")];
  const systemQuery = window.matchMedia("(prefers-color-scheme: dark)");
  const initial = localStorage.getItem("cool-paper-theme") || "auto";
  applyTheme(initial);

  toggles.forEach((button) => {
    button.addEventListener("click", () => applyTheme(button.dataset.themeToggle));
  });

  const handleSystemThemeChange = () => {
    const current = localStorage.getItem("cool-paper-theme") || "auto";
    if (current === "auto") {
      applyTheme("auto", false);
    }
  };

  if (typeof systemQuery.addEventListener === "function") {
    systemQuery.addEventListener("change", handleSystemThemeChange);
  } else if (typeof systemQuery.addListener === "function") {
    systemQuery.addListener(handleSystemThemeChange);
  }

  function applyTheme(mode, persist = true) {
    const resolvedTheme = mode === "auto" ? (systemQuery.matches ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = mode;
    if (persist) {
      localStorage.setItem("cool-paper-theme", mode);
    }
    toggles.forEach((button) => button.classList.toggle("active", button.dataset.themeToggle === mode));
  }
}

function bindSidebarToggle() {
  const initial = localStorage.getItem("cool-paper-sidebar") || "expanded";
  applySidebarState(initial === "collapsed");

  sidebarToggleButton.addEventListener("click", () => {
    const collapsed = !layoutRoot.classList.contains("sidebar-collapsed");
    applySidebarState(collapsed);
  });
}

function applySidebarState(collapsed) {
  layoutRoot.classList.toggle("sidebar-collapsed", collapsed);
  sidebarToggleButton.setAttribute("aria-expanded", String(!collapsed));
  sidebarToggleButton.setAttribute("aria-label", collapsed ? "展开侧边工具栏" : "收起侧边工具栏");
  sidebarToggleButton.title = collapsed ? "展开侧边工具栏" : "收起侧边工具栏";
  sidebarToggleLabel.textContent = collapsed ? "展开" : "收起";
  sidebarToggleIcon.textContent = collapsed ? "›" : "‹";
  localStorage.setItem("cool-paper-sidebar", collapsed ? "collapsed" : "expanded");
}

function bindBackToTop() {
  const threshold = 720;

  function updateVisibility() {
    const visible = window.scrollY > threshold;
    backToTopButton.classList.toggle("is-visible", visible);
    backToTopButton.setAttribute("aria-hidden", String(!visible));
  }

  backToTopButton.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  window.addEventListener("scroll", updateVisibility, { passive: true });
  updateVisibility();
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

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderPage();
  });

  resetFiltersButton.addEventListener("click", () => {
    state.source = "";
    state.topic = "";
    state.query = "";
    sourceFilter.value = "";
    topicFilter.value = "";
    searchInput.value = "";
    renderPage();
  });
}

function bindAuthActions() {
  signInButton.addEventListener("click", async () => {
    authStatus.textContent = "正在跳转到 GitHub 登录，返回后会自动同步收藏。";
    await signInWithGitHub();
  });

  signOutButton.addEventListener("click", async () => {
    await signOutFromGitHub();
  });

  syncNowButton.addEventListener("click", async () => {
    try {
      syncNowButton.disabled = true;
      await syncLikesNow();
    } catch (error) {
      console.error(error);
      authStatus.textContent = `同步失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      syncNowButton.disabled = false;
      renderAuthState(getAuthSnapshot());
    }
  });
}

function renderAuthState(snapshot) {
  renderAccountIdentity(snapshot);
  renderUnauthorizedState(snapshot);
  if (!snapshot.configured) {
    authStatus.textContent = "未配置 Supabase，同步功能当前关闭。";
    signInButton.disabled = true;
    signOutButton.disabled = true;
    syncNowButton.disabled = true;
    return;
  }

  signInButton.disabled = snapshot.signedIn;
  signOutButton.disabled = !snapshot.signedIn;
  syncNowButton.disabled = !snapshot.signedIn || snapshot.syncing || snapshot.unauthorized;
  if (snapshot.unauthorized) {
    authStatus.textContent = snapshot.unauthorizedMessage || "当前账号未被授权使用 Like。";
    signInButton.disabled = false;
    signOutButton.disabled = true;
    return;
  }
  authStatus.textContent = snapshot.signedIn
    ? buildSignedInStatus(snapshot)
    : "Supabase 已配置。点击 GitHub Sign in 后即可跨设备同步收藏。";
}

function buildSignedInStatus(snapshot) {
  const account = snapshot.user?.email || snapshot.user?.id || "-";
  if (snapshot.syncing) {
    return `已连接 GitHub 账号 ${account}，正在自动同步收藏到 Supabase。`;
  }
  if (snapshot.syncError) {
    return `已连接 GitHub 账号 ${account}，自动同步失败：${snapshot.syncError}`;
  }
  if (snapshot.lastSyncedAt) {
    return `已连接 GitHub 账号 ${account}，收藏已自动同步。上次同步 ${formatTime(snapshot.lastSyncedAt)}。`;
  }
  return `已连接 GitHub 账号 ${account}，登录成功后会自动同步收藏到 Supabase。`;
}

function renderAccountIdentity(snapshot) {
  const identitySource = snapshot.unauthorized ? snapshot.blockedUser : snapshot.user;
  const signedIn = Boolean(snapshot.signedIn && snapshot.user && !snapshot.unauthorized);
  const metadata = identitySource?.user_metadata || {};
  const displayName =
    identitySource?.displayName ||
    metadata.full_name ||
    metadata.name ||
    metadata.preferred_username ||
    metadata.user_name ||
    "未登录";
  const email = identitySource?.email || identitySource?.id || identitySource?.userId || "请先连接 GitHub 账号";
  const avatarUrl = identitySource?.avatarUrl || metadata.avatar_url || "";

  const bannerValue = accountBanner?.querySelector(".account-banner-value");
  if (accountBanner && bannerValue) {
    accountBanner.classList.toggle("muted", !signedIn && !snapshot.unauthorized);
    accountBanner.classList.toggle("is-unauthorized", Boolean(snapshot.unauthorized));
    bannerValue.textContent = snapshot.unauthorized ? `Unauthorized · ${email}` : signedIn ? `${displayName} · ${email}` : "Not signed in";
  }

  if (!accountCard) {
    return;
  }

  accountCard.classList.toggle("is-empty", !signedIn && !snapshot.unauthorized);
  accountCard.classList.toggle("is-unauthorized", Boolean(snapshot.unauthorized));
  const avatarShell = accountCard.querySelector(".account-avatar-shell");
  const nameNode = accountCard.querySelector(".account-card-name");
  const emailNode = accountCard.querySelector(".account-card-email");
  if (nameNode) {
    nameNode.textContent = snapshot.unauthorized ? `未授权账号 · ${displayName}` : displayName;
  }
  if (emailNode) {
    emailNode.textContent = email;
  }
  if (!avatarShell) {
    return;
  }

  const initial = String(displayName || email || "?").trim().charAt(0).toUpperCase() || "?";
  if (signedIn && avatarUrl) {
    avatarShell.innerHTML = `<img class="account-avatar-image" src="${escapeAttribute(avatarUrl)}" alt="${escapeAttribute(
      displayName
    )}" />`;
    return;
  }

  avatarShell.innerHTML = `<div class="account-avatar-fallback">${escapeHtml(initial)}</div>`;
}

function renderUnauthorizedState(snapshot) {
  if (!authWarning) {
    return;
  }
  if (!snapshot.unauthorized) {
    authWarning.hidden = true;
    authWarning.textContent = "";
    return;
  }
  authWarning.hidden = false;
  authWarning.textContent = snapshot.unauthorizedMessage || "当前账号不在允许名单中，Like 已被限制。";
}

function renderPage() {
  const likes = readLikes();
  state.likes = likes;
  populateFilters(likes);
  renderHero(likes);
  renderSourceCards(likes);

  if (!likes.length) {
    renderEmpty();
    return;
  }

  likeRecords.clear();
  const visibleLikes = getVisibleLikes(likes);
  const topicDistribution = computeTopicDistribution(visibleLikes);
  const sourceSections = groupBySource(visibleLikes);

  renderOverview(likes, visibleLikes, sourceSections);
  renderTagMap(likes, topicDistribution);
  renderDistribution(topicDistribution);
  renderResults(likes, visibleLikes, sourceSections);
  renderSourceSections(sourceSections);
  bindLikeButtons(document, likeRecords);
}

function populateFilters(likes) {
  const currentSource = state.source;
  const currentTopic = state.topic;
  const sources = [...new Set(likes.map((item) => item.source_kind).filter(Boolean))];
  const topics = [...new Set(likes.map((item) => item.topic_label || "其他 AI"))].sort((a, b) => a.localeCompare(b, "zh-CN"));

  sourceFilter.innerHTML = [
    `<option value="">全部 Branch</option>`,
    ...sources.map((source) => `<option value="${escapeAttribute(source)}">${escapeHtml(getSourceLabel(source))}</option>`),
  ].join("");
  topicFilter.innerHTML = [
    `<option value="">全部 Topic</option>`,
    ...topics.map((topic) => `<option value="${escapeAttribute(topic)}">${escapeHtml(topic)}</option>`),
  ].join("");

  sourceFilter.value = sources.includes(currentSource) ? currentSource : "";
  topicFilter.value = topics.includes(currentTopic) ? currentTopic : "";
  state.source = sourceFilter.value;
  state.topic = topicFilter.value;
}

function renderHero(likes) {
  const topTopic = computeTopicDistribution(likes)[0];
  const focusCount = likes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const sources = new Set(likes.map((item) => item.source_kind).filter(Boolean));
  const latest = likes[0];

  document.querySelector("#like-hero-count").textContent = likes.length ? `${likes.length} saved` : "0 saved";
  document.querySelector("#like-hero-sources").textContent = String(sources.size);
  document.querySelector("#like-hero-focus").textContent = String(focusCount);
  document.querySelector("#like-hero-latest").textContent = latest ? formatTime(latest.saved_at) : "-";
  document.querySelector("#like-hero-topic").textContent = topTopic?.topic_label || "-";

  document.querySelector("#like-hero-signals").innerHTML = [
    topTopic ? `<div class="signal-chip"><span>Top Topic</span><strong>${escapeHtml(topTopic.topic_label)}</strong></div>` : "",
    likes.length ? `<div class="signal-chip"><span>Saved Papers</span><strong>${likes.length}</strong></div>` : "",
    sources.size ? `<div class="signal-chip"><span>Branches</span><strong>${sources.size}</strong></div>` : "",
    latest ? `<div class="signal-chip"><span>Latest</span><strong>${escapeHtml(getSourceLabel(latest.source_kind))}</strong></div>` : "",
  ]
    .filter(Boolean)
    .join("");
}

function renderSourceCards(likes) {
  const root = document.querySelector("#like-home-cards");
  const summary = document.querySelector("#like-board-summary");
  const sections = groupBySource(likes);

  if (!sections.length) {
    summary.textContent = "还没有保存的论文。";
    root.innerHTML = `<div class="empty-state">在任意论文卡片上点击 Like 后，这里会自动出现对应来源。</div>`;
    return;
  }

  summary.textContent = `当前共收藏 ${likes.length} 篇论文，覆盖 ${sections.length} 个 branch。`;
  root.innerHTML = sections
    .map(
      (section) => `
        <button class="home-category-card${state.source === section.source_kind ? " active" : ""}" type="button" data-like-source="${escapeAttribute(section.source_kind)}">
          <div class="home-category-top">
            <span>${escapeHtml(section.source_label)}</span>
            <span>${section.count} saved</span>
          </div>
          <strong>${escapeHtml(section.latest_snapshot || "No snapshot")}</strong>
          <p>${escapeHtml(section.top_topic || "No topic summary")}</p>
          <div class="home-category-meta">
            <span>${section.count} papers</span>
            <span>${escapeHtml(section.latest_saved || "-")}</span>
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

function renderOverview(likes, visibleLikes, sourceSections) {
  const focusCount = visibleLikes.filter((item) => focusTopicKeys.has(item.topic_key)).length;
  const focusShare = visibleLikes.length ? (focusCount / visibleLikes.length) * 100 : 0;
  const latest = visibleLikes[0] || likes[0];
  const topSource = sourceSections[0];

  document.querySelector("#like-overview-title").textContent = "Like 分支概览";
  document.querySelector("#like-overview-summary").textContent = `当前收藏 ${visibleLikes.length} 篇论文，可作为后续精读和复看队列。`;
  document.querySelector("#like-focus-summary").textContent = `${focusCount} 篇命中重点方向，占当前视图 ${focusShare.toFixed(2)}%。`;
  document.querySelector("#like-branch-summary").textContent = topSource
    ? `${escapeHtml(topSource.source_label)} 当前收藏最多，共 ${topSource.count} 篇。`
    : "还没有可见 branch。";
  document.querySelector("#like-latest-summary").textContent = latest
    ? `${formatTime(latest.saved_at)} 保存，来源于 ${escapeHtml(getSourceLabel(latest.source_kind))}。`
    : "还没有最新保存记录。";
}

function renderTagMap(likes, topicDistribution) {
  const topTopic = topicDistribution[0]?.topic_label || "其他 AI";
  document.querySelector("#like-tag-map").innerHTML = [
    {
      label: "Branch",
      value: state.source ? getSourceLabel(state.source) : "All branches",
      meta: state.source ? "当前筛选中的 branch" : "当前全部收藏来源",
    },
    {
      label: "Topic",
      value: state.topic || topTopic,
      meta: state.topic ? "当前筛选中的 topic" : "当前主导 topic",
    },
    {
      label: "Search",
      value: state.query || "No query",
      meta: state.query ? "当前搜索词" : "当前未启用搜索",
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

function renderDistribution(distribution) {
  const root = document.querySelector("#like-distribution-list");
  if (!distribution.length) {
    root.innerHTML = `<div class="empty-state">当前没有可统计的 topic。</div>`;
    return;
  }
  root.innerHTML = distribution
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

function renderResults(likes, visibleLikes, sourceSections) {
  const activeFilters = getActiveFilters();
  document.querySelector("#like-results-title").textContent = activeFilters.length
    ? `当前筛选后可见 ${visibleLikes.length} 篇论文`
    : `当前共收藏 ${likes.length} 篇论文`;
  document.querySelector("#like-results-stats").innerHTML = [
    renderResultStat("Visible Likes", visibleLikes.length, activeFilters.length ? `of ${likes.length}` : "full liked set"),
    renderResultStat("Visible Branches", sourceSections.length, activeFilters.length ? "filtered" : "all branches"),
    renderResultStat("View Mode", state.topic || "Full scan", state.query ? `search: ${state.query}` : "cross-branch browsing"),
  ].join("");
  document.querySelector("#like-active-filters").innerHTML = activeFilters.length
    ? activeFilters.map((item) => `<span class="active-filter-pill">${escapeHtml(item)}</span>`).join("")
    : `<span class="active-filter-pill">No filters applied. You are looking at the full liked set.</span>`;
  resetFiltersButton.disabled = !activeFilters.length;
}

function renderSourceSections(sections) {
  const root = document.querySelector("#like-source-sections");
  if (!sections.length) {
    root.innerHTML = `<div class="glass-card empty-state">当前筛选条件下没有命中的收藏论文。</div>`;
    return;
  }

  root.innerHTML = sections
    .map(
      (section, index) => `
        <section class="glass-card conference-subject-card">
          <div class="conference-subject-header">
            <div>
              <p class="eyebrow">BRANCH</p>
              <h3>${index + 1}. ${escapeHtml(section.source_label)}</h3>
            </div>
            <div class="conference-subject-meta">
              <span>${section.count} papers</span>
              <span>${escapeHtml(section.latest_snapshot || "No snapshot")}</span>
            </div>
          </div>
          <div class="conference-paper-grid">
            ${section.papers.map((paper) => renderLikeCard(paper)).join("")}
          </div>
        </section>
      `
    )
    .join("");
}

function renderLikeCard(paper) {
  likeRecords.set(paper.like_id, paper);
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
    `<span class="paper-badge">${escapeHtml(paper.topic_label || "其他 AI")}</span>`,
    `<span class="paper-badge subdued">${escapeHtml(getSourceLabel(paper.source_kind))}</span>`,
    paper.snapshot_label ? `<span class="paper-badge subdued">${escapeHtml(paper.snapshot_label)}</span>` : "",
  ]
    .filter(Boolean)
    .join("");
  const links = [
    paper.source_page ? `<a class="paper-link" href="${escapeAttribute(paper.source_page)}">Branch</a>` : "",
    paper.pdf_url ? `<a class="paper-link brand-arxiv" href="${escapeAttribute(paper.pdf_url)}" target="_blank" rel="noreferrer">arXiv</a>` : "",
    paper.detail_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(paper.detail_url)}" target="_blank" rel="noreferrer">Cool</a>` : "",
    paper.hf_url ? `<a class="paper-link brand-cool" href="${escapeAttribute(paper.hf_url)}" target="_blank" rel="noreferrer">HF</a>` : "",
    paper.github_url ? `<a class="paper-link" href="${escapeAttribute(paper.github_url)}" target="_blank" rel="noreferrer">GitHub</a>` : "",
    renderLikeButton(paper),
  ]
    .filter(Boolean)
    .join("");

  return `
    <article class="conference-paper-card">
      <div class="conference-paper-top">${metaBadges}</div>
      <h4>${escapeHtml(paper.title)}</h4>
      <div class="paper-authors-box">
        <span class="paper-detail-label">Authors</span>
        <p class="paper-authors-line">${authors}</p>
      </div>
      ${abstract}
      <div class="paper-links">${links}</div>
    </article>
  `;
}

function renderLikeButton(paper) {
  const liked = true;
  return `
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

function getVisibleLikes(likes) {
  return likes.filter((paper) => {
    if (state.source && paper.source_kind !== state.source) {
      return false;
    }
    if (state.topic && (paper.topic_label || "其他 AI") !== state.topic) {
      return false;
    }
    if (!state.query) {
      return true;
    }
    const haystack = [paper.title, ...(paper.authors || [])].join(" ").toLowerCase();
    return haystack.includes(state.query);
  });
}

function groupBySource(likes) {
  const map = new Map();
  likes.forEach((paper) => {
    const source = paper.source_kind || "daily";
    if (!map.has(source)) {
      map.set(source, []);
    }
    map.get(source).push(paper);
  });
  return [...map.entries()]
    .map(([source_kind, papers]) => {
      const distribution = computeTopicDistribution(papers);
      return {
        source_kind,
        source_label: getSourceLabel(source_kind),
        count: papers.length,
        latest_snapshot: papers[0]?.snapshot_label || "",
        latest_saved: formatTime(papers[0]?.saved_at),
        top_topic: distribution[0]?.topic_label || "",
        papers,
      };
    })
    .sort((a, b) => b.count - a.count || a.source_label.localeCompare(b.source_label, "zh-CN"));
}

function computeTopicDistribution(papers) {
  const counts = new Map();
  papers.forEach((paper) => {
    const topic = paper.topic_label || "其他 AI";
    counts.set(topic, (counts.get(topic) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([topic_label, count]) => ({
      topic_label,
      count,
      share: papers.length ? (count / papers.length) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.topic_label.localeCompare(b.topic_label, "zh-CN"));
}

function getActiveFilters() {
  const filters = [];
  if (state.source) {
    filters.push(`Branch: ${getSourceLabel(state.source)}`);
  }
  if (state.topic) {
    filters.push(`Topic: ${state.topic}`);
  }
  if (state.query) {
    filters.push(`Search: ${state.query}`);
  }
  return filters;
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

function renderEmpty() {
  document.querySelector("#like-overview-summary").textContent = "还没有保存的论文。";
  document.querySelector("#like-focus-summary").textContent = "在任意论文卡片上点击 Like 后，这里会自动出现。";
  document.querySelector("#like-branch-summary").textContent = "当前没有 branch 分布。";
  document.querySelector("#like-latest-summary").textContent = "当前没有最新保存记录。";
  document.querySelector("#like-tag-map").innerHTML = "";
  document.querySelector("#like-distribution-list").innerHTML = `<div class="empty-state">还没有可统计的收藏。</div>`;
  document.querySelector("#like-results-title").textContent = "当前还没有收藏论文";
  document.querySelector("#like-results-stats").innerHTML = "";
  document.querySelector("#like-active-filters").innerHTML = `<span class="active-filter-pill">Like 任意论文后，这里会自动更新。</span>`;
  document.querySelector("#like-source-sections").innerHTML =
    `<div class="glass-card empty-state">在 Cool Daily、Conference 或 HF Daily 里点击 Like，即可把论文加入这里。</div>`;
  resetFiltersButton.disabled = true;
}

function renderFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  document.querySelector("#like-source-sections").innerHTML =
    `<div class="glass-card empty-state">Like 页面加载失败：${escapeHtml(message)}</div>`;
}

function formatTime(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date
    .toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    .replace(/\//g, "/");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
