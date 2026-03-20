import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const autoLoadSource = readFileSync(new URL("../site/show_more_autoload.js", import.meta.url), "utf8");

test("show more auto-load ignores key presses from editable controls", () => {
  assert.match(autoLoadSource, /function isEditableTarget\(target\)/);
  assert.match(autoLoadSource, /target instanceof HTMLInputElement/);
  assert.match(autoLoadSource, /target\.closest\("textarea, select, button, \[contenteditable='true'\], \[role='textbox'\]"\)/);
  assert.match(autoLoadSource, /event\.defaultPrevented \|\| event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey \|\| isEditableTarget\(event\.target\)/);
});
