export async function fetchJson(url, options = {}) {
  const { cache = "no-store", errorFormatter = defaultFetchErrorFormatter, validator = null } = options;
  const response = await fetch(url, { cache });
  if (!response.ok) {
    throw new Error(errorFormatter(url, response.status));
  }
  const payload = await response.json();
  if (typeof validator === "function") {
    validator(payload);
  }
  return payload;
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttribute(value, options = {}) {
  const { escapeBacktick = true } = options;
  let escaped = escapeHtml(value);
  if (escapeBacktick) {
    escaped = escaped.replaceAll("`", "&#96;");
  }
  return escaped;
}

export function getErrorMessage(error, options = {}) {
  const { fallback = "Unexpected error" } = options;
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error === null || error === undefined || error === "") {
    return fallback;
  }
  return String(error);
}

export function formatDateTime(value, options = {}) {
  const {
    locale = "zh-CN",
    emptyValue = "-",
    fallbackToOriginal = true,
    formatOptions = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    },
  } = options;

  if (!value) {
    return emptyValue;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallbackToOriginal ? String(value) : emptyValue;
  }

  return new Intl.DateTimeFormat(locale, formatOptions).format(date);
}

export function formatZhTime(value, options = {}) {
  const { emptyValue = "-", fallbackToOriginal = true, hour12 } = options;
  const formatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };
  if (typeof hour12 === "boolean") {
    formatOptions.hour12 = hour12;
  }
  return formatDateTime(value, {
    locale: "zh-CN",
    emptyValue,
    fallbackToOriginal,
    formatOptions,
  });
}

function defaultFetchErrorFormatter(url, status) {
  return `Failed to load ${url}: ${status}`;
}
