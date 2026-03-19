import test from "node:test";
import assert from "node:assert/strict";

import { resolvePaperMetadata } from "../functions/api/paper/resolve.js";

test("resolvePaperMetadata falls back to og property metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      `<!doctype html>
      <html>
        <head>
          <meta property="og:title" content="[2401.00001] Example Paper | arXiv" />
          <meta property="og:description" content="Example abstract from og tags." />
          <meta name="citation_author" content="Alice" />
          <meta name="citation_author" content="Bob" />
        </head>
      </html>`,
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }
    );

  try {
    const metadata = await resolvePaperMetadata("2401.00001");
    assert.equal(metadata.title, "Example Paper");
    assert.equal(metadata.abstract, "Example abstract from og tags.");
    assert.deepEqual(metadata.authors, ["Alice", "Bob"]);
    assert.equal(metadata.paper_id, "2401.00001");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
