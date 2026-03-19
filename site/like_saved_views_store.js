import { getSupabaseClient, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js";
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

const SAVED_VIEWS_STORAGE_KEY = "cool-paper-like-saved-views-v1";
const SAVED_VIEWS_META_KEY = "cool-paper-like-saved-views-meta-v1";
const SAVED_VIEWS_CHANGED_EVENT = "cool-paper-like-saved-views-changed";
const SAVED_VIEWS_TABLE = "like_saved_views";

let supabaseClient = null;
let authUser = null;
let initPromise = null;
let syncPromise = null;
let hydratePromise = null;
let syncTimeout = null;

export function readSavedViews() {
  return readSavedViewsStore()
    .filter((item) => !item.deleted_at)
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""), "en"));
}

export function subscribeSavedViews(callback) {
  const handleChange = () => callback(readSavedViews());
  const handleStorage = (event) => {
    if (event.key === SAVED_VIEWS_STORAGE_KEY) {
      handleChange();
    }
  };

  window.addEventListener(SAVED_VIEWS_CHANGED_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(SAVED_VIEWS_CHANGED_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function upsertSavedView(record) {
  const viewId = normalizeSavedViewId(record?.view_id || record?.id || "");
  const name = String(record?.name || "").trim();
  if (!viewId || !name) {
    return null;
  }

  const store = readSavedViewsStore();
  const existingRecord = store.find((item) => item.view_id === viewId) || null;
  const timestamp = createSyncTimestamp();
  const nextRecord = normalizeSavedViewRecord({
    ...(existingRecord || {}),
    ...record,
    view_id: viewId,
    name,
    saved_at: existingRecord?.saved_at || record?.saved_at || timestamp,
    updated_at: timestamp,
    client_updated_at: timestamp,
    deleted_at: "",
    device_id: existingRecord?.device_id || record?.device_id || getSyncDeviceId(),
  });

  writeSavedViewsStore([nextRecord, ...store.filter((item) => item.view_id !== viewId)], { dirty: true });
  scheduleRemoteSync();
  return nextRecord;
}

export function removeSavedView(viewId) {
  const normalizedViewId = normalizeSavedViewId(viewId);
  if (!normalizedViewId) {
    return false;
  }

  const store = readSavedViewsStore();
  const existingRecord = store.find((item) => item.view_id === normalizedViewId && !item.deleted_at);
  if (!existingRecord) {
    return false;
  }

  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();
  const nextStore = store.map((item) =>
    item.view_id === normalizedViewId
      ? normalizeSavedViewRecord({
          ...item,
          deleted_at: timestamp,
          updated_at: timestamp,
          client_updated_at: timestamp,
          device_id: deviceId,
        })
      : item
  );

  writeSavedViewsStore(nextStore, { dirty: true });
  scheduleRemoteSync();
  return true;
}

export async function initSavedViewsSync() {
  if (initPromise) {
    return initPromise;
  }
  initPromise = bootstrapSavedViewsSync();
  return initPromise;
}

export async function syncSavedViewsNow() {
  await initSavedViewsSync();
  if (!supabaseClient || !authUser) {
    return readSavedViews();
  }

  if (syncPromise) {
    return syncPromise;
  }

  syncPromise = performRemoteSync();
  try {
    return await syncPromise;
  } finally {
    syncPromise = null;
  }
}

function normalizeSavedViewRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const viewId = normalizeSavedViewId(record.view_id || record.id || "");
  const name = String(record.name || "").trim();
  if (!viewId || !name) {
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
    view_id: viewId,
    name,
    filters: normalizeSavedViewFilters(record.filters),
    saved_at: typeof record.saved_at === "string" ? record.saved_at : fallbackUpdatedAt,
    updated_at: fallbackUpdatedAt,
    client_updated_at: typeof record.client_updated_at === "string" ? record.client_updated_at : fallbackUpdatedAt,
    deleted_at: typeof record.deleted_at === "string" ? record.deleted_at : "",
    device_id: typeof record.device_id === "string" ? record.device_id : "",
  };
}

function normalizeSavedViewFilters(value) {
  return {
    source: String(value?.source || "").trim(),
    topic: String(value?.topic || "").trim(),
    customTag: String(value?.customTag || "").trim(),
    workflowStatus: String(value?.workflowStatus || "").trim(),
    priorityLevel: String(value?.priorityLevel || "").trim(),
    query: String(value?.query || "").trim().toLowerCase(),
  };
}

function readSavedViewsStore() {
  try {
    const payload = JSON.parse(localStorage.getItem(SAVED_VIEWS_STORAGE_KEY) || "[]");
    if (!Array.isArray(payload)) {
      return [];
    }
    return mergeSyncRecords(
      [],
      payload.map((item) => normalizeSavedViewRecord(item)).filter(Boolean),
      "view_id"
    );
  } catch {
    return [];
  }
}

function writeSavedViewsStore(records, options = {}) {
  const { dirty = false, syncedAt = "" } = options;
  const meta = readMeta();
  const normalized = records.map((item) => normalizeSavedViewRecord(item)).filter(Boolean);
  localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(normalized));
  writeMeta({
    ...meta,
    dirty,
    last_synced_at: syncedAt || meta.last_synced_at || "",
  });
  window.dispatchEvent(
    new CustomEvent(SAVED_VIEWS_CHANGED_EVENT, {
      detail: { count: normalized.filter((item) => !item.deleted_at).length },
    })
  );
}

function readMeta() {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_META_KEY);
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
  localStorage.setItem(SAVED_VIEWS_META_KEY, JSON.stringify(meta));
}

function scheduleRemoteSync() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    syncSavedViewsNow().catch((error) => {
      console.error("Failed to sync saved views to Supabase", error);
    });
  }, 1500);
}

async function bootstrapSavedViewsSync() {
  await loadRuntimeConfig();
  if (!isSupabaseConfigured()) {
    return { configured: false, signedIn: false, user: null };
  }

  supabaseClient = await getSupabaseClient();
  const {
    data: { session },
  } = await supabaseClient.auth.getSession();
  authUser = session?.user || null;

  supabaseClient.auth.onAuthStateChange(async (_event, sessionState) => {
    authUser = sessionState?.user || null;
    if (authUser) {
      queueHydrateOrSyncSavedViews();
    }
  });

  if (authUser) {
    queueHydrateOrSyncSavedViews();
  }

  return {
    configured: true,
    signedIn: Boolean(authUser),
    user: authUser,
  };
}

function queueHydrateOrSyncSavedViews() {
  if (hydratePromise) {
    return hydratePromise;
  }
  hydratePromise = syncSavedViewsNow()
    .catch((error) => {
      console.error("Failed to hydrate or sync saved views", error);
    })
    .finally(() => {
      hydratePromise = null;
    });
  return hydratePromise;
}

async function performRemoteSync() {
  const store = readSavedViewsStore();
  const meta = readMeta();
  const initialSync = !meta.last_synced_at;
  let remoteViews = initialSync ? await fetchRemoteSavedViews("") : [];
  const pendingRecords = initialSync
    ? getInitialSyncRecords(store, remoteViews, "view_id")
    : getPendingSyncRecords(store, meta.last_synced_at);

  if (pendingRecords.length) {
    const { error } = await supabaseClient.from(SAVED_VIEWS_TABLE).upsert(
      pendingRecords.map((item) => ({
        user_id: authUser.id,
        view_id: item.view_id,
        saved_at: item.saved_at || item.updated_at || createSyncTimestamp(),
        updated_at: item.updated_at || createSyncTimestamp(),
        deleted_at: item.deleted_at || null,
        client_updated_at: item.client_updated_at || null,
        device_id: item.device_id || getSyncDeviceId(),
        payload: {
          name: item.name,
          filters: item.filters,
        },
      })),
      { onConflict: "user_id,view_id" }
    );
    if (error) {
      throw error;
    }
  }

  if (!initialSync) {
    remoteViews = await fetchRemoteSavedViews(meta.last_synced_at);
  }

  const mergedStore = mergeSyncRecords(store, remoteViews, "view_id")
    .map((item) => normalizeSavedViewRecord(item))
    .filter(Boolean)
    .sort((left, right) => compareSyncTimestamps(right.updated_at || getRecordUpdatedAt(right), left.updated_at || getRecordUpdatedAt(left)));

  const syncedAt =
    getLatestTimestamp(
      meta.last_synced_at,
      mergedStore.map((item) => getRecordUpdatedAt(item)),
      pendingRecords.map((item) => getRecordUpdatedAt(item))
    ) || createSyncTimestamp();

  writeSavedViewsStore(mergedStore, { dirty: false, syncedAt });
  return mergedStore.filter((item) => !item.deleted_at);
}

async function fetchRemoteSavedViews(since = "") {
  const client = await getSupabaseClient();
  let query = client
    .from(SAVED_VIEWS_TABLE)
    .select("view_id,saved_at,updated_at,deleted_at,client_updated_at,device_id,payload")
    .eq("user_id", authUser.id)
    .order("updated_at", { ascending: false });
  if (since) {
    query = query.gt("updated_at", since);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || [])
    .map((row) =>
      normalizeSavedViewRecord({
        view_id: row.view_id,
        saved_at: row.saved_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
        client_updated_at: row.client_updated_at,
        device_id: row.device_id,
        name: row.payload?.name,
        filters: row.payload?.filters,
      })
    )
    .filter(Boolean);
}

function normalizeSavedViewId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
