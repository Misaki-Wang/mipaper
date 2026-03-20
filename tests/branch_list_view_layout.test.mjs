import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("branch pages share a tighter compact list-view layout", () => {
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-cool-daily \.paper-card,/);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-cool-daily \.spotlight-card,/);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-hf \.conference-paper-card,/);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-conference \.conference-paper-card,/);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-trending \.conference-paper-card,/);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-cool-daily \.topic-lead-card \{/);
  assert.match(stylesSource, /gap: 0\.36rem;\s*\n  padding: 0\.72rem 0\.82rem;\s*\n  border-radius: 16px;/m);

  assert.match(stylesSource, /\.page-trending \.conference-paper-card \.paper-authors-box,/);
  assert.match(stylesSource, /\.page-cool-daily \.topic-lead-card \.paper-authors-box \{/);
  assert.match(stylesSource, /padding: 0;\s*\n  border: 0;\s*\n  background: transparent;\s*\n  border-radius: 0;/m);

  assert.match(stylesSource, /\.page-trending \.conference-paper-card \.paper-abstract,/);
  assert.match(stylesSource, /\.page-cool-daily \.topic-lead-card \.paper-abstract \{\s*\n  display: none;/m);

  assert.match(stylesSource, /\.page-trending \.conference-paper-card \.paper-links,/);
  assert.match(stylesSource, /\.page-cool-daily \.topic-lead-card \.paper-links \{\s*\n  gap: 0\.34rem;/m);
  assert.match(stylesSource, /:root\[data-page-view-mode="list"\] \.page-cool-daily \.spotlight-card:first-child \{/);
});
