import { createLikeRecord, readLikes } from "./likes.js?v=010cf1b2c9";
import { readQueue } from "./paper_queue.js?v=033bd186d1";
import { createSyncTimestamp, getSyncDeviceId, mergeSyncRecords } from "./sync_utils.js?v=8b7af265fa";

const LIKES_STORAGE_KEY = "cool-paper-liked-papers-v1";
const LIKES_META_KEY = "cool-paper-liked-papers-meta-v1";
const LIKES_CHANGED_EVENT = "cool-paper-likes-changed";
const QUEUE_STORAGE_KEY = "cool-paper-queue-v1";
const QUEUE_META_KEY = "cool-paper-queue-meta-v1";
const QUEUE_CHANGED_EVENT = "cool-paper-queue-changed";
const MANUAL_CASES_KEY = "cool-paper-manual-library-cases-v1";
const PRESERVED_SEED_FIELDS = [
  "saved_at",
  "updated_at",
  "client_updated_at",
  "device_id",
  "workflow_status",
  "priority_level",
  "one_line_takeaway",
  "next_action",
  "custom_tags",
];

const LIKE_SEEDS = [
  {
    paper: {
      title: "Cambrian-1: A Fully Open, Vision-Centric Exploration of Multimodal LLMs",
      paper_id: "cambrian-1",
      topic_key: "multimodal_generative",
      topic_label: "多模态理解与视觉",
      authors: ["Shengbang Tong", "Ellis Brown", "Penghao Wu"],
      abstract:
        "Cambrian-1 studies how far an openly released multimodal stack can go when the system is designed around strong vision grounding instead of text-first adaptation alone. " +
        "The paper compares data mixture, encoder choices, and training stages across a broad evaluation sweep so the resulting model can be used as a realistic baseline for later multimodal workflow experiments.",
      arxiv_url: "https://arxiv.org/abs/2406.16860",
      arxiv_pdf_url: "https://arxiv.org/pdf/2406.16860",
      detail_url: "https://papers.cool/arxiv/2406.16860",
      subjects: ["cs.CV", "cs.AI"],
      workflow_status: "reading",
      priority_level: "high",
      one_line_takeaway: "Useful baseline for testing visual paper workflows and note editing.",
      next_action: "Compare its vision encoder choices against the current shortlist.",
      custom_tags: [
        { key: "vision-stack", label: "Vision Stack", color: "#5c8f7b", order: 0 },
        { key: "baseline", label: "Baseline", color: "#7a87c2", order: 1 },
      ],
    },
    context: {
      sourceKind: "daily",
      sourceLabel: "Cool Daily",
      sourcePage: "./cool-daily.html",
      snapshotLabel: "2026-03-19 · cs.AI",
      reportDate: "2026-03-19",
      category: "cs.AI",
    },
  },
  {
    paper: {
      title: "VisualScratchpad: Investigating and Improving Multimodal Model Understanding with Visual Concepts",
      paper_id: "visualscratchpad",
      topic_key: "reasoning_alignment",
      topic_label: "推理、对齐与评估",
      authors: ["Hyesu Lim", "Jinsol Kim"],
      abstract:
        "VisualScratchpad uses sparse autoencoders to surface reusable visual concepts inside a multimodal model and then connects those concepts to concrete prediction failures. " +
        "Instead of treating the model as a black box, the paper frames interpretability as an interactive debugging workflow where internal features, example patches, and downstream mistakes can be inspected side by side.",
      abs_url: "https://arxiv.org/abs/2603.10001",
      pdf_url: "https://arxiv.org/pdf/2603.10001",
      detail_url: "https://papers.cool/arxiv/2603.10001",
      workflow_status: "digesting",
      priority_level: "medium",
      one_line_takeaway: "Good case for testing interpretability tags, notes, and status changes.",
      next_action: "Pull out one screenshot-worthy failure mode for the weekly review.",
      custom_tags: [
        { key: "interpretability", label: "Interpretability", color: "#a66c96", order: 0 },
      ],
    },
    context: {
      sourceKind: "hf_daily",
      sourceLabel: "HF Daily",
      sourcePage: "./hf-daily.html",
      snapshotLabel: "2026-03-10",
      reportDate: "2026-03-10",
    },
  },
  {
    paper: {
      title: "UTGen and UTDebug: Scalable Unit Test Generation for Code Debugging",
      paper_id: "utgen-utdebug",
      topic_key: "agents_planning",
      topic_label: "代理与规划",
      authors: ["Anonymous"],
      abstract:
        "UTGen and UTDebug propose a scalable test-generation loop for code debugging, with extra emphasis on predicting useful expected outputs instead of generating brittle assertions. " +
        "The paper positions unit tests as an intermediate artifact for agentic debugging, so the system can iteratively localize faults, validate hypotheses, and narrow the repair space.",
      abs_url: "https://arxiv.org/abs/2501.12345",
      pdf_url: "https://arxiv.org/pdf/2501.12345",
      detail_url: "https://papers.cool/arxiv/2501.12345",
      workflow_status: "synthesized",
      priority_level: "low",
      one_line_takeaway: "Helpful synthetic paper for testing completed-note layouts.",
      next_action: "Decide whether this belongs in the coding-agent evaluation bucket.",
      custom_tags: [
        { key: "coding", label: "Coding", color: "#6b8fb8", order: 0 },
      ],
    },
    context: {
      sourceKind: "conference",
      sourceLabel: "Conference",
      sourcePage: "./conference.html",
      snapshotLabel: "COLM.2025",
      venue: "COLM.2025",
      venueSeries: "COLM",
      venueYear: "2025",
    },
  },
  {
    paper: {
      title: "One-Eval: An Agentic Evaluation System for Natural-Language Benchmark Requests",
      paper_id: "one-eval",
      topic_key: "llms_language",
      topic_label: "LLMs与语言",
      authors: ["OpenDCAI"],
      abstract:
        "One-Eval turns natural-language benchmark requests into executable evaluation workflows, covering task parsing, dataset routing, judge selection, and report generation. " +
        "The value of the system is less about a single benchmark number and more about whether evaluation intent can be translated into a repeatable pipeline without manually wiring each run.",
      abs_url: "https://arxiv.org/abs/2603.11011",
      pdf_url: "https://arxiv.org/pdf/2603.11011",
      detail_url: "https://papers.cool/arxiv/2603.11011",
      workflow_status: "inbox",
      priority_level: "medium",
      one_line_takeaway: "",
      next_action: "",
      custom_tags: [],
    },
    context: {
      sourceKind: "daily",
      sourceLabel: "Cool Daily",
      sourcePage: "./cool-daily.html",
      snapshotLabel: "2026-03-11 · cs.CL",
      reportDate: "2026-03-11",
      category: "cs.CL",
    },
  },
];

const LATER_SEEDS = [
  {
    paper: {
      title: "Design Conductor: Autonomous End-to-End CPU Design",
      paper_id: "design-conductor",
      topic_key: "agents_planning",
      topic_label: "代理与规划",
      authors: ["Anonymous"],
      abstract: "Autonomous agent pipeline for verified chip design from requirements to GDSII.",
      abs_url: "https://arxiv.org/abs/2603.12021",
      pdf_url: "https://arxiv.org/pdf/2603.12021",
      detail_url: "https://papers.cool/arxiv/2603.12021",
      workflow_status: "inbox",
      priority_level: "high",
    },
    context: {
      sourceKind: "daily",
      sourceLabel: "Cool Daily",
      sourcePage: "./cool-daily.html",
      snapshotLabel: "2026-03-11 · cs.AI",
      reportDate: "2026-03-11",
      category: "cs.AI",
    },
  },
  {
    paper: {
      title: "CktEvo: Repo-Level RTL Evolution for PPA Optimization",
      paper_id: "cktevo",
      topic_key: "agents_planning",
      topic_label: "代理与规划",
      authors: ["Anonymous"],
      abstract: "Repository-scale RTL optimization benchmark with cross-file dependencies and tool feedback.",
      abs_url: "https://arxiv.org/abs/2603.12022",
      pdf_url: "https://arxiv.org/pdf/2603.12022",
      detail_url: "https://papers.cool/arxiv/2603.12022",
      workflow_status: "inbox",
      priority_level: "medium",
    },
    context: {
      sourceKind: "daily",
      sourceLabel: "Cool Daily",
      sourcePage: "./cool-daily.html",
      snapshotLabel: "2026-03-11 · cs.AI",
      reportDate: "2026-03-11",
      category: "cs.AI",
    },
  },
  {
    paper: {
      title: "ProtoDCS: Prototype-based Double-Check Separation for Open-Set Test-Time Adaptation",
      paper_id: "protodcs",
      topic_key: "multimodal_generative",
      topic_label: "多模态理解与视觉",
      authors: ["O. Yang"],
      abstract: "Open-set TTA method for safer adaptation with explicit csID/csOOD separation.",
      abs_url: "https://arxiv.org/abs/2603.12023",
      pdf_url: "https://arxiv.org/pdf/2603.12023",
      detail_url: "https://papers.cool/arxiv/2603.12023",
      workflow_status: "inbox",
      priority_level: "low",
    },
    context: {
      sourceKind: "daily",
      sourceLabel: "Cool Daily",
      sourcePage: "./cool-daily.html",
      snapshotLabel: "2026-03-02 · cs.CV",
      reportDate: "2026-03-02",
      category: "cs.CV",
    },
  },
  {
    paper: {
      title: "SLUNG: Selective Loss to Understand but Not Generate",
      paper_id: "slung",
      topic_key: "reasoning_alignment",
      topic_label: "推理、对齐与评估",
      authors: ["Anonymous"],
      abstract: "Pre-training objective that keeps risky content in-context while suppressing generation incentives.",
      abs_url: "https://arxiv.org/abs/2502.22222",
      pdf_url: "https://arxiv.org/pdf/2502.22222",
      detail_url: "https://papers.cool/arxiv/2502.22222",
      workflow_status: "inbox",
      priority_level: "medium",
    },
    context: {
      sourceKind: "conference",
      sourceLabel: "Conference",
      sourcePage: "./conference.html",
      snapshotLabel: "COLM.2025",
      venue: "COLM.2025",
      venueSeries: "COLM",
      venueYear: "2025",
    },
  },
];

function readJson(key, fallback) {
  try {
    const payload = JSON.parse(localStorage.getItem(key) || "null");
    return payload === null ? fallback : payload;
  } catch (_error) {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readStore(key) {
  const payload = readJson(key, []);
  return Array.isArray(payload) ? payload.filter((item) => item && typeof item === "object") : [];
}

function writeStore(key, metaKey, eventName, records, idKey) {
  const merged = mergeSyncRecords([], records, idKey);
  writeJson(key, merged);
  const meta = readJson(metaKey, {});
  writeJson(metaKey, {
    ...meta,
    dirty: false,
    last_synced_at: typeof meta.last_synced_at === "string" && meta.last_synced_at ? meta.last_synced_at : createSyncTimestamp(),
  });
  window.dispatchEvent(
    new CustomEvent(eventName, {
      detail: {
        count: merged.filter((item) => !item.deleted_at).length,
      },
    })
  );
}

function buildSeedRecord(entry, seedIndex, status) {
  const timestamp = new Date(Date.UTC(2026, 2, 20, 9, seedIndex * 7, 0)).toISOString();
  return {
    ...createLikeRecord(entry.paper, entry.context),
    status,
    saved_at: timestamp,
    updated_at: timestamp,
    client_updated_at: timestamp,
    deleted_at: "",
    device_id: getSyncDeviceId(),
  };
}

function upsertRecords(existingRecords, seedRecords, idKey) {
  const ids = new Set(seedRecords.map((item) => item[idKey]));
  return [...seedRecords, ...existingRecords.filter((item) => !ids.has(item[idKey]))];
}

function appendMissingRecords(existingRecords, seedRecords, idKey) {
  const ids = new Set(existingRecords.map((item) => item[idKey]));
  return [...existingRecords, ...seedRecords.filter((item) => !ids.has(item[idKey]))];
}

function mergeSeedRecords(existingRecords, seedRecords, idKey) {
  const existingById = new Map(existingRecords.map((item) => [item[idKey], item]));
  const mergedSeeds = seedRecords.map((seedRecord) => mergeSeedRecord(existingById.get(seedRecord[idKey]), seedRecord));
  const ids = new Set(seedRecords.map((item) => item[idKey]));
  return [...mergedSeeds, ...existingRecords.filter((item) => !ids.has(item[idKey]))];
}

function mergeSeedRecord(existingRecord, seedRecord) {
  if (!existingRecord) {
    return seedRecord;
  }

  const preservedValues = Object.fromEntries(
    PRESERVED_SEED_FIELDS.map((field) => [field, existingRecord[field]])
  );

  return {
    ...seedRecord,
    ...preservedValues,
    like_id: seedRecord.like_id,
  };
}

function readManualCaseMarker() {
  const payload = readJson(MANUAL_CASES_KEY, {});
  return {
    likes: Array.isArray(payload.likes) ? payload.likes.filter(Boolean) : [],
    later: Array.isArray(payload.later) ? payload.later.filter(Boolean) : [],
  };
}

function writeManualCaseMarker(nextValue) {
  writeJson(MANUAL_CASES_KEY, nextValue);
}

export function seedManualLibraryCases() {
  const likeRecords = LIKE_SEEDS.map((entry, index) => buildSeedRecord(entry, index, "liked"));
  const laterRecords = LATER_SEEDS.map((entry, index) => buildSeedRecord(entry, LIKE_SEEDS.length + index, "later"));

  writeStore(
    LIKES_STORAGE_KEY,
    LIKES_META_KEY,
    LIKES_CHANGED_EVENT,
    mergeSeedRecords(readStore(LIKES_STORAGE_KEY), likeRecords, "like_id"),
    "like_id"
  );
  writeStore(
    QUEUE_STORAGE_KEY,
    QUEUE_META_KEY,
    QUEUE_CHANGED_EVENT,
    mergeSeedRecords(readStore(QUEUE_STORAGE_KEY), laterRecords, "like_id"),
    "like_id"
  );

  writeManualCaseMarker({
    likes: likeRecords.map((item) => item.like_id),
    later: laterRecords.map((item) => item.like_id),
  });

  return getManualLibraryCaseSummary();
}

export function ensureManualLibraryCases() {
  const likeRecords = LIKE_SEEDS.map((entry, index) => buildSeedRecord(entry, index, "liked"));
  const laterRecords = LATER_SEEDS.map((entry, index) => buildSeedRecord(entry, LIKE_SEEDS.length + index, "later"));

  writeStore(
    LIKES_STORAGE_KEY,
    LIKES_META_KEY,
    LIKES_CHANGED_EVENT,
    mergeSeedRecords(appendMissingRecords(readStore(LIKES_STORAGE_KEY), likeRecords, "like_id"), likeRecords, "like_id"),
    "like_id"
  );
  writeStore(
    QUEUE_STORAGE_KEY,
    QUEUE_META_KEY,
    QUEUE_CHANGED_EVENT,
    mergeSeedRecords(appendMissingRecords(readStore(QUEUE_STORAGE_KEY), laterRecords, "like_id"), laterRecords, "like_id"),
    "like_id"
  );

  writeManualCaseMarker({
    likes: likeRecords.map((item) => item.like_id),
    later: laterRecords.map((item) => item.like_id),
  });

  return getManualLibraryCaseSummary();
}

export function clearManualLibraryCases() {
  const marker = readManualCaseMarker();
  const fallbackLikeIds = LIKE_SEEDS.map((entry) => createLikeRecord(entry.paper, entry.context).like_id);
  const fallbackLaterIds = LATER_SEEDS.map((entry) => createLikeRecord(entry.paper, entry.context).like_id);
  const likeIds = new Set([...marker.likes, ...fallbackLikeIds]);
  const laterIds = new Set([...marker.later, ...fallbackLaterIds]);

  writeStore(
    LIKES_STORAGE_KEY,
    LIKES_META_KEY,
    LIKES_CHANGED_EVENT,
    readStore(LIKES_STORAGE_KEY).filter((item) => !likeIds.has(item.like_id)),
    "like_id"
  );
  writeStore(
    QUEUE_STORAGE_KEY,
    QUEUE_META_KEY,
    QUEUE_CHANGED_EVENT,
    readStore(QUEUE_STORAGE_KEY).filter((item) => !laterIds.has(item.like_id)),
    "like_id"
  );

  writeManualCaseMarker({ likes: [], later: [] });
  return getManualLibraryCaseSummary();
}

export function getManualLibraryCaseSummary() {
  const marker = readManualCaseMarker();
  const likes = readLikes();
  const laterQueue = readQueue("later");
  const likeIds = new Set(marker.likes);
  const laterIds = new Set(marker.later);

  return {
    seeded_like_cases: likes.filter((item) => likeIds.has(item.like_id)).length,
    seeded_later_cases: laterQueue.filter((item) => laterIds.has(item.like_id)).length,
    total_likes: likes.length,
    total_later: laterQueue.length,
  };
}

export function installManualLibraryTestCases() {
  if (typeof window === "undefined") {
    return;
  }

  window.coolPaperDebug = window.coolPaperDebug || {};
  window.coolPaperDebug.seedLibraryCases = seedManualLibraryCases;
  window.coolPaperDebug.ensureLibraryCases = ensureManualLibraryCases;
  window.coolPaperDebug.clearLibraryCases = clearManualLibraryCases;
  window.coolPaperDebug.libraryCaseSummary = getManualLibraryCaseSummary;

  const params = new URLSearchParams(window.location.search);
  const hostname = String(window.location.hostname || "").toLowerCase();
  const isLocalTestingEnvironment =
    window.location.protocol === "file:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0";

  if (isLocalTestingEnvironment && params.get("clearTestCases") !== "1" && params.get("seedTestCases") !== "0") {
    const summary = ensureManualLibraryCases();
    console.info("Ensured local manual library cases.", summary);
  }
  if (params.get("seedTestCases") === "1") {
    const summary = seedManualLibraryCases();
    console.info("Seeded manual library cases.", summary);
  }
  if (params.get("clearTestCases") === "1") {
    const summary = clearManualLibraryCases();
    console.info("Cleared manual library cases.", summary);
  }
}
