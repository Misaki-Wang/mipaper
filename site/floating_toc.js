import { escapeAttribute, escapeHtml } from "./ui_utils.js?v=20260320-2";

export function createFloatingTocController(root, options = {}) {
  const {
    emptyText = "No sections available yet.",
    rootMargin = "-25% 0px -55% 0px",
    threshold = [0.1, 0.3, 0.6],
  } = options;

  let observer = null;

  const disconnect = () => {
    observer?.disconnect();
    observer = null;
  };

  const updateActive = (links, activeId) => {
    links.forEach((link) => link.classList.toggle("active", link.dataset.tocTarget === activeId));
  };

  const bindObserver = (items, links) => {
    disconnect();
    const sections = items.map((item) => document.getElementById(item.id)).filter(Boolean);
    if (!sections.length) {
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (!visible?.target?.id) {
          return;
        }
        updateActive(links, visible.target.id);
      },
      {
        rootMargin,
        threshold,
      }
    );

    sections.forEach((section) => observer.observe(section));
    updateActive(links, items[0]?.id || "");
  };

  const render = (items = []) => {
    if (!root) {
      return;
    }
    if (!items.length) {
      disconnect();
      root.innerHTML = `<span class="empty-state">${escapeHtml(emptyText)}</span>`;
      return;
    }

    root.innerHTML = items
      .map(
        (item) => `
          <a class="floating-toc-link${item.child ? " is-child" : ""}" href="#${escapeAttribute(item.id)}" data-toc-target="${escapeAttribute(
            item.id
          )}">
            <span>${escapeHtml(item.label)}</span>
          </a>
        `
      )
      .join("");

    const links = [...root.querySelectorAll("[data-toc-target]")];
    links.forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        document.getElementById(link.dataset.tocTarget)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });

    bindObserver(items, links);
  };

  return {
    render,
    disconnect,
  };
}
