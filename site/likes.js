import { getAccessPolicy, getGitHubRedirectTo, getSupabaseClient, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js";
import {
  compareSyncTimestamps,
  createSyncTimestamp,
  getInitialSyncRecords,
  getLatestTimestamp,
  getPendingSyncRecords,
  getRecordUpdatedAt,
  getSyncDeviceId,
  mergeSyncRecords,
} from "./sync_utils.js";
import { movePaperToLikes } from "./paper_selection.js?v=20260319-5";

const LIKES_STORAGE_KEY = "cool-paper-liked-papers-v1";
const LIKES_META_KEY = "cool-paper-liked-papers-meta-v1";
const LIKES_CHANGED_EVENT = "cool-paper-likes-changed";
const AUTH_CHANGED_EVENT = "cool-paper-auth-changed";

const SOURCE_LABELS = {
  daily: "Cool Daily",
  conference: "Conference",
  hf_daily: "HF Daily",
  trending: "Trending",
  library: "Library",
};

const WORKFLOW_STATUSES = new Set(["inbox", "reading", "digesting", "synthesized", "archived"]);
const PRIORITY_LEVELS = new Set(["high", "medium", "low"]);

let supabaseClient = null;
let authSession = null;
let authUser = null;
let likesInitPromise = null;
let syncPromise = null;
let hydratePromise = null;
let syncState = {
  syncing: false,
  error: "",
  lastSyncedAt: "",
};
let accessState = {
  unauthorized: false,
  message: "",
  blockedUser: null,
};

export function getSourceLabel(sourceKind) {
  return SOURCE_LABELS[sourceKind] || "Like";
}

export function getLikeId(paper) {
  const primary =
    paper.arxiv_pdf_url ||
    paper.pdf_url ||
    paper.arxiv_url ||
    paper.abs_url ||
    paper.hf_url ||
    paper.detail_url ||
    paper.github_url ||
    paper.paper_id ||
    paper.title ||
    "paper";
  return normalizeLikeId(primary);
}

export function createLikeRecord(paper, context = {}) {
  return {
    like_id: getLikeId(paper),
    title: paper.title || "Untitled",
    paper_id: paper.paper_id || "",
    topic_key: paper.topic_key || "",
    topic_label: paper.topic_label || "Other AI",
    authors: Array.isArray(paper.authors) ? paper.authors.filter(Boolean) : [],
    abstract: typeof paper.abstract === "string" ? paper.abstract.trim() : "",
    pdf_url: paper.arxiv_pdf_url || paper.pdf_url || "",
    abs_url: paper.arxiv_url || paper.abs_url || "",
    detail_url: paper.detail_url || paper.papers_cool_url || "",
    hf_url: paper.hf_url || "",
    github_url: paper.github_url || "",
    submitted_by: paper.submitted_by || "",
    subjects: Array.isArray(paper.subjects) ? paper.subjects.filter(Boolean) : [],
    classification_source: paper.classification_source || "",
    classification_confidence:
      typeof paper.classification_confidence === "number" ? paper.classification_confidence : null,
    source_kind: context.sourceKind || "daily",
    source_label: context.sourceLabel || getSourceLabel(context.sourceKind || "daily"),
    source_page: context.sourcePage || "",
    snapshot_label: context.snapshotLabel || "",
    report_date: context.reportDate || "",
    category: context.category || "",
    venue: context.venue || "",
    venue_series: context.venueSeries || "",
    venue_year: context.venueYear || "",
    workflow_status: normalizeWorkflowStatus(paper.workflow_status || context.workflowStatus || "inbox"),
    priority_level: normalizePriorityLevel(paper.priority_level || context.priorityLevel || "medium"),
    one_line_takeaway: normalizeNoteField(paper.one_line_takeaway),
    next_action: normalizeNoteField(paper.next_action),
    custom_tags: normalizeCustomTags(paper.custom_tags),
  };
}

export function readLikes() {
  return readLikeStore()
    .filter((item) => !item.deleted_at)
    .sort((left, right) => (right.saved_at || "").localeCompare(left.saved_at || ""));
}

export function isLiked(likeId) {
  return readLikes().some((item) => item.like_id === likeId);
}

export function toggleLike(record) {
  const store = readLikeStore();
  const likeId = normalizeLikeId(record.like_id || getLikeId(record));
  const existingIndex = store.findIndex((item) => item.like_id === likeId && !item.deleted_at);
  const existingRecord = existingIndex >= 0 ? store[existingIndex] : store.find((item) => item.like_id === likeId) || null;
  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();

  if (existingIndex >= 0 && existingRecord) {
    store[existingIndex] = {
      ...existingRecord,
      like_id: likeId,
      deleted_at: timestamp,
      updated_at: timestamp,
      client_updated_at: timestamp,
      device_id: deviceId,
    };
    writeLikeStore(store, { dirty: true });
    scheduleRemoteSync();
    return false;
  }

  const nextRecord = normalizeLikeRecord({
    ...(existingRecord || {}),
    ...record,
    like_id: likeId,
    saved_at: timestamp,
    updated_at: timestamp,
    client_updated_at: timestamp,
    deleted_at: "",
    device_id: deviceId,
  });

  writeLikeStore([nextRecord, ...store.filter((item) => item.like_id !== likeId)], { dirty: true });
  scheduleRemoteSync();
  return true;
}

export function updateLikedPaper(likeId, updater) {
  const normalizedLikeId = normalizeLikeId(likeId || "");
  if (!normalizedLikeId || typeof updater !== "function") {
    return null;
  }

  const store = readLikeStore();
  const existingIndex = store.findIndex((item) => item.like_id === normalizedLikeId && !item.deleted_at);
  if (existingIndex < 0) {
    return null;
  }

  const existingRecord = store[existingIndex];
  const nextValue = updater({ ...existingRecord });
  if (!nextValue || typeof nextValue !== "object") {
    return null;
  }

  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();
  const nextRecord = normalizeLikeRecord({
    ...existingRecord,
    ...nextValue,
    like_id: normalizedLikeId,
    saved_at: existingRecord.saved_at || timestamp,
    updated_at: timestamp,
    client_updated_at: timestamp,
    deleted_at: "",
    device_id: deviceId,
  });

  store[existingIndex] = nextRecord;
  writeLikeStore(store, { dirty: true });
  scheduleRemoteSync();
  return nextRecord;
}

export function updateLikedPapers(updater) {
  if (typeof updater !== "function") {
    return [];
  }

  const store = readLikeStore();
  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();
  let changed = false;

  const nextStore = store.map((record) => {
    if (record.deleted_at) {
      return record;
    }

    const nextValue = updater({ ...record });
    if (!nextValue || typeof nextValue !== "object") {
      return record;
    }

    changed = true;
    return normalizeLikeRecord({
      ...record,
      ...nextValue,
      like_id: record.like_id,
      saved_at: record.saved_at || timestamp,
      updated_at: timestamp,
      client_updated_at: timestamp,
      deleted_at: "",
      device_id: deviceId,
    });
  });

  if (!changed) {
    return readLikes();
  }

  writeLikeStore(nextStore, { dirty: true });
  scheduleRemoteSync();
  return nextStore.filter((item) => !item.deleted_at);
}

export async function initLikesSync() {
  if (likesInitPromise) {
    return likesInitPromise;
  }
  likesInitPromise = bootstrapLikesSync();
  return likesInitPromise;
}

export function getAuthSnapshot() {
  const meta = readMeta();
  const accessPolicy = getAccessPolicy();
  return {
    configured: isSupabaseConfigured(),
    signedIn: Boolean(authUser),
    authorized: Boolean(authUser),
    user: authUser,
    syncing: syncState.syncing,
    syncError: syncState.error,
    lastSyncedAt: syncState.lastSyncedAt || meta.last_synced_at || "",
    unauthorized: false,
    unauthorizedMessage: "",
    blockedUser: null,
    accessPolicy,
  };
}

export function subscribeAuth(callback) {
  const handler = () => callback(getAuthSnapshot());
  window.addEventListener(AUTH_CHANGED_EVENT, handler);
  handler();
  return () => window.removeEventListener(AUTH_CHANGED_EVENT, handler);
}

export async function signInWithGitHub() {
  await initLikesSync();
  if (!supabaseClient) {
    return { configured: false };
  }
  clearUnauthorizedState();
  emitAuthChanged();
  return supabaseClient.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: getGitHubRedirectTo(),
    },
  });
}

export async function signOutFromGitHub() {
  await initLikesSync();
  if (!supabaseClient) {
    return { configured: false };
  }
  const result = await supabaseClient.auth.signOut();
  authSession = null;
  authUser = null;
  clearUnauthorizedState();
  emitAuthChanged();
  return result;
}

export async function syncLikesNow() {
  await initLikesSync();
  if (!supabaseClient || !authUser) {
    return readLikes();
  }

  if (syncPromise) {
    return syncPromise;
  }

  syncState = {
    ...syncState,
    syncing: true,
    error: "",
  };
  emitAuthChanged();

  syncPromise = performRemoteSync();
  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}

async function performRemoteSync() {
  try {
    const store = readLikeStore();
    const meta = readMeta();
    const initialSync = !meta.last_synced_at;
    let remoteLikes = initialSync ? await fetchRemoteLikes("") : [];
    let pendingRecords = initialSync ? getInitialSyncRecords(store, remoteLikes, "like_id") : getPendingSyncRecords(store, meta.last_synced_at);

    // Step 1: Push local changes since the last successful cursor.
    if (pendingRecords.length) {
      const upsertRows = pendingRecords.map((item) => createLikedPaperSyncRow(authUser.id, item));

      const { error } = await supabaseClient.from("liked_papers").upsert(upsertRows, {
        onConflict: "user_id,like_id",
      });
      if (error) {
        throw error;
      }
    }

    // Step 2: Pull remote changes since the last successful sync cursor and merge by updated_at.
    if (!initialSync) {
      remoteLikes = await fetchRemoteLikes(meta.last_synced_at);
    }
    const mergedStore = mergeSyncRecords(store, remoteLikes, "like_id")
      .map((item) => normalizeLikeRecord(item))
      .sort((left, right) => compareSyncTimestamps(right.saved_at || getRecordUpdatedAt(right), left.saved_at || getRecordUpdatedAt(left)));

    const syncedAt = getLatestTimestamp(
      meta.last_synced_at,
      mergedStore.map((item) => getRecordUpdatedAt(item)),
      pendingRecords.map((item) => getRecordUpdatedAt(item))
    );

    writeLikeStore(mergedStore, { dirty: false, syncedAt: syncedAt || createSyncTimestamp() });
    syncState = {
      syncing: false,
      error: "",
      lastSyncedAt: syncedAt || createSyncTimestamp(),
    };
    emitAuthChanged();
    return mergedStore.filter((item) => !item.deleted_at);
  } catch (error) {
    syncState = {
      ...syncState,
      syncing: false,
      error: formatSyncError(error),
    };
    emitAuthChanged();
    throw error;
  }
}

export function subscribeLikes(callback) {
  const handleChange = () => callback(readLikes());
  const handleStorage = (event) => {
    if (event.key === LIKES_STORAGE_KEY) {
      handleChange();
    }
  };

  window.addEventListener(LIKES_CHANGED_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(LIKES_CHANGED_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function bindLikeButtons(root, recordLookup) {
  root.querySelectorAll("[data-like-id]").forEach((button) => {
    const likeId = button.dataset.likeId;
    applyLikeButtonState(button, isLiked(likeId));
    if (button.dataset.likeBound === "true") {
      return;
    }
    button.dataset.likeBound = "true";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const entry = recordLookup.get(likeId);
      if (!entry) {
        return;
      }
      // Support both flat record and { paper, context } wrapper formats
      const record = entry.like_id ? entry : (entry.paper?.like_id ? entry.paper : entry);
      movePaperToLikes(record);
      const movableCard = button.closest("#like-later-list, #later-list");
      if (movableCard) {
        movableCard.remove();
      }
      recordLookup.render?.();
      bindLikeButtons(document, recordLookup);
    });
  });
}

function applyLikeButtonState(button, liked) {
  button.classList.toggle("is-liked", liked);
  button.setAttribute("aria-pressed", String(liked));
  button.title = liked ? "Remove Like" : "Add Like";
}

function writeLikeStore(records, options = {}) {
  const { dirty = false, syncedAt = "", silent = false } = options;
  const meta = readMeta();
  localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(records.map((item) => normalizeLikeRecord(item))));
  writeMeta({
    ...meta,
    dirty,
    last_synced_at: syncedAt || meta.last_synced_at || "",
  });
  if (!silent) {
    window.dispatchEvent(
      new CustomEvent(LIKES_CHANGED_EVENT, {
        detail: { count: records.filter((item) => !item.deleted_at).length },
      })
    );
  }
}

function normalizeLikeId(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeWorkflowStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "later") {
    return "inbox";
  }
  return WORKFLOW_STATUSES.has(normalized) ? normalized : "inbox";
}

function normalizePriorityLevel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PRIORITY_LEVELS.has(normalized) ? normalized : "medium";
}

function normalizeNoteField(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeParse(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Failed to parse likes payload", error);
    return null;
  }
}

function normalizeLikeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const likeId = normalizeLikeId(record.like_id || "");
  if (!likeId) {
    return null;
  }

  const fallbackUpdatedAt =
    (typeof record.updated_at === "string" && record.updated_at) ||
    (typeof record.client_updated_at === "string" && record.client_updated_at) ||
    (typeof record.deleted_at === "string" && record.deleted_at) ||
    (typeof record.saved_at === "string" && record.saved_at) ||
    "";

  return {
    ...record,
    like_id: likeId,
    workflow_status: normalizeWorkflowStatus(record.workflow_status),
    priority_level: normalizePriorityLevel(record.priority_level),
    one_line_takeaway: normalizeNoteField(record.one_line_takeaway),
    next_action: normalizeNoteField(record.next_action),
    custom_tags: normalizeCustomTags(record.custom_tags),
    saved_at: typeof record.saved_at === "string" ? record.saved_at : fallbackUpdatedAt,
    updated_at: fallbackUpdatedAt,
    client_updated_at: typeof record.client_updated_at === "string" ? record.client_updated_at : fallbackUpdatedAt,
    deleted_at: typeof record.deleted_at === "string" ? record.deleted_at : "",
    device_id: typeof record.device_id === "string" ? record.device_id : "",
  };
}

function normalizeCustomTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();
  return tags
    .map((tag) => {
      if (!tag || typeof tag !== "object") {
        return null;
      }
      const key = normalizeLikeId(tag.key || tag.label || "");
      const label = String(tag.label || "").trim();
      const color = String(tag.color || "").trim();
      const order = Number.isFinite(Number(tag.order)) ? Number(tag.order) : null;
      if (!key || !label) {
        return null;
      }
      return { key, label, color, order };
    })
    .filter((tag) => {
      if (!tag || seen.has(tag.key)) {
        return false;
      }
      seen.add(tag.key);
      return true;
    });
}

function readLikeStore() {
  const payload = safeParse(localStorage.getItem(LIKES_STORAGE_KEY));
  if (!Array.isArray(payload)) {
    return [];
  }

  return mergeSyncRecords(
    [],
    payload.map((item) => normalizeLikeRecord(item)).filter(Boolean),
    "like_id"
  );
}

function readMeta() {
  const payload = safeParse(localStorage.getItem(LIKES_META_KEY));
  if (!payload || typeof payload !== "object") {
    return { dirty: false, last_synced_at: "" };
  }
  return {
    dirty: Boolean(payload.dirty),
    last_synced_at: typeof payload.last_synced_at === "string" ? payload.last_synced_at : "",
  };
}

function writeMeta(meta) {
  localStorage.setItem(LIKES_META_KEY, JSON.stringify(meta));
}

function scheduleRemoteSync() {
  if (!authUser) {
    return;
  }
  syncLikesNow().catch((error) => {
    console.error("Failed to sync likes to Supabase", error);
  });
}

async function bootstrapLikesSync() {
  await loadRuntimeConfig();
  syncState = {
    ...syncState,
    lastSyncedAt: readMeta().last_synced_at || "",
  };
  if (!isSupabaseConfigured()) {
    emitAuthChanged();
    return { configured: false, signedIn: false, user: null };
  }

  supabaseClient = await getSupabaseClient();
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  authSession = session;
  authUser = session?.user || null;
  const authorized = await applyAuthorizationGuard();
  emitAuthChanged();

  supabaseClient.auth.onAuthStateChange(async (_event, sessionState) => {
    authSession = sessionState;
    authUser = sessionState?.user || null;
    const sessionAuthorized = await applyAuthorizationGuard();
    emitAuthChanged();
    if (sessionAuthorized) {
      queueHydrateOrSyncRemoteLikes();
    }
  });

  if (authorized) {
    queueHydrateOrSyncRemoteLikes();
  }

  return getAuthSnapshot();
}

async function applyAuthorizationGuard() {
  if (!authUser) {
    if (!accessState.unauthorized) {
      clearUnauthorizedState();
    }
    return false;
  }
  clearUnauthorizedState();
  return true;
}

function setUnauthorizedState(user) {
  const metadata = user?.user_metadata || {};
  const displayName =
    metadata.full_name || metadata.name || metadata.preferred_username || metadata.user_name || user?.email || user?.id;
  const email = user?.email || "";
  accessState = {
    unauthorized: true,
    message: email
      ? `Unauthorized account ${email}. Like access is restricted to allowlisted accounts only.`
      : "The current account is not on the allowlist. Like access is restricted.",
    blockedUser: {
      displayName: displayName || "Unauthorized",
      email,
      userId: user?.id || "",
      avatarUrl: metadata.avatar_url || "",
    },
  };
}

function clearUnauthorizedState() {
  accessState = {
    unauthorized: false,
    message: "",
    blockedUser: null,
  };
}

function queueHydrateOrSyncRemoteLikes() {
  if (hydratePromise) {
    return hydratePromise;
  }
  hydratePromise = hydrateOrSyncRemoteLikes()
    .catch((error) => {
      console.error("Failed to hydrate or sync likes", error);
    })
    .finally(() => {
      hydratePromise = null;
    });
  return hydratePromise;
}

async function hydrateOrSyncRemoteLikes() {
  return syncLikesNow();
}

async function fetchRemoteLikes(since = "") {
  if (!supabaseClient || !authUser) {
    return readLikeStore();
  }

  let query = supabaseClient
    .from("liked_papers")
    .select("like_id,saved_at,updated_at,deleted_at,client_updated_at,device_id,payload")
    .eq("user_id", authUser.id)
    .order("updated_at", { ascending: false });
  if (since) {
    query = query.gt("updated_at", since);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return (data || []).map((item) => hydrateLikedPaperSyncRow(item)).filter(Boolean);
}

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: getAuthSnapshot() }));
}

function formatSyncError(error) {
  if (error instanceof Error) {
    return error.message || error.name || "Unknown sync error";
  }
  if (error && typeof error === "object") {
    const parts = [error.message, error.details, error.hint, error.code].filter(Boolean);
    if (parts.length) {
      return parts.join(" · ");
    }
    try {
      return JSON.stringify(error);
    } catch (_serializeError) {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error || "Unknown sync error");
}

export function createLikedPaperSyncRow(userId, item) {
  const normalizedRecord = normalizeLikeRecord(item);
  if (!userId || !normalizedRecord) {
    return null;
  }

  return {
    user_id: userId,
    like_id: normalizedRecord.like_id,
    saved_at: normalizedRecord.saved_at || normalizedRecord.updated_at || createSyncTimestamp(),
    updated_at: normalizedRecord.updated_at || createSyncTimestamp(),
    deleted_at: normalizedRecord.deleted_at || null,
    client_updated_at: normalizedRecord.client_updated_at || null,
    device_id: normalizedRecord.device_id || getSyncDeviceId(),
    payload: normalizedRecord,
  };
}

export function hydrateLikedPaperSyncRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }

  return normalizeLikeRecord({
    ...(row.payload || {}),
    like_id: row.like_id,
    saved_at: row.saved_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    client_updated_at: row.client_updated_at,
    device_id: row.device_id,
  });
}
