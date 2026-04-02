import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const magazineHtml = readFileSync(new URL("../site/magazine.html", import.meta.url), "utf8");
const magazineSource = readFileSync(new URL("../site/magazine.js", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("magazine page wires the issue selector and archive shell", () => {
  assert.match(magazineHtml, /<body class="page-magazine">/);
  assert.match(magazineHtml, /id="magazine-report-select"/);
  assert.match(magazineHtml, /id="magazine-home-cards"/);
  assert.match(magazineHtml, /id="magazine-section-list"/);
  assert.match(magazineHtml, /workspace-markdown-render/);
  assert.match(magazineHtml, /src="\.\/magazine\.js(?:\?v=[^"]+)?"\/?/);
});

test("magazine page validates manifests and renders markdown sections", () => {
  assert.match(magazineSource, /validateMagazineManifest/);
  assert.match(magazineSource, /validateMagazineReport/);
  assert.match(magazineSource, /\.\/data\/magazine\/manifest\.json/);
  assert.match(magazineSource, /renderWorkspaceMarkdown/);
  assert.match(magazineSource, /magazine-floating-toc/);
});

test("magazine page keeps desktop content in a single column", () => {
  assert.match(stylesSource, /\.page-magazine \.layout \{\s*grid-template-columns:\s*1fr;/);
});
