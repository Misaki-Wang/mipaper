import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stylesSource = readFileSync(new URL("../site/styles.css", import.meta.url), "utf8");

test("shell layout is safe-area aware for mobile browsers", () => {
  assert.match(stylesSource, /--safe-top: env\(safe-area-inset-top, 0px\);/);
  assert.match(stylesSource, /--safe-right: env\(safe-area-inset-right, 0px\);/);
  assert.match(stylesSource, /--safe-bottom: env\(safe-area-inset-bottom, 0px\);/);
  assert.match(stylesSource, /--safe-left: env\(safe-area-inset-left, 0px\);/);
  assert.match(stylesSource, /--shell-width: min\(/);
  assert.match(stylesSource, /\.page-shell \{\s*\n  width: var\(--shell-width\);/m);
  assert.match(stylesSource, /\.app-toolbar \{[\s\S]*?\n  width: var\(--shell-width\);/m);
  assert.match(stylesSource, /scroll-padding-top: calc\(6\.75rem \+ var\(--safe-top\)\);/);
});

test("tablet breakpoint restores denser two-column content grids", () => {
  assert.match(stylesSource, /@media \(min-width: 761px\) and \(max-width: 1100px\) \{/);
  assert.match(
    stylesSource,
    /\.home-categories,\s*\n  \.overview-grid,\s*\n  \.conference-overview-grid,\s*\n  \.spotlight-list,\s*\n  \.conference-spotlight,\s*\n  \.conference-paper-grid,\s*\n  \.conference-subject-radar,\s*\n  \.paper-list,\s*\n  \.results-stats \{\s*\n    grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\n  \}/m
  );
  assert.match(stylesSource, /\.atlas-panels,\s*\n  \.page-cool-daily \.hero-signals \{\s*\n    grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\n  \}/m);
  assert.match(stylesSource, /\.atlas-metrics \{\s*\n    grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\n  \}/m);
});

test("phone breakpoint increases top spacing and avoids iOS input zoom", () => {
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?\.page-shell \{\s*\n    width: var\(--shell-width\);\s*\n    padding-top: calc\(0\.85rem \+ var\(--safe-top\)\);\s*\n    padding-bottom: calc\(1\.6rem \+ var\(--safe-bottom\)\);/m
  );
  assert.match(
    stylesSource,
    /\.toolbar-quick-add-input,\s*\n  \.control-input,\s*\n  \.filter-select-shell > \.control-input,\s*\n  \.control-input-date,\s*\n  input,\s*\n  select,\s*\n  textarea \{\s*\n    font-size: 16px;\s*\n  \}/m
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?\.app-toolbar \{\s*\n    position: sticky;\s*\n    top: calc\(var\(--safe-top\) \+ 0\.35rem\);\s*\n    left: auto;\s*\n    right: auto;/m
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?\.toolbar-autohide-toggle \{\s*\n    display: none;\s*\n  \}/m
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?\.filters-menu-shell \{\s*\n    order: 2;\s*\n    flex: 0 0 auto;\s*\n    margin-left: 0\.1rem;\s*\n  \}/m
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?\.filters-menu-panel \{\s*\n    position: fixed;\s*\n    top: auto;\s*\n    bottom: calc\(var\(--safe-bottom\) \+ 0\.8rem\);\s*\n    left: calc\(var\(--page-gutter\) \+ var\(--safe-left\)\);\s*\n    right: calc\(var\(--page-gutter\) \+ var\(--safe-right\)\);/m
  );
  assert.match(
    stylesSource,
    /\.toolbar-quick-add-status \{[\s\S]*?\n    left: 0;\s*\n    right: 0;\s*\n    top: calc\(100% \+ 0\.22rem\);\s*\n    transform: translateY\(-0\.22rem\);\s*\n    max-width: 100%;\s*\n    white-space: normal;/m
  );
});

test("single-column list cards keep details controls in the primary column", () => {
  assert.match(
    stylesSource,
    /@media \(max-width: 900px\) \{[\s\S]*?:root\[data-page-view-mode="list"\] \.branch-card-details \{\s*\n    grid-column: 1;\s*\n    grid-row: auto;\s*\n    justify-content: flex-start;\s*\n    justify-self: start;\s*\n    align-self: start;\s*\n  \}/m
  );
});

test("phone list cards collapse paper actions into a single icon row", () => {
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?:root\[data-page-view-mode="list"\] \.page-cool-daily \.paper-card \.paper-links,[\s\S]*?\{\s*\n    gap: 0\.3rem;\s*\n    flex-wrap: nowrap;\s*\n    align-items: center;\s*\n  \}/m
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?:root\[data-page-view-mode="list"\] \.page-cool-daily \.paper-card \.paper-link,[\s\S]*?\{\s*\n    position: relative;\s*\n    width: 2\.34rem;\s*\n    height: 2\.34rem;\s*\n    min-width: 2\.34rem;\s*\n    min-height: 2\.34rem;\s*\n    padding: 0;\s*\n    gap: 0;\s*\n    font-size: 0\.74rem;\s*\n  \}/m
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?:root\[data-page-view-mode="list"\] \.page-cool-daily \.paper-card \.paper-link-text,[\s\S]*?\{\s*\n    position: absolute;\s*\n    width: 1px;\s*\n    height: 1px;[\s\S]*?clip-path: inset\(50%\);[\s\S]*?white-space: nowrap;[\s\S]*?border: 0;\s*\n  \}/m
  );
});
