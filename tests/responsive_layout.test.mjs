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
    /@media \(max-width: 760px\) \{[\s\S]*?\.page-shell \{\s*\n    width: var\(--shell-width\);\s*\n    padding-top: calc\(8\.3rem \+ var\(--safe-top\)\);\s*\n    padding-bottom: calc\(1\.6rem \+ var\(--safe-bottom\)\);/m
  );
  assert.match(
    stylesSource,
    /\.toolbar-quick-add-input,\s*\n  \.control-input,\s*\n  \.filter-select-shell > \.control-input,\s*\n  \.control-input-date,\s*\n  input,\s*\n  select,\s*\n  textarea \{\s*\n    font-size: 16px;\s*\n  \}/m
  );
  assert.match(
    stylesSource,
    /@media \(max-width: 760px\) \{[\s\S]*?\.filters-menu-panel \{\s*\n    position: fixed;\s*\n    top: calc\(var\(--safe-top\) \+ 4\.8rem\);\s*\n    left: calc\(var\(--page-gutter\) \+ var\(--safe-left\)\);\s*\n    right: calc\(var\(--page-gutter\) \+ var\(--safe-right\)\);/m
  );
  assert.match(stylesSource, /\.toolbar-quick-add-status \{\s*\n    left: 0;\s*\n    right: 0;\s*\n    transform: translateY\(-0\.22rem\);\s*\n    max-width: 100%;\s*\n    white-space: normal;/m);
});
