import { addToQueue, readQueue } from "./paper_queue.js?v=033bd186d1";
import { initDirectAddSync, upsertDirectAdd } from "./direct_add_store.js?v=f81e05e9bb";

const ARXIV_ID_PATTERN = /^\d{4}\.\d{4,5}(?:v\d+)?$/i;
const STATUS_RESET_MS = 3200;
const PAPER_RESOLVE_ENDPOINT = "./api/paper/resolve";

export function bindToolbarQuickAdd(prefix, options = {}) {
  const target = options.target || "later";
  const skipDirectInit = Boolean(options.skipDirectInit);
  const form = document.querySelector(`#${prefix}-quick-add-form`);
  const input = document.querySelector(`#${prefix}-quick-add-input`);
  const submitButton = document.querySelector(`#${prefix}-quick-add-submit`);
  const status = document.querySelector(`#${prefix}-quick-add-status`);

  if (!form || !input || !submitButton || !status) {
    return;
  }

  if (!skipDirectInit) {
    void initDirectAddSync().catch((error) => {
      console.warn("Failed to initialize direct add sync", error);
    });
  }

  let busy = false;
  let resetStatusTimer = 0;

  const setBusy = (nextBusy) => {
    busy = Boolean(nextBusy);
    form.dataset.busy = busy ? "true" : "false";
    input.disabled = busy;
    submitButton.disabled = busy;
    submitButton.textContent = busy ? "Adding" : "Add";
  };

  const setStatus = (message, tone = "idle", persist = false) => {
    window.clearTimeout(resetStatusTimer);
    status.textContent = formatStatusMessage(message, tone);
    status.title = message || "";
    status.dataset.state = tone;
    status.hidden = !message;
    if (!message || persist) {
      return;
    }
    resetStatusTimer = window.setTimeout(() => {
      status.textContent = "";
      status.hidden = true;
      status.dataset.state = "idle";
    }, STATUS_RESET_MS);
  };

  input.addEventListener("input", () => {
    if (status.hidden) {
      return;
    }
    setStatus("", "idle", true);
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (busy) {
      return;
    }

    void (async () => {
      const parsed = parseQuickAddInput(input.value);
      if (!parsed) {
        setStatus("Unsupported paper URL", "error");
        return;
      }

      const existingLater = readQueue(target).find((record) => matchesParsedPaper(record, parsed));

      try {
        setBusy(true);
        const resolved = await fetchResolvedPaperMetadata(parsed);
        const record = buildResolvedPaperRecord(parsed, resolved, existingLater);
        const directRecord = upsertDirectAdd(record, {
          sourceKind: "library",
          sourceLabel: "Library",
          sourcePage: window.location.pathname,
          snapshotLabel: "",
        });

        if (!directRecord) {
          throw new Error("Failed to store direct add");
        }

        addToQueue(
          directRecord,
          {
            sourceKind: "library",
            sourceLabel: "Library",
            sourcePage: window.location.pathname,
            snapshotLabel: "",
          },
          {
            preserveOrder: Boolean(existingLater),
          }
        );
        input.value = "";
        setStatus(existingLater && hasMeaningfulMetadata(existingLater) ? "Updated Later" : "Added to Later", "success");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || "Failed to add paper");
        setStatus(message, "error");
      } finally {
        setBusy(false);
      }
    })();
  });
}

export function parseQuickAddInput(rawValue) {
  const value = String(rawValue || "").trim();
  if (!value) {
    return null;
  }

  if (ARXIV_ID_PATTERN.test(value)) {
    return buildArxivPayload(value);
  }

  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = url.pathname.trim();
  let paperId = "";

  if (hostname === "papers.cool") {
    paperId = pathname.replace(/^\/arxiv\//i, "").replace(/\/+$/, "");
  } else if (hostname === "arxiv.org") {
    if (pathname.startsWith("/abs/")) {
      paperId = pathname.replace(/^\/abs\//i, "");
    } else if (pathname.startsWith("/pdf/")) {
      paperId = pathname.replace(/^\/pdf\//i, "");
    }
  }

  paperId = paperId.replace(/\.pdf$/i, "").trim();
  if (!ARXIV_ID_PATTERN.test(paperId)) {
    return null;
  }

  return buildArxivPayload(paperId);
}

function buildArxivPayload(paperId) {
  const normalizedId = String(paperId).trim().toLowerCase();
  return {
    provider: "arxiv",
    paperId: normalizedId,
    absUrl: `https://arxiv.org/abs/${normalizedId}`,
    pdfUrl: `https://arxiv.org/pdf/${normalizedId}`,
    detailUrl: `https://papers.cool/arxiv/${normalizedId}`,
  };
}

async function fetchResolvedPaperMetadata(parsed) {
  const sourceUrl = parsed.detailUrl || parsed.absUrl || parsed.pdfUrl;
  if (!sourceUrl) {
    throw new Error("Unsupported paper URL");
  }

  const response = await fetch(`${PAPER_RESOLVE_ENDPOINT}?url=${encodeURIComponent(sourceUrl)}`, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await safeJson(response);
    const message = payload?.error || `Paper metadata lookup failed (${response.status})`;
    throw new Error(message);
  }

  const payload = await response.json();
  return normalizeResolvedPaperMetadata(payload, parsed);
}

function normalizeResolvedPaperMetadata(payload, parsed) {
  const resolved = payload && typeof payload === "object" ? payload : {};
  const paperId = String(resolved.paper_id || parsed.paperId || "").trim().toLowerCase();
  const title = normalizeText(resolved.title || `arXiv ${paperId}`);
  const authors = Array.isArray(resolved.authors) ? resolved.authors.map(normalizeText).filter(Boolean) : [];
  const abstract = normalizeText(resolved.abstract || "");
  const absUrl = normalizeText(resolved.abs_url || parsed.absUrl);
  const pdfUrl = normalizeText(resolved.pdf_url || parsed.pdfUrl);
  const detailUrl = normalizeText(resolved.detail_url || parsed.detailUrl);

  return {
    title,
    paper_id: paperId,
    abs_url: absUrl,
    pdf_url: pdfUrl,
    detail_url: detailUrl,
    papers_cool_url: detailUrl,
    arxiv_url: absUrl,
    arxiv_pdf_url: pdfUrl,
    authors,
    abstract,
    source_url: normalizeText(resolved.source_url || detailUrl || absUrl),
    source_host: normalizeText(resolved.source_host || ""),
  };
}

function buildResolvedPaperRecord(parsed, resolved, existingRecord = null) {
  return {
    ...(existingRecord || {}),
    title: resolved.title || existingRecord?.title || `arXiv ${parsed.paperId}`,
    paper_id: resolved.paper_id || parsed.paperId,
    abs_url: resolved.abs_url || parsed.absUrl,
    pdf_url: resolved.pdf_url || parsed.pdfUrl,
    detail_url: resolved.detail_url || parsed.detailUrl,
    papers_cool_url: resolved.papers_cool_url || parsed.detailUrl,
    arxiv_url: resolved.arxiv_url || parsed.absUrl,
    arxiv_pdf_url: resolved.arxiv_pdf_url || parsed.pdfUrl,
    authors: mergeStringArrays(existingRecord?.authors, resolved.authors),
    abstract: resolved.abstract || existingRecord?.abstract || "",
    topic_label: existingRecord?.topic_label || "Direct Add",
    source_label: existingRecord?.source_label || "Library",
    source_url: resolved.source_url || existingRecord?.source_url || parsed.detailUrl,
    source_host: resolved.source_host || existingRecord?.source_host || "",
  };
}

function hasMeaningfulMetadata(record) {
  const title = normalizeText(record?.title || "");
  const authors = Array.isArray(record?.authors) ? record.authors.filter(Boolean) : [];
  const abstract = normalizeText(record?.abstract || "");
  if (!title || /^arXiv\s+\d/i.test(title)) {
    return false;
  }
  return authors.length > 0 && abstract.length > 20;
}

function matchesParsedPaper(record, parsed) {
  if (!record || !parsed) {
    return false;
  }

  const targets = new Set([parsed.paperId, parsed.absUrl, parsed.pdfUrl, parsed.detailUrl].map(normalizeComparableValue));

  return [
    record.paper_id,
    record.abs_url,
    record.pdf_url,
    record.detail_url,
    record.arxiv_url,
    record.arxiv_pdf_url,
    record.papers_cool_url,
  ]
    .map(normalizeComparableValue)
    .filter(Boolean)
    .some((value) => targets.has(value));
}

function mergeStringArrays(primary, secondary) {
  const merged = [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])]
    .map(normalizeText)
    .filter(Boolean);
  return [...new Set(merged)];
}

function normalizeComparableValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/\/+$/, "");
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function formatStatusMessage(message, tone) {
  const text = normalizeText(message);
  if (!text) {
    return "";
  }
  if (tone === "success" || tone === "info") {
    return text;
  }
  if (/unsupported paper url/i.test(text)) {
    return "Unsupported URL";
  }
  if (/lookup failed|failed to resolve|fetch failed/i.test(text)) {
    return "Lookup failed";
  }
  if (/\b404\b/.test(text)) {
    return "Lookup failed";
  }
  return text.length > 28 ? "Add failed" : text;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
