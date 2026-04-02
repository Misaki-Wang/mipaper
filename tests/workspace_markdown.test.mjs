import test from "node:test";
import assert from "node:assert/strict";

import {
  renderWorkspaceMarkdown,
  renderWorkspaceMarkdownExcerpt,
  renderWorkspaceMarkdownPreviewContent,
} from "../site/workspace_markdown.js";

test("workspace markdown renders common formatting safely", () => {
  const html = renderWorkspaceMarkdown(
    [
      "# Heading",
      "",
      "**Bold** text with `code` and [Docs](https://example.com).",
      "",
      "- First item",
      "- Second item",
      "",
      "> quoted line",
      "",
      "<script>alert(1)</script>",
    ].join("\n")
  );

  assert.match(html, /<h4>Heading<\/h4>/);
  assert.match(html, /<strong>Bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /href="https:\/\/example\.com"/);
  assert.match(html, /<ul><li>First item<\/li><li>Second item<\/li><\/ul>/);
  assert.match(html, /<blockquote><p>quoted line<\/p><\/blockquote>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});

test("workspace markdown excerpt stays compact for list-based notes", () => {
  const html = renderWorkspaceMarkdownExcerpt("- First follow-up item\n- Second follow-up item");
  assert.equal(html, "<p>First follow-up item</p>");
});

test("workspace markdown preview renders an empty helper state", () => {
  const html = renderWorkspaceMarkdownPreviewContent("");
  assert.match(html, /Supports Markdown\. Preview appears here\./);
  assert.match(html, /paper-workspace-markdown-empty/);
});
