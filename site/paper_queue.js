import { createLikeRecord, isLiked } from "./likes.js?v=20260319-9";
import { getSupabaseClient, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js";
import { movePaperToLater, movePaperToLikes } from "./paper_selection.js?v=20260319-5";
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

const QUEUE_STORAGE_KEY = "cool-paper-queue-v1";
const QUEUE_META_KEY = "cool-paper-queue-meta-v1";
const QUEUE_CHANGED_EVENT = "cool-paper-queue-changed";

let authSession = null;
let authUser = null;
let syncTimeout = null;

function readMeta() {
  try {
    const raw = localStorage.getItem(QUEUE_META_KEY);
    if (!raw) {
      return { dirty: false, last_synced_at: "" };
    }
    const meta = JSON.parse(raw);
    return {
      dirty: Boolean(meta.dirty),
      last_synced_at: typeof meta.last_synced_at === "string" ? meta.last_synced_at : "",
    };
  } catch {
    return { dirty: false, last_synced_at: "" };
  }
}

function writeMeta(meta) {
  localStorage.setItem(QUEUE_META_KEY, JSON.stringify(meta));
}

function normalizeQueueRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const likeId = typeof record.like_id === "string" ? record.like_id.trim() : "";
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
    status: "later",
    saved_at: typeof record.saved_at === "string" ? record.saved_at : fallbackUpdatedAt,
    updated_at: fallbackUpdatedAt,
    client_updated_at: typeof record.client_updated_at === "string" ? record.client_updated_at : fallbackUpdatedAt,
    deleted_at: typeof record.deleted_at === "string" ? record.deleted_at : "",
    device_id: typeof record.device_id === "string" ? record.device_id : "",
  };
}

function readQueueStore() {
  try {
    const payload = JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || "[]");
    if (!Array.isArray(payload)) {
      return [];
    }
    return mergeSyncRecords(
      [],
      payload.map((item) => normalizeQueueRecord(item)).filter(Boolean),
      "like_id"
    );
  } catch {
    return [];
  }
}

function writeQueueStore(records, options = {}) {
  const { dirty = false, syncedAt = "" } = options;
  const meta = readMeta();
  const normalized = records.map((item) => normalizeQueueRecord(item)).filter(Boolean);
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(normalized));
  writeMeta({
    ...meta,
    dirty,
    last_synced_at: syncedAt || meta.last_synced_at || "",
  });
  window.dispatchEvent(
    new CustomEvent(QUEUE_CHANGED_EVENT, {
      detail: { count: normalized.filter((item) => !item.deleted_at).length },
    })
  );
}

export function readQueue(status = null) {
  const items = readQueueStore()
    .filter((item) => !item.deleted_at)
    .filter((item) => (status ? item.status === status : true));
  return items.sort((left, right) => (right.saved_at || "").localeCompare(left.saved_at || ""));
}

export function addToQueue(paper, context, options = {}) {
  const store = readQueueStore();
  const record = paper?.like_id ? paper : createLikeRecord(paper, context);
  const likeId = record.like_id;
  const existingRecord = store.find((item) => item.like_id === likeId) || null;
  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();
  const preserveOrder = Boolean(options.preserveOrder && existingRecord);

  if (isLiked(likeId)) {
    movePaperToLikes(record);
  }

  const nextRecord = normalizeQueueRecord({
    ...(existingRecord || {}),
    ...record,
    like_id: likeId,
    status: "later",
    saved_at: preserveOrder && existingRecord?.saved_at ? existingRecord.saved_at : timestamp,
    updated_at: timestamp,
    client_updated_at: timestamp,
    deleted_at: "",
    device_id: deviceId,
  });

  writeQueueStore([nextRecord, ...store.filter((item) => item.like_id !== likeId)], { dirty: true });
  scheduleSync();
}

export function removeFromQueue(likeId) {
  const store = readQueueStore();
  const existingRecord = store.find((item) => item.like_id === likeId && !item.deleted_at);
  if (!existingRecord) {
    return;
  }

  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();
  const nextStore = store.map((item) =>
    item.like_id === likeId
      ? normalizeQueueRecord({
          ...item,
          deleted_at: timestamp,
          updated_at: timestamp,
          client_updated_at: timestamp,
          device_id: deviceId,
        })
      : item
  );

  writeQueueStore(nextStore, { dirty: true });
  scheduleSync();
}

export function isInQueue(likeId) {
  return readQueue("later").some((item) => item.like_id === likeId);
}

function scheduleSync() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    performSync().catch((error) => {
      console.error("Queue sync failed:", error);
    });
  }, 2000);
}

async function performSync() {
  if (!isSupabaseConfigured() || !authSession || !authUser) {
    return;
  }

  const client = await getSupabaseClient();
  const store = readQueueStore().map((item) => normalizeQueueRecord(item)).filter(Boolean);
  const meta = readMeta();
  const initialSync = !meta.last_synced_at;
  let remoteStore = initialSync ? await fetchRemoteQueue("") : [];
  const pendingRecords = initialSync ? getInitialSyncRecords(store, remoteStore, "like_id") : getPendingSyncRecords(store, meta.last_synced_at);

  if (pendingRecords.length) {
    const { error } = await client.from("paper_queue").upsert(
      pendingRecords.map((item) => ({
        user_id: authUser.id,
        paper_id: item.like_id,
        status: "later",
        saved_at: item.saved_at || item.updated_at || createSyncTimestamp(),
        updated_at: item.updated_at || createSyncTimestamp(),
        deleted_at: item.deleted_at || null,
        client_updated_at: item.client_updated_at || null,
        device_id: item.device_id || getSyncDeviceId(),
        payload: item,
      })),
      { onConflict: "user_id,paper_id" }
    );
    if (error) {
      throw error;
    }
  }

  if (!initialSync) {
    remoteStore = await fetchRemoteQueue(meta.last_synced_at);
  }

  const mergedStore = mergeSyncRecords(store, remoteStore, "like_id")
    .map((item) => normalizeQueueRecord(item))
    .filter(Boolean)
    .sort((left, right) => compareSyncTimestamps(right.saved_at || getRecordUpdatedAt(right), left.saved_at || getRecordUpdatedAt(left)));

  const syncedAt =
    getLatestTimestamp(
      meta.last_synced_at,
      mergedStore.map((item) => getRecordUpdatedAt(item)),
      pendingRecords.map((item) => getRecordUpdatedAt(item))
    ) || createSyncTimestamp();

  writeQueueStore(mergedStore, { dirty: false, syncedAt });
}

async function fetchRemoteQueue(since = "") {
  const client = await getSupabaseClient();
  let query = client
    .from("paper_queue")
    .select("paper_id,status,saved_at,updated_at,deleted_at,client_updated_at,device_id,payload")
    .eq("user_id", authUser.id);
  if (since) {
    query = query.gt("updated_at", since);
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) =>
      normalizeQueueRecord({
        ...(row.payload || {}),
        like_id: row.paper_id,
        status: row.status || "later",
        saved_at: row.saved_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
        client_updated_at: row.client_updated_at,
        device_id: row.device_id,
      })
    )
    .filter(Boolean);
}

export async function initQueue() {
  await loadRuntimeConfig();

  if (!isSupabaseConfigured()) {
    return;
  }

  const client = await getSupabaseClient();
  const {
    data: { session },
  } = await client.auth.getSession();

  if (session) {
    authSession = session;
    authUser = session.user;
    await performSync();
  }

  client.auth.onAuthStateChange(async (_event, sessionState) => {
    const previousUserId = authUser?.id || "";
    authSession = sessionState;
    authUser = sessionState?.user || null;
    if (authUser && authUser.id !== previousUserId) {
      await performSync();
    }
  });
}

export function subscribeQueue(callback) {
  window.addEventListener(QUEUE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, callback);
}

export function bindQueueButtons(root, recordLookup) {
  root.querySelectorAll("[data-later-id]").forEach((button) => {
    const likeId = button.dataset.laterId;
    const inLater = isInQueue(likeId);
    button.classList.toggle("is-later", inLater);
    button.setAttribute("aria-pressed", String(inLater));

    if (button.dataset.laterBound === "true") {
      return;
    }
    button.dataset.laterBound = "true";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const record = recordLookup.get(likeId);
      if (!record) {
        return;
      }

      if (isInQueue(likeId)) {
        removeFromQueue(likeId);
      } else {
        const paper = record.paper || record;
        const context = record.context || {};
        movePaperToLater(paper, context);
      }
      recordLookup.render?.();
    });
  });
}
