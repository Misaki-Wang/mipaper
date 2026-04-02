import { getSupabaseClient, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js?v=606e1fd811";
import {
  compareSyncTimestamps,
  createSyncTimestamp,
  getInitialSyncRecords,
  getLatestTimestamp,
  getPendingSyncRecords,
  getRecordUpdatedAt,
  getSyncDeviceId,
  mergeSyncRecords,
} from "./sync_utils.js?v=8b7af265fa";

const PAGE_REVIEWS_KEY = "cool-paper-page-reviews-v1";
const PAGE_REVIEWS_META_KEY = "cool-paper-page-reviews-meta-v1";
const PAGE_REVIEWS_CHANGED_EVENT = "cool-paper-page-reviews-changed";

let supabaseClient = null;
let authSession = null;
let authUser = null;
let reviewInitPromise = null;
let reviewSyncPromise = null;
let reviewHydratePromise = null;

function normalizeLegacyReviewId(reviewId) {
  const normalized = String(reviewId || "").trim();
  if (!normalized) {
    return "";
  }

  const [branch, ...snapshotParts] = normalized.split("::");
  const snapshot = snapshotParts.join("::");
  if (!snapshot) {
    return normalized;
  }

  const normalizedSnapshot = snapshot.startsWith("data/weekly/")
    ? `data/magazine/${snapshot.slice("data/weekly/".length)}`
    : snapshot;
  if (branch === "weekly") {
    return `magazine::${normalizedSnapshot}`;
  }
  if (branch === "magazine" && normalizedSnapshot !== snapshot) {
    return `magazine::${normalizedSnapshot}`;
  }
  return normalized;
}

export function createPageReviewKey(branch, snapshot) {
  return `${String(branch || "page").trim()}::${String(snapshot || "current").trim()}`;
}

export function readPageReviews() {
  return Object.fromEntries(
    Object.entries(readReviewStore())
      .filter(([, value]) => value && !value.deleted_at)
      .map(([reviewId, value]) => [reviewId, value])
  );
}

export function isPageReviewed(reviewKey) {
  return Boolean(readPageReviews()[reviewKey]);
}

export function setPageReviewed(reviewKey, reviewed, meta = {}) {
  const store = { ...readReviewStore() };
  const existing = store[reviewKey] || {};
  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();

  if (reviewed) {
    store[reviewKey] = normalizeReviewRecord({
      ...existing,
      ...meta,
      review_id: reviewKey,
      reviewed_at: timestamp,
      updated_at: timestamp,
      client_updated_at: timestamp,
      deleted_at: "",
      device_id: deviceId,
    });
  } else if (existing?.review_id) {
    store[reviewKey] = normalizeReviewRecord({
      ...existing,
      review_id: reviewKey,
      deleted_at: timestamp,
      updated_at: timestamp,
      client_updated_at: timestamp,
      device_id: deviceId,
    });
  } else {
    return;
  }

  writeReviewStore(store, { dirty: true });
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

function normalizeReviewRecord(review) {
  if (!review || typeof review !== "object") {
    return null;
  }

  const reviewId = normalizeLegacyReviewId(review.review_id);
  if (!reviewId) {
    return null;
  }

  const fallbackUpdatedAt =
    (typeof review.updated_at === "string" && review.updated_at) ||
    (typeof review.client_updated_at === "string" && review.client_updated_at) ||
    (typeof review.deleted_at === "string" && review.deleted_at) ||
    (typeof review.reviewed_at === "string" && review.reviewed_at) ||
    "";

  return {
    ...review,
    review_id: reviewId,
    reviewed_at: typeof review.reviewed_at === "string" ? review.reviewed_at : fallbackUpdatedAt,
    updated_at: fallbackUpdatedAt,
    client_updated_at: typeof review.client_updated_at === "string" ? review.client_updated_at : fallbackUpdatedAt,
    deleted_at: typeof review.deleted_at === "string" ? review.deleted_at : "",
    device_id: typeof review.device_id === "string" ? review.device_id : "",
  };
}

function readReviewStore() {
  const rawValue = localStorage.getItem(PAGE_REVIEWS_KEY);
  const payload = safeParse(rawValue);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const merged = mergeSyncRecords(
    [],
    Object.entries(payload)
      .map(([reviewId, value]) => normalizeReviewRecord({ ...(value || {}), review_id: reviewId }))
      .filter(Boolean),
    "review_id"
  );

  const store = merged.reduce((accumulator, item) => {
    accumulator[item.review_id] = item;
    return accumulator;
  }, {});
  const serialized = JSON.stringify(store);
  if (rawValue !== serialized) {
    localStorage.setItem(PAGE_REVIEWS_KEY, serialized);
  }
  return store;
}

function writeReviewStore(reviews, options = {}) {
  const { dirty = false, syncedAt = "", silent = false } = options;
  const meta = readReviewMeta();
  const normalized = Object.fromEntries(
    Object.entries(reviews)
      .map(([reviewId, value]) => [reviewId, normalizeReviewRecord({ ...(value || {}), review_id: reviewId })])
      .filter(([, value]) => Boolean(value))
  );

  localStorage.setItem(PAGE_REVIEWS_KEY, JSON.stringify(normalized));
  writeReviewMeta({
    ...meta,
    dirty,
    last_synced_at: syncedAt || meta.last_synced_at || "",
  });
  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(PAGE_REVIEWS_CHANGED_EVENT, {
        detail: {
          count: Object.values(normalized).filter((value) => value && !value.deleted_at).length,
        },
      })
    );
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
  return true;
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
  return syncPageReviewsNow();
}

export async function syncPageReviewsNow() {
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
  const store = Object.values(readReviewStore());
  const meta = readReviewMeta();
  const initialSync = !meta.last_synced_at;
  let remoteReviews = initialSync ? await fetchRemoteReviews("") : {};
  const pendingRecords = initialSync
    ? getInitialSyncRecords(store, Object.values(remoteReviews), "review_id")
    : getPendingSyncRecords(store, meta.last_synced_at);

  if (pendingRecords.length) {
    const { error } = await supabaseClient.from("reviewed_pages").upsert(
      pendingRecords.map((item) => ({
        user_id: authUser.id,
        review_id: item.review_id,
        reviewed_at: item.reviewed_at || item.updated_at || createSyncTimestamp(),
        updated_at: item.updated_at || createSyncTimestamp(),
        deleted_at: item.deleted_at || null,
        client_updated_at: item.client_updated_at || null,
        device_id: item.device_id || getSyncDeviceId(),
        payload: item,
      })),
      { onConflict: "user_id,review_id" }
    );
    if (error) {
      throw error;
    }
  }

  if (!initialSync) {
    remoteReviews = await fetchRemoteReviews(meta.last_synced_at);
  }
  const merged = mergeSyncRecords(store, Object.values(remoteReviews), "review_id")
    .map((item) => normalizeReviewRecord(item))
    .filter(Boolean)
    .sort((left, right) => compareSyncTimestamps(getRecordUpdatedAt(right), getRecordUpdatedAt(left)));

  const syncedAt =
    getLatestTimestamp(
      meta.last_synced_at,
      merged.map((item) => getRecordUpdatedAt(item)),
      pendingRecords.map((item) => getRecordUpdatedAt(item))
    ) || createSyncTimestamp();

  const nextStore = merged.reduce((accumulator, item) => {
    accumulator[item.review_id] = item;
    return accumulator;
  }, {});

  writeReviewStore(nextStore, { dirty: false, syncedAt });
  return readPageReviews();
}

async function fetchRemoteReviews(since = "") {
  if (!supabaseClient || !authUser) {
    return readReviewStore();
  }

  let query = supabaseClient
    .from("reviewed_pages")
    .select("review_id,reviewed_at,updated_at,deleted_at,client_updated_at,device_id,payload")
    .eq("user_id", authUser.id)
    .order("updated_at", { ascending: false });
  if (since) {
    query = query.gt("updated_at", since);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || []).reduce((accumulator, item) => {
    const normalized = normalizeReviewRecord({
      ...(item.payload || {}),
      review_id: item.review_id,
      reviewed_at: item.reviewed_at,
      updated_at: item.updated_at,
      deleted_at: item.deleted_at,
      client_updated_at: item.client_updated_at,
      device_id: item.device_id,
    });
    if (normalized) {
      accumulator[item.review_id] = normalized;
    }
    return accumulator;
  }, {});
}
