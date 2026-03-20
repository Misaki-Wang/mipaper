const DEFAULT_USER_SCROLL_INTENT_MS = 1400;
const DEFAULT_ROOT_MARGIN = "280px 0px";
const DEFAULT_SUPPRESS_MS = 900;

export function createShowMoreAutoLoadController({
  targetSelector = "[data-show-more-auto-load]",
  bindingFlag = "showMoreAutoLoadBound",
  userScrollIntentMs = DEFAULT_USER_SCROLL_INTENT_MS,
  rootMargin = DEFAULT_ROOT_MARGIN,
  isSuppressed = () => false,
  onTrigger,
} = {}) {
  if (typeof onTrigger !== "function") {
    throw new TypeError("createShowMoreAutoLoadController requires an onTrigger callback");
  }

  let observer = null;
  let userScrollIntentUntil = 0;
  let suppressedUntil = 0;
  let lastTouchY = null;

  function isEditableTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    if (target instanceof HTMLInputElement) {
      return target.type !== "range";
    }

    return Boolean(target.closest("textarea, select, button, [contenteditable='true'], [role='textbox']"));
  }

  function markUserScrollIntent() {
    userScrollIntentUntil = Date.now() + userScrollIntentMs;
  }

  function hasRecentUserScrollIntent() {
    return Date.now() < userScrollIntentUntil;
  }

  function suppress(duration = DEFAULT_SUPPRESS_MS) {
    suppressedUntil = Date.now() + duration;
  }

  function init() {
    if (observer || typeof IntersectionObserver !== "function") {
      return;
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (Date.now() < suppressedUntil || isSuppressed() || !hasRecentUserScrollIntent()) {
          return;
        }

        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          const key = entry.target.dataset.showMoreAutoLoad || "";
          const total = Number(entry.target.dataset.showMoreTotal || "0");
          if (!key || !Number.isFinite(total) || total <= 0) {
            continue;
          }

          if (onTrigger({ key, total, node: entry.target }) === false) {
            continue;
          }
          break;
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0.01,
      }
    );
  }

  function refresh() {
    if (!observer) {
      return;
    }

    observer.disconnect();
    document.querySelectorAll(targetSelector).forEach((node) => {
      observer.observe(node);
    });
  }

  function bindUserScrollIntentTracking() {
    if (!document.body || document.body.dataset[bindingFlag] === "true") {
      return;
    }

    document.body.dataset[bindingFlag] = "true";
    window.addEventListener(
      "wheel",
      (event) => {
        if (event.deltaY > 0) {
          markUserScrollIntent();
        }
      },
      { passive: true }
    );
    window.addEventListener(
      "touchstart",
      (event) => {
        lastTouchY = event.touches[0]?.clientY ?? null;
      },
      { passive: true }
    );
    window.addEventListener(
      "touchmove",
      (event) => {
        const currentY = event.touches[0]?.clientY ?? null;
        if (typeof currentY === "number" && typeof lastTouchY === "number" && currentY < lastTouchY - 4) {
          markUserScrollIntent();
        }
        lastTouchY = currentY;
      },
      { passive: true }
    );
    window.addEventListener(
      "touchend",
      () => {
        lastTouchY = null;
      },
      { passive: true }
    );
    window.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) {
        return;
      }
      if (["ArrowDown", "PageDown", " ", "End"].includes(event.key) || event.code === "Space") {
        markUserScrollIntent();
      }
    });
  }

  return {
    init,
    refresh,
    suppress,
    bindUserScrollIntentTracking,
  };
}
