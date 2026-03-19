const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

const PAPER_ID_PATTERN = /^\d{4}\.\d{4,5}(?:v\d+)?$/i;
const HTML_FETCH_HEADERS = {
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const rawInput = requestUrl.searchParams.get("url") || requestUrl.searchParams.get("paper_id") || "";

  if (!String(rawInput || "").trim()) {
    return Response.json({ error: "Missing url" }, { status: 400, headers: JSON_HEADERS });
  }

  try {
    const metadata = await resolvePaperMetadata(rawInput);
    return Response.json(metadata, { headers: JSON_HEADERS });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : String(error || "Failed to resolve paper metadata"),
      },
      { status: 400, headers: JSON_HEADERS }
    );
  }
}

export async function resolvePaperMetadata(rawInput) {
  const parsed = normalizePaperInput(rawInput);
  if (!parsed) {
    throw new Error("Unsupported paper URL");
  }

  const sourceUrls = [parsed.detailUrl, parsed.absUrl, parsed.pdfUrl].filter(Boolean);
  let lastError = null;

  for (const sourceUrl of sourceUrls) {
    try {
      const htmlText = await fetchHtml(sourceUrl);
      const metadata = parsePaperMetadata(htmlText, parsed, sourceUrl);
      if (metadata.title && metadata.abstract) {
        return metadata;
      }
      if (metadata.title || metadata.abstract) {
        return metadata;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to resolve paper metadata");
}

function normalizePaperInput(rawInput) {
  const value = String(rawInput || "").trim();
  if (!value) {
    return null;
  }

  if (PAPER_ID_PATTERN.test(value)) {
    return buildParsedPaper(value);
  }

  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathname = url.pathname.replace(/\/+$/, "");
  let paperId = "";

  if (hostname === "papers.cool") {
    paperId = pathname.replace(/^\/arxiv\//i, "");
  } else if (hostname === "arxiv.org") {
    if (pathname.startsWith("/abs/")) {
      paperId = pathname.replace(/^\/abs\//i, "");
    } else if (pathname.startsWith("/pdf/")) {
      paperId = pathname.replace(/^\/pdf\//i, "");
    }
  }

  paperId = paperId.replace(/\.pdf$/i, "").trim();
  if (!PAPER_ID_PATTERN.test(paperId)) {
    return null;
  }

  return buildParsedPaper(paperId);
}

function buildParsedPaper(paperId) {
  const normalizedId = String(paperId).trim().toLowerCase();
  return {
    paperId: normalizedId,
    absUrl: `https://arxiv.org/abs/${normalizedId}`,
    pdfUrl: `https://arxiv.org/pdf/${normalizedId}`,
    detailUrl: `https://papers.cool/arxiv/${normalizedId}`,
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: HTML_FETCH_HEADERS,
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url} (${response.status})`);
  }
  return response.text();
}

function parsePaperMetadata(htmlText, parsed, sourceUrl) {
  const citationTitle = firstMetaContent(htmlText, "citation_title");
  const citationAbstract = firstMetaContent(htmlText, "citation_abstract");
  const citationPdfUrl = firstMetaContent(htmlText, "citation_pdf_url");
  const citationPublicUrl = firstMetaContent(htmlText, "citation_public_url");
  const citationArxivId = firstMetaContent(htmlText, "citation_arxiv_id");
  const ogTitle = firstMetaContent(htmlText, "og:title");
  const ogDescription = firstMetaContent(htmlText, "og:description");
  const metaDescription = firstMetaContent(htmlText, "description");

  const title = normalizePaperTitle(
    citationTitle || ogTitle || extractDocumentTitle(htmlText),
    citationArxivId || parsed.paperId
  );
  const authors = extractAuthors(htmlText);
  const abstract = normalizeText(citationAbstract || ogDescription || metaDescription);
  const paperId = normalizeText(citationArxivId || parsed.paperId).toLowerCase();
  const absUrl = parsed.absUrl;
  const pdfUrl = normalizeText(citationPdfUrl || parsed.pdfUrl);
  const detailUrl = normalizeText(citationPublicUrl || parsed.detailUrl);

  return {
    provider: "arxiv",
    paper_id: paperId,
    title,
    authors,
    abstract,
    abs_url: absUrl,
    pdf_url: pdfUrl,
    detail_url: detailUrl,
    source_url: sourceUrl,
    source_host: new URL(sourceUrl).hostname.replace(/^www\./, ""),
  };
}

function extractAuthors(htmlText) {
  const repeatedAuthors = extractMetaContents(htmlText, "citation_author").map(normalizeText).filter(Boolean);
  if (repeatedAuthors.length) {
    return repeatedAuthors;
  }

  const combinedAuthors = firstMetaContent(htmlText, "citation_authors");
  if (!combinedAuthors) {
    return [];
  }

  return combinedAuthors
    .split(/\s*;\s*/)
    .map(normalizeText)
    .filter(Boolean);
}

function extractDocumentTitle(htmlText) {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(htmlText);
  if (!match) {
    return "";
  }
  return decodeHtmlEntities(normalizeText(match[1]));
}

function normalizePaperTitle(title, paperId) {
  let value = normalizeText(title);
  if (!value) {
    return "";
  }

  value = value.replace(new RegExp(`^\\[?${escapeRegExp(paperId)}\\]?\\s*[:|-]\\s*`, "i"), "");
  value = value.replace(/\s+\|\s+Cool Papers.*$/i, "");
  value = value.replace(/\s+\|\s+arXiv.*$/i, "");
  value = value.replace(/^\[?\d{4}\.\d{4,5}(?:v\d+)?\]?\s*/i, "");
  return normalizeText(value);
}

function firstMetaContent(htmlText, name) {
  const contents = extractMetaContents(htmlText, name);
  return contents.length ? contents[0] : "";
}

function extractMetaContents(htmlText, name) {
  const results = [];
  const tagPattern = /<meta\b[^>]*>/gi;
  let match;

  while ((match = tagPattern.exec(htmlText))) {
    const tag = match[0];
    const metaName = getMetaAttribute(tag, "name") || getMetaAttribute(tag, "property");
    if (!metaName || metaName.toLowerCase() !== name.toLowerCase()) {
      continue;
    }
    const content = getMetaAttribute(tag, "content");
    if (content) {
      results.push(decodeHtmlEntities(content));
    }
  }

  return results;
}

function getMetaAttribute(tag, attributeName) {
  const pattern = new RegExp(`${attributeName}\\s*=\\s*(['"])(.*?)\\1`, "i");
  const match = pattern.exec(tag);
  return match ? match[2] : "";
}

function normalizeText(value) {
  return decodeHtmlEntities(String(value || "").replace(/\s+/g, " ").trim());
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 16)));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
