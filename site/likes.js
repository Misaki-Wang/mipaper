import { getGitHubRedirectTo, getSupabaseClient, isSupabaseConfigured, loadRuntimeConfig } from "./supabase.js";

const LIKES_STORAGE_KEY = "cool-paper-liked-papers-v1";
const LIKES_META_KEY = "cool-paper-liked-papers-meta-v1";
const LIKES_CHANGED_EVENT = "cool-paper-likes-changed";
const AUTH_CHANGED_EVENT = "cool-paper-auth-changed";

const SOURCE_LABELS = {
  daily: "Cool Daily",
  conference: "Conference",
  hf_daily: "HF Daily",
};

let supabaseClient = null;
let authSession = null;
let authUser = null;
let likesInitPromise = null;

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
    topic_label: paper.topic_label || "其他 AI",
    authors: Array.isArray(paper.authors) ? paper.authors.filter(Boolean) : [],
    abstract: typeof paper.abstract === "string" ? paper.abstract.trim() : "",
    pdf_url: paper.arxiv_pdf_url || paper.pdf_url || "",
    abs_url: paper.arxiv_url || paper.abs_url || "",
    detail_url: paper.detail_url || "",
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
  };
}

export function readLikes() {
  const payload = safeParse(localStorage.getItem(LIKES_STORAGE_KEY));
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload
    .filter((item) => item && typeof item.like_id === "string" && item.like_id)
    .sort((left, right) => (right.saved_at || "").localeCompare(left.saved_at || ""));
}

export function isLiked(likeId) {
  return readLikes().some((item) => item.like_id === likeId);
}

export function toggleLike(record) {
  const likes = readLikes();
  const index = likes.findIndex((item) => item.like_id === record.like_id);
  if (index >= 0) {
    likes.splice(index, 1);
    writeLikes(likes, { dirty: true });
    scheduleRemoteSync();
    return false;
  }

  const next = [
    {
      ...record,
      saved_at: new Date().toISOString(),
    },
    ...likes.filter((item) => item.like_id !== record.like_id),
  ];
  writeLikes(next, { dirty: true });
  scheduleRemoteSync();
  return true;
}

export async function initLikesSync() {
  if (likesInitPromise) {
    return likesInitPromise;
  }
  likesInitPromise = bootstrapLikesSync();
  return likesInitPromise;
}

export function getAuthSnapshot() {
  return {
    configured: isSupabaseConfigured(),
    signedIn: Boolean(authUser),
    user: authUser,
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
  emitAuthChanged();
  return result;
}

export async function syncLikesNow() {
  await initLikesSync();
  if (!supabaseClient || !authUser) {
    return readLikes();
  }

  const likes = readLikes();
  const upsertRows = likes.map((item) => ({
    user_id: authUser.id,
    like_id: item.like_id,
    saved_at: item.saved_at || new Date().toISOString(),
    payload: item,
  }));

  if (upsertRows.length) {
    const { error } = await supabaseClient.from("liked_papers").upsert(upsertRows, {
      onConflict: "user_id,like_id",
    });
    if (error) {
      throw error;
    }
  }

  const { data: remoteRows, error: remoteError } = await supabaseClient
    .from("liked_papers")
    .select("like_id")
    .eq("user_id", authUser.id);
  if (remoteError) {
    throw remoteError;
  }

  const localIds = new Set(likes.map((item) => item.like_id));
  const staleIds = (remoteRows || []).map((item) => item.like_id).filter((likeId) => !localIds.has(likeId));
  if (staleIds.length) {
    const { error } = await supabaseClient
      .from("liked_papers")
      .delete()
      .eq("user_id", authUser.id)
      .in("like_id", staleIds);
    if (error) {
      throw error;
    }
  }

  const remoteLikes = await fetchRemoteLikes();
  writeLikes(remoteLikes, { dirty: false, syncedAt: new Date().toISOString() });
  return remoteLikes;
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
      const record = recordLookup.get(likeId);
      if (!record) {
        return;
      }
      toggleLike(record);
      bindLikeButtons(document, recordLookup);
    });
  });
}

function applyLikeButtonState(button, liked) {
  button.classList.toggle("is-liked", liked);
  button.setAttribute("aria-pressed", String(liked));
  button.title = liked ? "取消 Like" : "加入 Like";
}

function writeLikes(records, options = {}) {
  const { dirty = false, syncedAt = "", silent = false } = options;
  const meta = readMeta();
  localStorage.setItem(LIKES_STORAGE_KEY, JSON.stringify(records));
  writeMeta({
    ...meta,
    dirty,
    last_synced_at: syncedAt || meta.last_synced_at || "",
  });
  if (!silent) {
    window.dispatchEvent(new CustomEvent(LIKES_CHANGED_EVENT, { detail: { count: records.length } }));
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
  emitAuthChanged();

  supabaseClient.auth.onAuthStateChange(async (_event, sessionState) => {
    authSession = sessionState;
    authUser = sessionState?.user || null;
    emitAuthChanged();
    if (authUser) {
      await hydrateOrSyncRemoteLikes();
    }
  });

  if (authUser) {
    await hydrateOrSyncRemoteLikes();
  }

  return getAuthSnapshot();
}

async function hydrateOrSyncRemoteLikes() {
  const likes = readLikes();
  const meta = readMeta();
  if (!likes.length && !meta.dirty) {
    const remoteLikes = await fetchRemoteLikes();
    writeLikes(remoteLikes, { dirty: false, syncedAt: new Date().toISOString() });
    return remoteLikes;
  }
  return syncLikesNow();
}

async function fetchRemoteLikes() {
  if (!supabaseClient || !authUser) {
    return readLikes();
  }
  const { data, error } = await supabaseClient
    .from("liked_papers")
    .select("like_id,saved_at,payload")
    .eq("user_id", authUser.id)
    .order("saved_at", { ascending: false });
  if (error) {
    throw error;
  }
  return (data || [])
    .map((item) => ({
      ...(item.payload || {}),
      like_id: item.like_id,
      saved_at: item.saved_at,
    }))
    .sort((left, right) => (right.saved_at || "").localeCompare(left.saved_at || ""));
}

function emitAuthChanged() {
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail: getAuthSnapshot() }));
}
