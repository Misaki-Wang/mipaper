import {
  getSupabaseClient,
  isAuthorizedUser,
  isSupabaseConfigured,
  loadRuntimeConfig,
} from "./supabase.js";

const PAGE_REVIEWS_KEY = "cool-paper-page-reviews-v1";
const PAGE_REVIEWS_META_KEY = "cool-paper-page-reviews-meta-v1";
const TO_READ_KEY = "cool-paper-to-read-v1";
const PAGE_REVIEWS_CHANGED_EVENT = "cool-paper-page-reviews-changed";
const TO_READ_CHANGED_EVENT = "cool-paper-to-read-changed";

let supabaseClient = null;
let authSession = null;
let authUser = null;
let reviewInitPromise = null;
let reviewSyncPromise = null;
let reviewHydratePromise = null;

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
  writePageReviews(reviews, { dirty: true });
  scheduleRemoteReviewSync();
  window.dispatchEvent(new CustomEvent(PAGE_REVIEWS_CHANGED_EVENT, { detail: { reviewKey, reviewed } }));
}

export function subscribePageReviews(callback) {
  const handler = () => callback(readPageReviews());
  const handleStorage = (event) => {
    if (event.key === PAGE_REVIEWS_KEY) {
      handler();
    }
  };
  window.addEventListener(PAGE_REVIEWS_CHANGED_EVENT, handler);
  window.addEventListener("storage", handleStorage);
  handler();
  return () => {
    window.removeEventListener(PAGE_REVIEWS_CHANGED_EVENT, handler);
    window.removeEventListener("storage", handleStorage);
  };
}

export async function initReviewSync() {
  if (reviewInitPromise) {
    return reviewInitPromise;
  }
  reviewInitPromise = bootstrapReviewSync();
  return reviewInitPromise;
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

function readReviewMeta() {
  const payload = safeParse(localStorage.getItem(PAGE_REVIEWS_META_KEY));
  if (!payload || typeof payload !== "object") {
    return { dirty: false, last_synced_at: "" };
  }
  return {
    dirty: Boolean(payload.dirty),
    last_synced_at: typeof payload.last_synced_at === "string" ? payload.last_synced_at : "",
  };
}

function writeReviewMeta(meta) {
  localStorage.setItem(PAGE_REVIEWS_META_KEY, JSON.stringify(meta));
}

function writePageReviews(reviews, options = {}) {
  const { dirty = false, syncedAt = "", silent = false } = options;
  const meta = readReviewMeta();
  localStorage.setItem(PAGE_REVIEWS_KEY, JSON.stringify(reviews));
  writeReviewMeta({
    ...meta,
    dirty,
    last_synced_at: syncedAt || meta.last_synced_at || "",
  });
  if (!silent) {
    window.dispatchEvent(new CustomEvent(PAGE_REVIEWS_CHANGED_EVENT, { detail: { count: Object.keys(reviews).length } }));
  }
}

function scheduleRemoteReviewSync() {
  if (!authUser) {
    return;
  }
  syncPageReviewsNow().catch((error) => {
    console.error("Failed to sync reviewed pages to Supabase", error);
  });
}

async function bootstrapReviewSync() {
  await loadRuntimeConfig();
  if (!isSupabaseConfigured()) {
    return { configured: false, signedIn: false };
  }

  supabaseClient = await getSupabaseClient();
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  authSession = session;
  authUser = session?.user || null;
  const authorized = await applyAuthorizationGuard();

  supabaseClient.auth.onAuthStateChange(async (_event, sessionState) => {
    authSession = sessionState;
    authUser = sessionState?.user || null;
    const sessionAuthorized = await applyAuthorizationGuard();
    if (sessionAuthorized) {
      queueHydrateOrSyncRemoteReviews();
    }
  });

  if (authorized) {
    queueHydrateOrSyncRemoteReviews();
  }

  return {
    configured: true,
    signedIn: Boolean(authUser),
  };
}

async function applyAuthorizationGuard() {
  if (!authUser) {
    return false;
  }
  if (isAuthorizedUser(authUser)) {
    return true;
  }

  authSession = null;
  authUser = null;
  if (supabaseClient) {
    try {
      await supabaseClient.auth.signOut();
    } catch (error) {
      console.error("Failed to sign out unauthorized review-sync user", error);
    }
  }
  return false;
}

function queueHydrateOrSyncRemoteReviews() {
  if (reviewHydratePromise) {
    return reviewHydratePromise;
  }
  reviewHydratePromise = hydrateOrSyncRemoteReviews()
    .catch((error) => {
      console.error("Failed to hydrate or sync reviewed pages", error);
    })
    .finally(() => {
      reviewHydratePromise = null;
    });
  return reviewHydratePromise;
}

async function hydrateOrSyncRemoteReviews() {
  const reviews = readPageReviews();
  const meta = readReviewMeta();
  if (!Object.keys(reviews).length && !meta.dirty) {
    const remoteReviews = await fetchRemoteReviews();
    writePageReviews(remoteReviews, { dirty: false, syncedAt: new Date().toISOString() });
    return remoteReviews;
  }
  return syncPageReviewsNow();
}

async function syncPageReviewsNow() {
  await initReviewSync();
  if (!supabaseClient || !authUser) {
    return readPageReviews();
  }

  if (reviewSyncPromise) {
    return reviewSyncPromise;
  }

  reviewSyncPromise = performRemoteReviewSync();
  try {
    return await reviewSyncPromise;
  } finally {
    reviewSyncPromise = null;
  }
}

async function performRemoteReviewSync() {
  const reviews = readPageReviews();
  const upsertRows = Object.entries(reviews).map(([review_id, payload]) => ({
    user_id: authUser.id,
    review_id,
    reviewed_at: payload.reviewed_at || new Date().toISOString(),
    payload,
  }));

  if (upsertRows.length) {
    const { error } = await supabaseClient.from("reviewed_pages").upsert(upsertRows, {
      onConflict: "user_id,review_id",
    });
    if (error) {
      throw error;
    }
  }

  const { data: remoteRows, error: remoteError } = await supabaseClient
    .from("reviewed_pages")
    .select("review_id")
    .eq("user_id", authUser.id);
  if (remoteError) {
    throw remoteError;
  }

  const localIds = new Set(Object.keys(reviews));
  const staleIds = (remoteRows || []).map((item) => item.review_id).filter((reviewId) => !localIds.has(reviewId));
  if (staleIds.length) {
    const { error } = await supabaseClient
      .from("reviewed_pages")
      .delete()
      .eq("user_id", authUser.id)
      .in("review_id", staleIds);
    if (error) {
      throw error;
    }
  }

  const syncedAt = new Date().toISOString();
  const remoteReviews = await fetchRemoteReviews();
  writePageReviews(remoteReviews, { dirty: false, syncedAt });
  return remoteReviews;
}

async function fetchRemoteReviews() {
  if (!supabaseClient || !authUser) {
    return readPageReviews();
  }
  const { data, error } = await supabaseClient
    .from("reviewed_pages")
    .select("review_id,reviewed_at,payload")
    .eq("user_id", authUser.id)
    .order("reviewed_at", { ascending: false });
  if (error) {
    throw error;
  }

  return (data || []).reduce((accumulator, item) => {
    accumulator[item.review_id] = {
      ...(item.payload || {}),
      reviewed_at: item.reviewed_at,
    };
    return accumulator;
  }, {});
}
