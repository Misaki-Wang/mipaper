import {
  createLikeRecord,
} from "./likes.js";

import {
  getSupabaseClient,
  isSupabaseConfigured,
  loadRuntimeConfig,
} from "./supabase.js";

const QUEUE_STORAGE_KEY = "cool-paper-queue-v1";
const QUEUE_META_KEY = "cool-paper-queue-meta-v1";
const QUEUE_CHANGED_EVENT = "cool-paper-queue-changed";

let authSession = null;
let authUser = null;

function readMeta() {
  try {
    const raw = localStorage.getItem(QUEUE_META_KEY);
    if (!raw) return { dirty: false };
    const meta = JSON.parse(raw);
    return { dirty: Boolean(meta.dirty) };
  } catch { return { dirty: false }; }
}

function writeMeta(meta) {
  localStorage.setItem(QUEUE_META_KEY, JSON.stringify(meta));
}

export function readQueue(status = null) {
  const payload = JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) || "[]");
  const items = Array.isArray(payload) ? payload : [];
  const filtered = status ? items.filter(item => item.status === status) : items;
  return filtered.sort((a, b) => (b.saved_at || "").localeCompare(a.saved_at || ""));
}

export function addToQueue(paper, context, status = 'later') {
  const queue = readQueue();
  // If paper already has like_id, it's already a processed record
  const record = paper?.like_id ? paper : createLikeRecord(paper, context);
  const likeId = record.like_id;
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

  // Set dirty flag BEFORE writing to localStorage to ensure consistency
  writeMeta({ dirty: true });
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
  scheduleSync();
}

export function removeFromQueue(likeId) {
  const queue = readQueue().filter(item => item.like_id !== likeId);
  // Set dirty flag BEFORE writing to localStorage
  writeMeta({ dirty: true });
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
    // Set dirty flag BEFORE writing to localStorage
    writeMeta({ dirty: true });
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
  console.log('performSync: Starting...', {
    configured: isSupabaseConfigured(),
    hasSession: !!authSession,
    hasUser: !!authUser
  });

  if (!isSupabaseConfigured() || !authSession || !authUser) {
    console.log('performSync: Skipping - missing requirements');
    return;
  }

  try {
    const client = await getSupabaseClient();
    const queue = readQueue();
    const meta = readMeta();
    console.log('performSync: Local queue has', queue.length, 'items, dirty:', meta.dirty);

    // If local is empty and NOT dirty, just hydrate from remote (don't delete remote data)
    if (queue.length === 0 && !meta.dirty) {
      console.log('performSync: Local empty & clean — hydrating from remote');
      const { data, error } = await client.from('paper_queue')
        .select('*')
        .eq('user_id', authUser.id);
      if (error) throw error;

      const remoteQueue = (data || []).map(row => ({
        ...row.payload,
        status: row.status,
        saved_at: row.saved_at,
      }));
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remoteQueue));
      writeMeta({ dirty: false });
      window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
      console.log('performSync: Hydrated', remoteQueue.length, 'items from remote');
      return;
    }

    // Local has data or is dirty — do full bidirectional sync
    const upsertRows = queue.map(item => ({
      user_id: authUser.id,
      paper_id: item.like_id,
      status: item.status,
      saved_at: item.saved_at,
      payload: item,
    }));

    if (upsertRows.length) {
      const { data: upsertData, error } = await client.from('paper_queue').upsert(upsertRows, {
        onConflict: 'user_id,paper_id',
      }).select();
      if (error) throw error;
      if (!upsertData || upsertData.length === 0) {
        console.error('performSync: RLS BLOCKED - upsert returned no data!');
      }
      console.log('performSync: Uploaded', upsertRows.length, 'items');
    }

    // Delete remote items that are no longer in local
    const { data: remoteRows, error: remoteError } = await client
      .from('paper_queue')
      .select('paper_id')
      .eq('user_id', authUser.id);
    if (remoteError) throw remoteError;

    const localIds = new Set(queue.map(item => item.like_id));
    const staleIds = (remoteRows || []).map(row => row.paper_id).filter(id => !localIds.has(id));
    if (staleIds.length) {
      const { error } = await client
        .from('paper_queue')
        .delete()
        .eq('user_id', authUser.id)
        .in('paper_id', staleIds);
      if (error) throw error;
      console.log('performSync: Deleted', staleIds.length, 'stale items');
    }

    // Fetch final remote state and write to local
    const { data, error } = await client.from('paper_queue')
      .select('*')
      .eq('user_id', authUser.id);
    if (error) throw error;

    const remoteQueue = (data || []).map(row => ({
      ...row.payload,
      status: row.status,
      saved_at: row.saved_at,
    }));
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remoteQueue));
    writeMeta({ dirty: false });
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
    console.log('performSync: Synced', remoteQueue.length, 'items');
  } catch (error) {
    console.error('Queue sync failed:', error);
  }
}

export async function initQueue() {
  console.log('initQueue: Starting...');
  await loadRuntimeConfig();

  if (!isSupabaseConfigured()) {
    console.log('initQueue: Supabase not configured');
    return;
  }

  const client = await getSupabaseClient();

  // Set up auth state listener FIRST to ensure all syncs use correct auth context
  client.auth.onAuthStateChange(async (_event, sessionState) => {
    authSession = sessionState;
    authUser = sessionState?.user || null;
    console.log('Queue auth state changed:', _event, authUser ? 'User logged in' : 'User logged out');
    if (authUser) {
      await performSync();
    }
  });

  // Then check initial session and sync if logged in
  const { data: { session } } = await client.auth.getSession();
  console.log('initQueue: Session:', session ? 'Found' : 'Not found');

  if (session) {
    authSession = session;
    authUser = session.user;
    console.log('initQueue: Calling performSync...');
    await performSync();
    console.log('initQueue: performSync completed');
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
        const paper = record.paper || record;
        const context = record.context || {};
        addToQueue(paper, context, 'later');
      }
    });
  });
}

