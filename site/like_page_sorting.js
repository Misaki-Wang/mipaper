export const LIKE_SORT_OPTIONS = [
  { value: "saved_desc", label: "Recently liked" },
  { value: "arxiv_desc", label: "Pub Date: newest" },
  { value: "arxiv_asc", label: "Pub Date: oldest" },
];

export function normalizeLikeSortMode(value) {
  const normalized = String(value || "").trim();
  return LIKE_SORT_OPTIONS.some((item) => item.value === normalized) ? normalized : "saved_desc";
}

export function getLikeSortLabel(value) {
  return LIKE_SORT_OPTIONS.find((item) => item.value === normalizeLikeSortMode(value))?.label || "Recently liked";
}

export function extractArxivIdentifier(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (!raw.includes("://")) {
    return normalizeArxivIdentifier(raw);
  }
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (!hostname.endsWith("arxiv.org")) {
      return "";
    }
    const pathMatch = parsed.pathname.replace(/\/+$/, "").match(/^\/(?:abs|pdf)\/(.+)$/i);
    return normalizeArxivIdentifier(pathMatch?.[1] || "");
  } catch {
    return "";
  }
}

export function extractArxivSortKey(value) {
  return buildArxivSortKey(extractArxivIdentifier(value));
}

export function getPaperArxivSortKey(paper) {
  const candidates = [
    paper?.abs_url,
    paper?.pdf_url,
    paper?.arxiv_url,
    paper?.arxiv_pdf_url,
    paper?.paper_id,
  ];
  for (const candidate of candidates) {
    const key = extractArxivSortKey(candidate);
    if (key) {
      return key;
    }
  }
  return "";
}

export function sortLikes(likes, sortMode) {
  const normalizedSortMode = normalizeLikeSortMode(sortMode);
  return [...likes].sort((left, right) => {
    if (normalizedSortMode === "saved_desc") {
      return compareSavedAtDesc(left, right) || compareTitle(left, right);
    }

    const leftArxivKey = getPaperArxivSortKey(left);
    const rightArxivKey = getPaperArxivSortKey(right);
    if (leftArxivKey && rightArxivKey && leftArxivKey !== rightArxivKey) {
      return normalizedSortMode === "arxiv_asc"
        ? leftArxivKey.localeCompare(rightArxivKey)
        : rightArxivKey.localeCompare(leftArxivKey);
    }
    if (leftArxivKey !== rightArxivKey) {
      return leftArxivKey ? -1 : 1;
    }
    return compareSavedAtDesc(left, right) || compareTitle(left, right);
  });
}

function normalizeArxivIdentifier(value) {
  return String(value || "")
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "");
}

function buildArxivSortKey(identifier) {
  const normalized = normalizeArxivIdentifier(identifier);
  if (!normalized) {
    return "";
  }

  const newStyleMatch = normalized.match(/^(\d{2})(\d{2})\.(\d{4,5})$/);
  if (newStyleMatch) {
    const [, yearText, monthText, serialText] = newStyleMatch;
    return createSortableArxivKey(yearText, monthText, serialText);
  }

  const oldStyleMatch = normalized.match(/^(?:[a-z-]+(?:\.[a-z-]+)?\/)?(\d{2})(\d{2})(\d{3,})$/i);
  if (oldStyleMatch) {
    const [, yearText, monthText, serialText] = oldStyleMatch;
    return createSortableArxivKey(yearText, monthText, serialText);
  }

  return "";
}

function createSortableArxivKey(yearText, monthText, serialText) {
  const year = Number.parseInt(yearText, 10);
  const month = Number.parseInt(monthText, 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return "";
  }
  const fullYear = year >= 91 ? 1900 + year : 2000 + year;
  return `${String(fullYear).padStart(4, "0")}${String(month).padStart(2, "0")}${String(serialText).padStart(5, "0")}`;
}

function compareSavedAtDesc(left, right) {
  const leftSavedAt = String(left?.liked_at || left?.saved_at || "").trim();
  const rightSavedAt = String(right?.liked_at || right?.saved_at || "").trim();
  return rightSavedAt.localeCompare(leftSavedAt);
}

function compareTitle(left, right) {
  return String(left?.title || "").localeCompare(String(right?.title || ""), "en");
}
