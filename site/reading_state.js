const PAGE_REVIEWS_KEY = "cool-paper-page-reviews-v1";
const TO_READ_KEY = "cool-paper-to-read-v1";
const PAGE_REVIEWS_CHANGED_EVENT = "cool-paper-page-reviews-changed";
const TO_READ_CHANGED_EVENT = "cool-paper-to-read-changed";

export function createPageReviewKey(branch, snapshot) {
  return `${String(branch || "page").trim()}::${String(snapshot || "current").trim()}`;
}

export function readPageReviews() {
  const payload = safeParse(localStorage.getItem(PAGE_REVIEWS_KEY));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload;
}

export function isPageReviewed(reviewKey) {
  return Boolean(readPageReviews()[reviewKey]);
}

export function setPageReviewed(reviewKey, reviewed, meta = {}) {
  const reviews = { ...readPageReviews() };
  if (reviewed) {
    reviews[reviewKey] = {
      reviewed_at: new Date().toISOString(),
      ...meta,
    };
  } else {
    delete reviews[reviewKey];
  }
  localStorage.setItem(PAGE_REVIEWS_KEY, JSON.stringify(reviews));
  window.dispatchEvent(new CustomEvent(PAGE_REVIEWS_CHANGED_EVENT, { detail: { reviewKey, reviewed } }));
}

export function subscribePageReviews(callback) {
  const handler = () => callback(readPageReviews());
  window.addEventListener(PAGE_REVIEWS_CHANGED_EVENT, handler);
  handler();
  return () => window.removeEventListener(PAGE_REVIEWS_CHANGED_EVENT, handler);
}

export function readToReadList() {
  const payload = safeParse(localStorage.getItem(TO_READ_KEY));
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .filter((item) => typeof item === "string" && item)
    .sort((left, right) => left.localeCompare(right));
}

export function isMarkedToRead(likeId) {
  return readToReadList().includes(likeId);
}

export function toggleToRead(likeId) {
  const list = readToReadList();
  const exists = list.includes(likeId);
  const next = exists ? list.filter((item) => item !== likeId) : [...list, likeId];
  localStorage.setItem(TO_READ_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(TO_READ_CHANGED_EVENT, { detail: { likeId, active: !exists } }));
  return !exists;
}

export function subscribeToRead(callback) {
  const handler = () => callback(readToReadList());
  window.addEventListener(TO_READ_CHANGED_EVENT, handler);
  handler();
  return () => window.removeEventListener(TO_READ_CHANGED_EVENT, handler);
}

function safeParse(rawValue) {
  if (!rawValue) {
    return null;
  }
  try {
    return JSON.parse(rawValue);
  } catch (_error) {
    return null;
  }
}
