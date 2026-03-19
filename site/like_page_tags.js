export const CUSTOM_TAG_PALETTE = [
  "#5c8f7b",
  "#6c7fd1",
  "#c46a6a",
  "#c08b49",
  "#7c76c7",
  "#4d8fa8",
  "#9c6cae",
  "#7b9960",
  "#cc7d55",
  "#4f9a93",
  "#b46888",
  "#8d7b5e",
];

export function getPaperCustomTags(paper) {
  if (!Array.isArray(paper?.custom_tags)) {
    return [];
  }
  const seen = new Set();
  return paper.custom_tags
    .filter((tag) => {
      if (!tag?.key || !tag?.label || seen.has(tag.key)) {
        return false;
      }
      seen.add(tag.key);
      return true;
    })
    .sort(compareCustomTagMeta);
}

export function collectCustomTagCatalog(likes) {
  const catalog = new Map();
  likes.forEach((paper) => {
    getPaperCustomTags(paper).forEach((tag) => {
      const existing = catalog.get(tag.key);
      if (!existing) {
        catalog.set(tag.key, {
          key: tag.key,
          label: tag.label,
          color: tag.color || assignTagColor(tag.key, catalog),
          order: Number.isFinite(tag.order) ? tag.order : catalog.size,
        });
        return;
      }
      catalog.set(tag.key, {
        key: tag.key,
        label: existing.label || tag.label,
        color: existing.color || tag.color || assignTagColor(tag.key, catalog),
        order: Math.min(getCustomTagOrder(existing), getCustomTagOrder(tag)),
      });
    });
  });
  return [...catalog.values()].sort(compareCustomTagMeta);
}

export function buildCustomTag(rawValue, likes) {
  const label = String(rawValue || "").replace(/\s+/g, " ").trim();
  if (!label) {
    return null;
  }
  const key = slugifyTag(label);
  const existing = collectCustomTagCatalog(likes).find((tag) => tag.key === key);
  if (existing) {
    return existing;
  }
  const catalog = collectCustomTagCatalog(likes);
  return {
    key,
    label,
    color: assignTagColor(key, new Map(catalog.map((tag) => [tag.key, tag]))),
    order: getNextCustomTagOrder(catalog),
  };
}

export function getCustomTagOrder(tag) {
  return Number.isFinite(Number(tag?.order)) ? Number(tag.order) : Number.MAX_SAFE_INTEGER;
}

export function getNextCustomTagOrder(catalog) {
  const orders = catalog
    .map((tag) => getCustomTagOrder(tag))
    .filter((value) => Number.isFinite(value) && value !== Number.MAX_SAFE_INTEGER);
  return orders.length ? Math.max(...orders) + 1 : 0;
}

export function compareCustomTagMeta(left, right) {
  const orderDiff = getCustomTagOrder(left) - getCustomTagOrder(right);
  if (orderDiff !== 0) {
    return orderDiff;
  }
  return String(left?.label || "").localeCompare(String(right?.label || ""), "en");
}

export function slugifyTag(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assignTagColor(tagKey, catalog) {
  const used = new Set([...catalog.values()].map((tag) => tag.color).filter(Boolean));
  const available = CUSTOM_TAG_PALETTE.find((color) => !used.has(color));
  if (available) {
    return available;
  }
  const hash = [...String(tagKey || "")].reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return CUSTOM_TAG_PALETTE[hash % CUSTOM_TAG_PALETTE.length];
}

export function getCustomTagStyle(color) {
  return `--custom-tag-accent:${String(color || "#5c8f7b")}`;
}
