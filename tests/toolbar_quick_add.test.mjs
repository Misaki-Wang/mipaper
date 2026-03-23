import test from "node:test";
import assert from "node:assert/strict";

import { parseQuickAddInput } from "../site/toolbar_quick_add.js";

test("toolbar quick add accepts alphaxiv abs links", () => {
  assert.deepEqual(parseQuickAddInput("https://www.alphaxiv.org/abs/2412.14171"), {
    provider: "arxiv",
    paperId: "2412.14171",
    absUrl: "https://arxiv.org/abs/2412.14171",
    pdfUrl: "https://arxiv.org/pdf/2412.14171",
    detailUrl: "https://papers.cool/arxiv/2412.14171",
  });
});
