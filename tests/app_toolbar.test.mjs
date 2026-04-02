import test from "node:test";
import assert from "node:assert/strict";

import { renderAppToolbar } from "../site/app_toolbar.js";

test("app toolbar renders a unified search/add command bar when toolbar search is configured", () => {
  const markup = renderAppToolbar({
    prefix: "queue",
    showFilters: false,
    toolbarSearch: {
      inputId: "queue-search-input",
      placeholder: "Search title, authors, topic, or tags",
      ariaLabel: "Search later queue by title, authors, topic, or custom tags",
    },
  });

  assert.match(markup, /class="toolbar-command-bar"/);
  assert.match(markup, /class="toolbar-command-shell has-search"/);
  assert.match(markup, /data-command-mode="search"/);
  assert.match(markup, /data-command-mode-toggle="search"/);
  assert.match(markup, /data-command-mode-toggle="add"/);
  assert.match(markup, /id="queue-search-input"/);
  assert.match(markup, /id="queue-quick-add-input"/);
  assert.match(markup, /placeholder="Search title, authors, topic, or tags"/);
  assert.ok(markup.indexOf("data-command-mode-toggle=\"search\"") < markup.indexOf("id=\"queue-search-input\""));
  assert.ok(markup.indexOf("id=\"queue-search-input\"") < markup.indexOf("id=\"queue-quick-add-input\""));
  assert.match(markup, /data-command-surface="search"/);
  assert.match(markup, /data-command-surface="add"/);
});

test("app toolbar exposes the magazine branch navigation item", () => {
  const markup = renderAppToolbar({
    prefix: "magazine",
    showFilters: false,
  });

  assert.match(markup, /href="\.\/magazine\.html"/);
  assert.match(markup, />Magazine</);
});
