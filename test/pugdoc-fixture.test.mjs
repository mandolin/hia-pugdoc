import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractPugDoc, parsePugDocComment } from "../packages/pug-doc-extractor/src/index.mjs";

describe("PugDoc extractor", () => {
  it("parses HTMDoc-level and Pug-level annotations", () => {
    const block = parsePugDocComment(`
      @component ProductCard Product card.
      @attr title Card title.
      @mixin actionButton Button mixin.
    `);

    assert.equal(block.annotations.length, 3);
    assert.equal(block.annotations[0].tag, "component");
    assert.equal(block.annotations[2].tag, "mixin");
  });

  it("extracts a component symbol from an attached Pug comment", () => {
    const artifact = extractPugDoc(`//-
  @component ProductCard Product card.
article.card(data-component="ProductCard")
`, { path: "fixtures/basic/card.pug" });

    assert.equal(artifact.contract, "hia-pugdoc-extraction");
    assert.ok(artifact.symbols.some((symbol) => symbol.id === "component:ProductCard"));
    assert.equal(artifact.sources[0].sourcesContentPolicy, "none");
  });
});
