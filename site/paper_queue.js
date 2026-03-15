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

export function addToQueue(paper, context) {
  const queue = readQueue();
  // If paper already has like_id, it's already a processed record
  const record = paper?.like_id ? paper : createLikeRecord(paper, context);
  const likeId = record.like_id;
  const existing = queue.find(item => item.like_id === likeId);

  // paper_queue only supports 'later' status
  const safeStatus = 'later';

  if (existing) {
    existing.status = safeStatus;
    existing.saved_at = new Date().toISOString();
  } else {
    queue.push({
      ...record,
      status: safeStatus,
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
  writeMeta({ dirty: true });
  localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));

  // Immediately delete from Supabase, then sync
  if (authUser) {
    getSupabaseClient().then(client => {
      client.from('paper_queue')
        .delete()
        .eq('user_id', authUser.id)
        .eq('paper_id', likeId)
        .then(({ error }) => {
          if (error) console.error('Failed to delete from Supabase:', error);
          else writeMeta({ dirty: false });
        });
    });
  } else {
    scheduleSync();
  }
}

export function isInQueue(likeId) {
  const queue = readQueue('later');
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

    // Clean up: remove any non-'later' items from local queue
    const cleanQueue = queue.filter(item => item.status === 'later');
    if (cleanQueue.length !== queue.length) {
      console.log('performSync: Cleaned', queue.length - cleanQueue.length, 'non-later items from local');
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(cleanQueue));
    }

    console.log('performSync: Local queue has', cleanQueue.length, 'items, dirty:', meta.dirty);

    // Step 1: If local has dirty changes, push them to Supabase first
    if (meta.dirty && cleanQueue.length > 0) {
      const upsertRows = cleanQueue.map(item => ({
        user_id: authUser.id,
        paper_id: item.like_id,
        status: 'later',
        saved_at: item.saved_at,
        payload: item,
      }));

      if (upsertRows.length) {
        const { error } = await client.from('paper_queue').upsert(upsertRows, {
          onConflict: 'user_id,paper_id',
        });
        if (error) throw error;
        console.log('performSync: Pushed', upsertRows.length, 'dirty items to Supabase');
      }
    }

    // Step 2: Clean up any non-later rows from Supabase
    await client.from('paper_queue')
      .delete()
      .eq('user_id', authUser.id)
      .neq('status', 'later');

    // Step 3: Always fetch from Supabase as source of truth
    const { data, error } = await client.from('paper_queue')
      .select('*')
      .eq('user_id', authUser.id)
      .eq('status', 'later');
    if (error) throw error;

    console.log('performSync: Raw Supabase response:', data?.length, 'rows');

    const remoteQueue = (data || []).map(row => ({
      ...row.payload,
      status: 'later',
      saved_at: row.saved_at,
    }));

    console.log('performSync: Later items:', remoteQueue.length);

    // Step 3: Overwrite local with Supabase data
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remoteQueue));
    writeMeta({ dirty: false });
    window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
    console.log('performSync: Synced from Supabase -', remoteQueue.length, 'items');
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
  const { data: { session } } = await client.auth.getSession();
  console.log('initQueue: Session:', session ? 'Found' : 'Not found');

  if (session) {
    authSession = session;
    authUser = session.user;
    console.log('initQueue: Calling performSync...');
    await performSync();
    console.log('initQueue: performSync completed');
  }

  // Set up auth state listener to handle future login/logout
  client.auth.onAuthStateChange(async (_event, sessionState) => {
    const previousUser = authUser;
    authSession = sessionState;
    authUser = sessionState?.user || null;
    console.log('Queue auth state changed:', _event, authUser ? 'User logged in' : 'User logged out');

    // Only sync if user actually changed (avoid duplicate sync on INITIAL_SESSION)
    if (authUser && authUser.id !== previousUser?.id) {
      await performSync();
    }
  });
}

export function subscribeQueue(callback) {
  window.addEventListener(QUEUE_CHANGED_EVENT, callback);
  return () => window.removeEventListener(QUEUE_CHANGED_EVENT, callback);
}

export function bindQueueButtons(root, recordLookup) {
  // Bind Later buttons
  root.querySelectorAll("[data-later-id]").forEach((button) => {
    const likeId = button.dataset.laterId;
    const inLater = isInQueue(likeId);
    button.classList.toggle("is-later", inLater);
    button.setAttribute("aria-pressed", String(inLater));

    if (button.dataset.laterBound === "true") return;
    button.dataset.laterBound = "true";

    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const record = recordLookup.get(likeId);
      if (!record) return;

      if (isInQueue(likeId)) {
        removeFromQueue(likeId);
      } else {
        const paper = record.paper || record;
        const context = record.context || {};
        addToQueue(paper, context);
      }
    });
  });
}

