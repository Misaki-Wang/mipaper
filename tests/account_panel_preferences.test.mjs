import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const toolbarSource = readFileSync(new URL("../site/app_toolbar.js", import.meta.url), "utf8");
const authSource = readFileSync(new URL("../site/branch_auth.js", import.meta.url), "utf8");
const settingsHtml = readFileSync(new URL("../site/settings.html", import.meta.url), "utf8");

test("account menu exposes all configurable display preference rows", () => {
  assert.match(toolbarSource, /data-account-preferences-section/);
  assert.match(toolbarSource, /data-account-preference-option="theme"/);
  assert.match(toolbarSource, /data-account-preference-option="view"/);
  assert.match(toolbarSource, /data-account-preference-option="toolbar"/);
  assert.match(toolbarSource, /data-account-preference-option="workspace"/);
  assert.match(toolbarSource, /data-account-preference-option="details"/);
  assert.match(toolbarSource, /data-toolbar-autohide-mode-toggle="enabled"/);
  assert.match(toolbarSource, /data-toolbar-autohide-mode-toggle="disabled"/);
  assert.match(toolbarSource, /data-detail-panel-default-toggle="expanded"/);
  assert.match(toolbarSource, /data-detail-panel-default-toggle="collapsed"/);
});

test("branch auth toolbar syncs pinned account preference rows from user settings", () => {
  assert.match(authSource, /accountPanelPreferencePins/);
  assert.match(authSource, /data-account-preference-option/);
  assert.match(authSource, /data-toolbar-autohide-mode-toggle/);
  assert.match(authSource, /preferenceSection\.hidden = visibleCount === 0/);
});

test("settings page lets users choose which preferences stay pinned in the account panel", () => {
  assert.match(settingsHtml, /settings-quick-panel-summary/);
  assert.match(settingsHtml, /data-quick-panel-pin-toggle="theme"/);
  assert.match(settingsHtml, /data-quick-panel-pin-toggle="view"/);
  assert.match(settingsHtml, /data-quick-panel-pin-toggle="toolbar"/);
  assert.match(settingsHtml, /data-quick-panel-pin-toggle="workspace"/);
  assert.match(settingsHtml, /data-quick-panel-pin-toggle="details"/);
});
