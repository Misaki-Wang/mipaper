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

const DIRECT_ADDS_STORAGE_KEY = "cool-paper-direct-adds-v1";
const DIRECT_ADDS_META_KEY = "cool-paper-direct-adds-meta-v1";
const DIRECT_ADDS_MIGRATED_KEY = "cool-paper-direct-adds-migrated-v1";
const DIRECT_ADDS_CHANGED_EVENT = "cool-paper-direct-adds-changed";
const DIRECT_ADDS_TABLE = "direct_add_papers";
const HIDDEN_LIBRARY_SNAPSHOT_LABELS = new Set(["quick add"]);

let supabaseClient = null;
let authUser = null;
let initPromise = null;
let syncPromise = null;
let hydratePromise = null;
let syncTimeout = null;

export function readDirectAdds() {
  return readDirectAddStore()
    .filter((item) => !item.deleted_at)
    .sort((left, right) => (right.saved_at || "").localeCompare(left.saved_at || ""));
}

export function upsertDirectAdd(record, context = {}) {
  const store = readDirectAddStore();
  const likeId = normalizeLikeId(record?.like_id || record?.paper_id || record?.abs_url || record?.detail_url || "");
  if (!likeId) {
    return null;
  }

  const existingRecord = store.find((item) => item.like_id === likeId) || null;
  const timestamp = createSyncTimestamp();
  const sourceKind = context.sourceKind || record?.source_kind || "library";
  const nextRecord = normalizeDirectAddRecord({
    ...(existingRecord || {}),
    ...record,
    like_id: likeId,
    source_kind: sourceKind,
    source_label: context.sourceLabel || record?.source_label || "Library",
    source_page: context.sourcePage || record?.source_page || "",
    snapshot_label: normalizeSnapshotLabel(sourceKind, context.snapshotLabel || record?.snapshot_label || ""),
    saved_at: existingRecord?.saved_at || record?.saved_at || timestamp,
    updated_at: timestamp,
    client_updated_at: timestamp,
    deleted_at: "",
    device_id: typeof record?.device_id === "string" ? record.device_id : existingRecord?.device_id || "",
  });

  writeDirectAddStore([nextRecord, ...store.filter((item) => item.like_id !== likeId)], { dirty: true });
  scheduleRemoteSync();
  return nextRecord;
}

export function removeDirectAdd(likeId) {
  const normalizedLikeId = normalizeLikeId(likeId);
  if (!normalizedLikeId) {
    return false;
  }

  const store = readDirectAddStore();
  const existingRecord = store.find((item) => item.like_id === normalizedLikeId && !item.deleted_at);
  if (!existingRecord) {
    return false;
  }

  const timestamp = createSyncTimestamp();
  const deviceId = getSyncDeviceId();
  const nextStore = store.map((item) =>
    item.like_id === normalizedLikeId
      ? normalizeDirectAddRecord({
          ...item,
          deleted_at: timestamp,
          updated_at: timestamp,
          client_updated_at: timestamp,
          device_id: deviceId,
        })
      : item
  );

  writeDirectAddStore(nextStore, { dirty: true });
  scheduleRemoteSync();
  return true;
}

export function seedDirectAdds(records = [], options = {}) {
  const directRecords = Array.isArray(records) ? records.filter(Boolean) : [];
  if (!directRecords.length) {
    return readDirectAdds();
  }

  const { dirty = false, syncedAt = "" } = options;
  const store = readDirectAddStore();
  const merged = mergeSyncRecords(store, directRecords.map((item) => normalizeDirectAddRecord(item)), "like_id").map(
    (item) => normalizeDirectAddRecord(item)
  );
  writeDirectAddStore(merged, { dirty, syncedAt });
  if (dirty) {
    scheduleRemoteSync();
  }
  return readDirectAdds();
}

export function subscribeDirectAdds(callback) {
  const handleChange = () => callback(readDirectAdds());
  const handleStorage = (event) => {
    if (event.key === DIRECT_ADDS_STORAGE_KEY) {
      handleChange();
    }
  };

  window.addEventListener(DIRECT_ADDS_CHANGED_EVENT, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(DIRECT_ADDS_CHANGED_EVENT, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}

export function hasDirectAddsMigrationRun() {
  try {
    return localStorage.getItem(DIRECT_ADDS_MIGRATED_KEY) === "true";
  } catch {
    return false;
  }
}

export function markDirectAddsMigrationRun() {
  try {
    localStorage.setItem(DIRECT_ADDS_MIGRATED_KEY, "true");
  } catch {
    // Ignore storage failures.
  }
}

export async function initDirectAddSync() {
  if (initPromise) {
    return initPromise;
  }
  initPromise = bootstrapDirectAddSync();
  return initPromise;
}

export async function syncDirectAddsNow() {
  await initDirectAddSync();
  if (!supabaseClient || !authUser) {
    return readDirectAdds();
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

function normalizeDirectAddRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const likeId = normalizeLikeId(record.like_id || record.paper_id || "");
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
    source_kind: typeof record.source_kind === "string" && record.source_kind ? record.source_kind : "library",
    source_label: typeof record.source_label === "string" && record.source_label ? record.source_label : "Library",
    source_page: typeof record.source_page === "string" ? record.source_page : "",
    snapshot_label: normalizeSnapshotLabel(record.source_kind, record.snapshot_label),
    saved_at: typeof record.saved_at === "string" ? record.saved_at : fallbackUpdatedAt,
    updated_at: fallbackUpdatedAt,
    client_updated_at: typeof record.client_updated_at === "string" ? record.client_updated_at : fallbackUpdatedAt,
    deleted_at: typeof record.deleted_at === "string" ? record.deleted_at : "",
    device_id: typeof record.device_id === "string" ? record.device_id : "",
  };
}

function normalizeSnapshotLabel(sourceKind, snapshotLabel) {
  const normalizedSourceKind = typeof sourceKind === "string" ? sourceKind.trim().toLowerCase() : "";
  const normalizedSnapshotLabel = typeof snapshotLabel === "string" ? snapshotLabel.trim() : "";
  if (!normalizedSnapshotLabel) {
    return "";
  }
  if (normalizedSourceKind === "library" && HIDDEN_LIBRARY_SNAPSHOT_LABELS.has(normalizedSnapshotLabel.toLowerCase())) {
    return "";
  }
  return normalizedSnapshotLabel;
}

function readDirectAddStore() {
  try {
    const payload = JSON.parse(localStorage.getItem(DIRECT_ADDS_STORAGE_KEY) || "[]");
    if (!Array.isArray(payload)) {
      return [];
    }
    return mergeSyncRecords(
      [],
      payload.map((item) => normalizeDirectAddRecord(item)).filter(Boolean),
      "like_id"
    );
  } catch {
    return [];
  }
}

function writeDirectAddStore(records, options = {}) {
  const { dirty = false, syncedAt = "" } = options;
  const meta = readMeta();
  const normalized = records.map((item) => normalizeDirectAddRecord(item)).filter(Boolean);
  localStorage.setItem(DIRECT_ADDS_STORAGE_KEY, JSON.stringify(normalized));
  writeMeta({
    ...meta,
    dirty,
    last_synced_at: syncedAt || meta.last_synced_at || "",
  });
  window.dispatchEvent(
    new CustomEvent(DIRECT_ADDS_CHANGED_EVENT, {
      detail: { count: normalized.filter((item) => !item.deleted_at).length },
    })
  );
}

function readMeta() {
  try {
    const raw = localStorage.getItem(DIRECT_ADDS_META_KEY);
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
  localStorage.setItem(DIRECT_ADDS_META_KEY, JSON.stringify(meta));
}

function scheduleRemoteSync() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }
  syncTimeout = setTimeout(() => {
    syncDirectAddsNow().catch((error) => {
      console.error("Failed to sync direct adds to Supabase", error);
    });
  }, 1500);
}

async function bootstrapDirectAddSync() {
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
      queueHydrateOrSyncDirectAdds();
    }
  });

  if (authUser) {
    queueHydrateOrSyncDirectAdds();
  }

  return {
    configured: true,
    signedIn: Boolean(authUser),
    user: authUser,
  };
}

function queueHydrateOrSyncDirectAdds() {
  if (hydratePromise) {
    return hydratePromise;
  }
  hydratePromise = syncDirectAddsNow()
    .catch((error) => {
      console.error("Failed to hydrate or sync direct adds", error);
    })
    .finally(() => {
      hydratePromise = null;
    });
  return hydratePromise;
}

async function performRemoteSync() {
  try {
    const store = readDirectAddStore();
    const meta = readMeta();
    const initialSync = !meta.last_synced_at;
    let remoteAdds = initialSync ? await fetchRemoteDirectAdds("") : [];
    const pendingRecords = initialSync
      ? getInitialSyncRecords(store, remoteAdds, "like_id")
      : getPendingSyncRecords(store, meta.last_synced_at);

    if (pendingRecords.length) {
      const { error } = await supabaseClient.from(DIRECT_ADDS_TABLE).upsert(
        pendingRecords.map((item) => ({
          user_id: authUser.id,
          like_id: item.like_id,
          saved_at: item.saved_at || item.updated_at || createSyncTimestamp(),
          updated_at: item.updated_at || createSyncTimestamp(),
          deleted_at: item.deleted_at || null,
          client_updated_at: item.client_updated_at || null,
          device_id: item.device_id || getSyncDeviceId(),
          payload: item,
        })),
        { onConflict: "user_id,like_id" }
      );
      if (error) {
        throw error;
      }
    }

    if (!initialSync) {
      remoteAdds = await fetchRemoteDirectAdds(meta.last_synced_at);
    }

    const mergedStore = mergeSyncRecords(store, remoteAdds, "like_id")
      .map((item) => normalizeDirectAddRecord(item))
      .filter(Boolean)
      .sort((left, right) => compareSyncTimestamps(right.saved_at || getRecordUpdatedAt(right), left.saved_at || getRecordUpdatedAt(left)));

    const syncedAt =
      getLatestTimestamp(
        meta.last_synced_at,
        mergedStore.map((item) => getRecordUpdatedAt(item)),
        pendingRecords.map((item) => getRecordUpdatedAt(item))
      ) || createSyncTimestamp();

    writeDirectAddStore(mergedStore, { dirty: false, syncedAt });
    return mergedStore.filter((item) => !item.deleted_at);
  } catch (error) {
    throw error;
  }
}

async function fetchRemoteDirectAdds(since = "") {
  const client = await getSupabaseClient();
  let query = client
    .from(DIRECT_ADDS_TABLE)
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

  return (data || [])
    .map((row) =>
      normalizeDirectAddRecord({
        ...(row.payload || {}),
        like_id: row.like_id,
        saved_at: row.saved_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
        client_updated_at: row.client_updated_at,
        device_id: row.device_id,
      })
    )
    .filter(Boolean);
}

function normalizeLikeId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
