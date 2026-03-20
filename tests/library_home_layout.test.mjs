import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toolbarSource = readFileSync(new URL("../site/app_toolbar.js", import.meta.url), "utf8");
const libraryHtml = readFileSync(new URL("../site/library.html", import.meta.url), "utf8");
const libraryHomeSource = readFileSync(new URL("../site/library_home.js", import.meta.url), "utf8");

test("library nav includes a home entry", () => {
  assert.match(toolbarSource, /key:\s*"home",\s*href:\s*"\.\/library\.html",\s*label:\s*"Home"/);
});

test("library home centralizes the library dashboards", () => {
  assert.match(libraryHtml, /template id="library-home-toolbar-filters"/);
  assert.match(libraryHtml, /id="library-home-link-cards"/);
  assert.match(libraryHtml, /id="library-home-facts"/);
  assert.match(libraryHtml, /id="library-home-overview"/);
  assert.match(libraryHtml, /id="library-home-groups"/);
  assert.match(libraryHtml, /id="library-home-topics"/);
});

test("library home links directly into liked, later, and unread pages", () => {
  assert.match(libraryHtml, /Library Overview/);
  assert.match(libraryHtml, /Library Pulse/);
  assert.match(libraryHomeSource, /href:\s*"\.\/like\.html"/);
  assert.match(libraryHomeSource, /href:\s*"\.\/queue\.html"/);
  assert.match(libraryHomeSource, /href:\s*"\.\/unread-snapshots\.html"/);
});
