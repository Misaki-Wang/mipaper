import { escapeAttribute, escapeHtml } from "./ui_utils.js?v=e2da3b3a11";

function normalizeMarkdownValue(value) {
  return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

function sanitizeHref(value) {
  const href = String(value ?? "").trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : "";
}

function sanitizeImageSrc(value) {
  const src = String(value ?? "").trim();
  return /^https?:\/\//i.test(src) ? src : "";
}

function parseMarkdownImage(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"\n]*)")?\)$/i);
  if (!match) {
    return null;
  }

  const [, alt = "", src = "", title = ""] = match;
  const safeSrc = sanitizeImageSrc(src);
  if (!safeSrc) {
    return null;
  }

  return {
    alt: String(alt),
    src: safeSrc,
    title: String(title),
  };
}

function renderImageHtml(image, { block = false } = {}) {
  if (!image?.src) {
    return "";
  }

  const alt = String(image.alt ?? "");
  const title = String(image.title ?? "");
  const titleAttribute = title ? ` title="${escapeAttribute(title)}"` : "";
  const imgHtml = `<img class="${block ? "workspace-markdown-image" : "workspace-markdown-image-inline"}" src="${escapeAttribute(
    image.src
  )}" alt="${escapeAttribute(alt)}"${titleAttribute} loading="lazy" decoding="async">`;

  if (!block) {
    return imgHtml;
  }

  const caption = title || alt;
  return caption
    ? `<figure class="workspace-markdown-figure">${imgHtml}<figcaption>${escapeHtml(caption)}</figcaption></figure>`
    : `<figure class="workspace-markdown-figure">${imgHtml}</figure>`;
}

function createTokenStore() {
  const tokens = [];
  return {
    add(html) {
      const key = `@@MDTOKEN${tokens.length}@@`;
      tokens.push({ key, html });
      return key;
    },
    restore(value) {
      return tokens.reduce((html, token) => html.replaceAll(token.key, token.html), value);
    },
  };
}

function renderInlineMarkdown(value) {
  const tokens = createTokenStore();
  let html = String(value ?? "");

  html = html.replace(/`([^`\n]+)`/g, (_, code) => tokens.add(`<code>${escapeHtml(code)}</code>`));
  html = html.replace(/!\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)(?:\s+"([^"\n]*)")?\)/gi, (_, alt, src, title) => {
    const image = parseMarkdownImage(`![${alt}](${src}${title ? ` "${title}"` : ""})`);
    return image ? tokens.add(renderImageHtml(image)) : "";
  });
  html = html.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, (_, label, href) => {
    const safeHref = sanitizeHref(href);
    if (!safeHref) {
      return label;
    }
    return tokens.add(
      `<a href="${escapeAttribute(safeHref)}" target="_blank" rel="noreferrer">${renderInlineMarkdown(label)}</a>`
    );
  });

  html = escapeHtml(html);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  html = html.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
  html = html.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s).,!?:;])/g, "$1<em>$2</em>");
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  html = html.replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (_, prefix, href) => {
    const safeHref = sanitizeHref(href);
    if (!safeHref) {
      return `${prefix}${href}`;
    }
    return `${prefix}<a href="${escapeAttribute(safeHref)}" target="_blank" rel="noreferrer">${escapeHtml(href)}</a>`;
  });

  return tokens.restore(html);
}

function isFenceLine(line) {
  return /^```/.test(line.trim());
}

function isHeadingLine(line) {
  return /^(#{1,6})\s+/.test(line.trim());
}

function isBlockquoteLine(line) {
  return /^>\s?/.test(line.trim());
}

function isUnorderedListLine(line) {
  return /^[-*+]\s+/.test(line.trim());
}

function isOrderedListLine(line) {
  return /^\d+\.\s+/.test(line.trim());
}

function isBlockStart(line) {
  return isFenceLine(line) || isHeadingLine(line) || isBlockquoteLine(line) || isUnorderedListLine(line) || isOrderedListLine(line);
}

function renderParagraph(lines) {
  if (lines.length === 1) {
    const image = parseMarkdownImage(lines[0]);
    if (image) {
      return renderImageHtml(image, { block: true });
    }
  }
  return `<p>${lines.map((line) => renderInlineMarkdown(line.trim())).join("<br>")}</p>`;
}

function collectList(lines, startIndex, ordered) {
  const markerPattern = ordered ? /^\d+\.\s+/ : /^[-*+]\s+/;
  const tagName = ordered ? "ol" : "ul";
  const items = [];
  let index = startIndex;

  while (index < lines.length) {
    const current = lines[index].trim();
    if (!current) {
      break;
    }
    if (!(ordered ? isOrderedListLine(current) : isUnorderedListLine(current))) {
      break;
    }

    const itemLines = [current.replace(markerPattern, "").trim()];
    index += 1;
    while (index < lines.length) {
      const continuation = lines[index];
      const trimmed = continuation.trim();
      if (!trimmed) {
        break;
      }
      if (isBlockStart(trimmed)) {
        break;
      }
      itemLines.push(trimmed);
      index += 1;
    }
    items.push(`<li>${renderInlineMarkdown(itemLines.join(" "))}</li>`);
  }

  return {
    html: `<${tagName}>${items.join("")}</${tagName}>`,
    nextIndex: index,
  };
}

function renderHeading(line, headingOffset = 3) {
  const match = line.trim().match(/^(#{1,6})\s+(.*)$/);
  if (!match) {
    return renderParagraph([line]);
  }
  const level = Math.min(Math.max(match[1].length + headingOffset, 1), 6);
  return `<h${level}>${renderInlineMarkdown(match[2].trim())}</h${level}>`;
}

export function renderWorkspaceMarkdown(value, options = {}) {
  const { headingOffset = 3 } = options;
  const source = normalizeMarkdownValue(value);
  if (!source) {
    return "";
  }

  const lines = source.split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    if (isFenceLine(trimmed)) {
      const fence = trimmed.slice(0, 3);
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (isHeadingLine(trimmed)) {
      blocks.push(renderHeading(trimmed, headingOffset));
      index += 1;
      continue;
    }

    if (isBlockquoteLine(trimmed)) {
      const quoteLines = [];
      while (index < lines.length && lines[index].trim() && isBlockquoteLine(lines[index])) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(`<blockquote>${renderWorkspaceMarkdown(quoteLines.join("\n"), { headingOffset })}</blockquote>`);
      continue;
    }

    if (isUnorderedListLine(trimmed)) {
      const list = collectList(lines, index, false);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    if (isOrderedListLine(trimmed)) {
      const list = collectList(lines, index, true);
      blocks.push(list.html);
      index = list.nextIndex;
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (!currentTrimmed) {
        break;
      }
      if (paragraphLines.length && isBlockStart(currentTrimmed)) {
        break;
      }
      paragraphLines.push(current);
      index += 1;
    }
    blocks.push(renderParagraph(paragraphLines));
  }

  return blocks.join("");
}

function extractExcerptSource(value) {
  const source = normalizeMarkdownValue(value);
  if (!source) {
    return "";
  }

  const firstBlock = source.split(/\n{2,}/).map((block) => block.trim()).find(Boolean) || "";
  if (!firstBlock) {
    return "";
  }

  const firstLine = firstBlock.split("\n").map((line) => line.trim()).find(Boolean) || "";
  if (!firstLine) {
    return "";
  }
  if (isFenceLine(firstLine)) {
    return firstBlock
      .split("\n")
      .slice(1)
      .map((line) => line.trim())
      .find(Boolean) || "";
  }
  if (isHeadingLine(firstLine)) {
    return firstLine.replace(/^#{1,6}\s+/, "");
  }
  if (isBlockquoteLine(firstLine)) {
    return firstLine.replace(/^>\s?/, "");
  }
  if (isUnorderedListLine(firstLine)) {
    return firstLine.replace(/^[-*+]\s+/, "");
  }
  if (isOrderedListLine(firstLine)) {
    return firstLine.replace(/^\d+\.\s+/, "");
  }
  return firstBlock.split("\n").map((line) => line.trim()).join(" ");
}

export function renderWorkspaceMarkdownExcerpt(value) {
  const excerpt = extractExcerptSource(value);
  return excerpt ? `<p>${renderInlineMarkdown(excerpt)}</p>` : "";
}

export function renderWorkspaceMarkdownPreviewContent(value, options = {}) {
  const { emptyText = "Supports Markdown. Preview appears here." } = options;
  const source = normalizeMarkdownValue(value);
  return source ? renderWorkspaceMarkdown(source) : `<p class="paper-workspace-markdown-empty">${escapeHtml(emptyText)}</p>`;
}
