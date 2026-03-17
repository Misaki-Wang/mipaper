import { addToQueue, initQueue, isInQueue, readQueue, removeFromQueue, subscribeQueue } from "./paper_queue.js";
import { createLikeRecord, initLikesSync, readLikes, subscribeLikes, toggleLike } from "./likes.js";

const laterList = document.querySelector("#later-list");
const likeList = document.querySelector("#like-list");

init().catch((error) => {
  console.error(error);
  renderFatal(error);
});

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

function renderPaper(paper, actionsHtml) {
  const div = document.createElement("div");
  div.className = "paper-item";
  const authors = Array.isArray(paper.authors) ? paper.authors.slice(0, 3).join(", ") : "";
  const moreAuthors = paper.authors?.length > 3 ? ` +${paper.authors.length - 3}` : "";
  const abstract = String(paper.abstract || "").trim();

  div.innerHTML = `
    <div class="paper-header">
      <h3 class="paper-title">${escapeHtml(paper.title || "Untitled")}</h3>
      <span class="paper-topic">${escapeHtml(paper.topic_label || "")}</span>
    </div>
    <p class="paper-authors">${escapeHtml(authors)}${escapeHtml(moreAuthors)}</p>
    <p class="paper-abstract">${escapeHtml(abstract ? `${abstract.slice(0, 200)}${abstract.length > 200 ? "..." : ""}` : "No abstract available.")}</p>
    <div class="paper-links">
      ${paper.pdf_url ? `<a href="${escapeAttribute(paper.pdf_url)}" target="_blank" rel="noreferrer">PDF</a>` : ""}
      ${paper.abs_url ? `<a href="${escapeAttribute(paper.abs_url)}" target="_blank" rel="noreferrer">Abstract</a>` : ""}
    </div>
    <div class="paper-actions">${actionsHtml}</div>
  `;

  return div;
}

function renderLaterList() {
  if (!laterList) {
    return;
  }

  const papers = readQueue("later");
  laterList.innerHTML = "";

  if (!papers.length) {
    laterList.innerHTML = '<p class="empty-message">No papers in Later queue</p>';
    return;
  }

  papers.forEach((paper) => {
    const elem = renderPaper(
      paper,
      `
        <button class="btn-like" type="button" data-id="${escapeAttribute(paper.like_id)}">Move to Like</button>
        <button class="btn-remove" type="button" data-id="${escapeAttribute(paper.like_id)}">Remove</button>
      `
    );
    laterList.appendChild(elem);
  });

  laterList.querySelectorAll(".btn-like").forEach((button) => {
    button.addEventListener("click", () => {
      const likeId = button.dataset.id;
      const paper = papers.find((item) => item.like_id === likeId);
      if (!paper) {
        return;
      }
      toggleLike(paper.like_id ? paper : createLikeRecord(paper, {}));
      removeFromQueue(likeId);
    });
  });

  laterList.querySelectorAll(".btn-remove").forEach((button) => {
    button.addEventListener("click", () => removeFromQueue(button.dataset.id));
  });
}

function renderLikeList() {
  if (!likeList) {
    return;
  }

  const likes = readLikes();
  likeList.innerHTML = "";

  if (!likes.length) {
    likeList.innerHTML = '<p class="empty-message">No liked papers yet</p>';
    return;
  }

  likes.forEach((paper) => {
    const queued = isInQueue(paper.like_id);
    const elem = renderPaper(
      paper,
      `
        <button class="btn-queue" type="button" data-id="${escapeAttribute(paper.like_id)}" ${queued ? "disabled" : ""}>
          ${queued ? "Already in Later" : "Move to Later"}
        </button>
        <button class="btn-unlike" type="button" data-id="${escapeAttribute(paper.like_id)}">Remove Like</button>
      `
    );
    likeList.appendChild(elem);
  });

  likeList.querySelectorAll(".btn-queue").forEach((button) => {
    button.addEventListener("click", () => {
      const likeId = button.dataset.id;
      const paper = likes.find((item) => item.like_id === likeId);
      if (!paper || isInQueue(likeId)) {
        return;
      }
      addToQueue(paper, {});
    });
  });

  likeList.querySelectorAll(".btn-unlike").forEach((button) => {
    button.addEventListener("click", () => {
      const likeId = button.dataset.id;
      const paper = likes.find((item) => item.like_id === likeId);
      if (!paper) {
        return;
      }
      toggleLike(paper);
    });
  });
}

function renderPage() {
  renderLaterList();
  renderLikeList();
}

function renderFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  const html = `<p class="empty-message">Queue page failed to load: ${escapeHtml(message)}</p>`;
  if (laterList) {
    laterList.innerHTML = html;
  }
  if (likeList) {
    likeList.innerHTML = html;
  }
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

async function init() {
  bindThemeToggle();
  subscribeQueue(renderPage);
  subscribeLikes(renderPage);
  await Promise.all([initQueue(), initLikesSync()]);
  renderPage();
}
