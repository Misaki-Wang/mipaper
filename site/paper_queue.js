import {
  createLikeRecord,
  getLikeId,
} from "./likes.js";

import {
  getSupabaseClient,
  isSupabaseConfigured,
} from "./supabase.js";

const QUEUE_STORAGE_KEY = "cool-paper-queue-v1";
const QUEUE_META_KEY = "cool-paper-queue-meta-v1";
const QUEUE_CHANGED_EVENT = "cool-paper-queue-changed";

let supabaseClient = null;
let authSession = null;
let authUser = null;

export function readQueue(status = null) {
  const payload = JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || "[]");
  const items = Array.isArray(payload) ? payload : [];
  const filtered = status ? items.filter(item => item.status === status) : items;
  return filtered.sort((a, b) => (b.saved_at || "").localeCompare(a.saved_at || ""));
}

export function addToQueue(paper, context, status = 'later') {
  const queue = readQueue();
  const record = createLikeRecord(paper, context);
  const likeId = getLikeId(paper);
  const existing = queue.find(item => item.like_id === likeId);

  if (existing) {
    existing.status = status;
    existing.saved_at = new Date().toISOString();
  } else {
    queue.push({
      ...record,
      status: status,
      saved_at: new Date().toISOString(),
    });
  }

  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
  scheduleSync();
}

export function removeFromQueue(likeId) {
  const queue = readQueue().filter(item => item.like_id !== likeId);
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
  scheduleSync();
}

export function moveToLike(likeId) {
  const queue = readQueue();
  const item = queue.find(i => i.like_id === likeId);
  if (item) {
    item.status = 'like';
    item.saved_at = new Date().toISOString();
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
    scheduleSync();
  }
}

export function isInQueue(likeId, status = null) {
  const queue = readQueue(status);
  return queue.some(item => item.like_id === likeId);
}

let syncTimeout = null;

function scheduleSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => performSync(), 2000);
}

async function performSync() {
  if (!isSupabaseConfigured() || !authSession || !authUser) return;

  try {
    const client = await getSupabaseClient();
    const queue = readQueue();

    // Upload to Supabase
    const upsertRows = queue.map(item => ({
      user_id: authUser.id,
      paper_id: item.like_id,
      status: item.status,
      saved_at: item.saved_at,
      payload: item,
    }));

    if (upsertRows.length) {
      await client.from('paper_queue').upsert(upsertRows, {
        onConflict: 'user_id,paper_id',
      });
    }

    // Fetch remote data
    const { data } = await client.from('paper_queue')
      .select('*')
      .eq('user_id', authUser.id);

    if (data) {
      const remoteQueue = data.map(row => ({
        ...row.payload,
        status: row.status,
        saved_at: row.saved_at,
      }));
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remoteQueue));
      window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
    }
  } catch (error) {
    console.error('Queue sync failed:', error);
  }
}

export async function initQueue() {
  if (!isSupabaseConfigured()) return;

  const client = await getSupabaseClient();
  const { data: { session } } = await client.auth.getSession();

  if (session) {
    authSession = session;
    authUser = session.user;
    await performSync();
  }
}

export function subscribeQueue(callback) {
  window.addEventListener(QUEUE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, callback);
}

export function bindQueueButtons(root, recordLookup) {
  // Bind Later buttons
  root.querySelectorAll("[data-later-id]").forEach((button) => {
    const likeId = button.dataset.laterId;
    const inLater = isInQueue(likeId, 'later');
    button.classList.toggle("is-later", inLater);
    button.setAttribute("aria-pressed", String(inLater));

    if (button.dataset.laterBound === "true") return;
    button.dataset.laterBound = "true";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const record = recordLookup.get(likeId);
      if (!record) return;

      if (isInQueue(likeId, 'later')) {
        removeFromQueue(likeId);
      } else {
        addToQueue(record.paper, record.context, 'later');
      }
    });
  });

  // Bind Like buttons (override existing)
  root.querySelectorAll("[data-like-id]").forEach((button) => {
    const likeId = button.dataset.likeId;
    const inLike = isInQueue(likeId, 'like');
    button.classList.toggle("is-liked", inLike);
    button.setAttribute("aria-pressed", String(inLike));

    if (button.dataset.queueLikeBound === "true") return;
    button.dataset.queueLikeBound = "true";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const record = recordLookup.get(likeId);
      if (!record) return;

      if (isInQueue(likeId, 'like')) {
        removeFromQueue(likeId);
      } else {
        addToQueue(record.paper, record.context, 'like');
      }
    });
  });
}

