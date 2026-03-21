import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const directAddSource = readFileSync(new URL("../site/direct_add.js", import.meta.url), "utf8");

test("direct add search includes custom tag labels in the search haystack", () => {
  assert.match(directAddSource, /\.\.\.getPaperCustomTags\(paper\)\.map\(\(tag\) => tag\.label\)/);
});
