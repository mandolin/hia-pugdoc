import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractPugDoc, parsePugDocComment } from "../packages/pug-doc-extractor/src/index.mjs";
import { pugDocToHiaDocument } from "../packages/pug-doc-adapter/src/index.mjs";
import { runPugDoc } from "../packages/pugdoc-runner/src/index.mjs";
import { pugdocProducer } from "../packages/pugdoc-producer/src/index.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

  it("maps @lang and inline <lang> to HIA i18n fields", () => {
    const artifact = extractPugDoc(`//-
  @component ProductCard Product card for <lang><zh-CN>商品</zh-CN><en>products</en></lang>.
  @lang zh-CN 商品卡片。
  @slot actions <l><zh-CN>操作区域</zh-CN><en>action area</en></l>
article.card(data-component="ProductCard")
`, { path: "fixtures/basic/card.pug" });
    const document = pugDocToHiaDocument(artifact, { title: "Pug Locale" });
    const component = document.symbols.find((symbol) => symbol.kind === "html-component");
    const slot = document.symbols.find((symbol) => symbol.kind === "html-slot");

    assert.ok(document.locales.includes("zh-CN"));
    assert.equal(component.i18n.fields.description.localizedText["zh-CN"], "商品卡片。");
    assert.equal(component.i18n.fields.description.localizedText.en, "Product card for products.");
    assert.equal(slot.i18n.fields.description.localizedText["zh-CN"], "操作区域");
    assert.equal(slot.i18n.fields.description.localizedText.en, "action area");
  });

  it("runs the standalone runner and producer adapter from the same request", async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "hia-pugdoc-runner-"));
    const request = {
      workspaceRoot: repositoryRoot,
      outputDirectory,
      inputs: [
        {
          kind: "pug-entry",
          path: "fixtures/doc-source-map/pug-html/src/pages/card.pug",
          artifactBasePath: "card",
          locals: {
            pageTitle: "Pug Product Card Fixture",
            title: "Launch Pack"
          }
        }
      ],
      options: {
        emitDocSourceMap: true,
        sourcesContentPolicy: "none",
        writeResultManifest: false
      }
    };

    try {
      const result = await runPugDoc(request);
      assert.equal(result.contract, "documentation-producer-result");
      assert.equal(result.status, "success");
      assert.equal(result.artifacts.length, 5);
      assert.ok(result.artifacts.some((artifact) => artifact.kind === "doc-source-map"));
      assert.ok(await fileExists(path.join(outputDirectory, "card.html")));

      const produced = await pugdocProducer.produce(request);
      assert.equal(produced.producer.id, "pugdoc");
      assert.equal(produced.status, "success");
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });
});

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
