import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractPugDoc,
  extractPugGeneratedDocumentationBinding,
  parsePugDocComment
} from "../packages/pug-doc-extractor/src/index.mjs";
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

  it("emits a neutral one-to-many binding sidecar for each, mixin, include, and extends/block", async () => {
    const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "hia-pugdoc-generated-binding-"));
    const locals = createGeneratedBindingLocals();
    const request = {
      workspaceRoot: repositoryRoot,
      outputDirectory,
      inputs: [
        {
          kind: "pug-entry",
          path: "fixtures/generated-binding-runtime/src/pages/bindings.pug",
          artifactBasePath: "bindings",
          locals: locals.values,
          generatedBindingLocals: locals
        }
      ],
      options: {
        emitDocSourceMap: true,
        emitGeneratedDocumentationBinding: true,
        sourcesContentPolicy: "none",
        writeResultManifest: false
      }
    };

    try {
      const result = await runPugDoc(request);
      assert.equal(result.status, "success");
      assert.equal(result.artifacts.length, 6);
      assert.ok(result.artifacts.some((artifact) => artifact.kind === "generated-documentation-binding"));

      const sidecar = await readJson(path.join(outputDirectory, "bindings.gdb.json"));
      const docSourceMap = await readJson(path.join(outputDirectory, "bindings.docmap.json"));
      assert.equal(sidecar.contract, "generated-documentation-binding");
      assert.equal(sidecar.contractVersion, "0.1.0-draft");
      assert.equal(sidecar.bindings.length, 4);
      assert.equal(sidecar.expansions.length, 6);
      assert.equal(sidecar.targets.length, 6);
      assert.equal(sidecar.diagnostics.length, 0);
      assert.equal(expansionCountForSymbol(sidecar, "element:ColorSwatch"), 2);
      assert.equal(expansionCountForSymbol(sidecar, "element:ColorBadge"), 2);
      assert.equal(expansionCountForSymbol(sidecar, "element:IncludedSwatch"), 1);
      assert.equal(expansionCountForSymbol(sidecar, "element:ColorSummary"), 1);
      assert.ok(sidecar.expansions.every((expansion) => expansion.instanceKey.status === "stable"));
      assert.ok(sidecar.bindings.some((binding) => binding.composition.relation === "composition"));
      assert.ok(sidecar.bindings.some((binding) => binding.composition.mergePolicy === "ordered-contribution"));
      assert.equal(Object.hasOwn(sidecar, "sourceBody"), false);
      assert.equal(JSON.stringify(sidecar).includes("\"values\""), false);
      assert.equal(docSourceMap.generatedBindingSidecars.length, 1);
      assert.equal(docSourceMap.generatedBindingSidecars[0].path, "bindings.gdb.json");
      assert.ok(docSourceMap.entries.some((entry) => entry.symbolId === "element:ColorSwatch" && entry.generatedBindingRefs?.length === 1));
    } finally {
      await fs.rm(outputDirectory, { recursive: true, force: true });
    }
  });

  it("rejects a computed binding reference without evaluating it", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hia-pugdoc-invalid-binding-"));
    const entryPath = path.join(workspaceRoot, "invalid.pug");
    await fs.writeFile(entryPath, `//-\n  @element InvalidBinding\n  @description Invalid <bind ref="theme.primary()"/>.\narticle.invalid\n`, "utf8");

    try {
      const sidecar = extractPugGeneratedDocumentationBinding({
        workspaceRoot,
        entryPath: "invalid.pug",
        sidecarPath: "invalid.gdb.json",
        locals: createGeneratedBindingLocals()
      });
      assert.ok(sidecar.diagnostics.some((diagnostic) => diagnostic.code === "GDB_REF_SYNTAX_INVALID"));
      assert.equal(sidecar.privacy.allowRuntimeExpressionExecution, false);
      assert.equal(sidecar.privacy.allowRuntimeValueSerialization, false);
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

function createGeneratedBindingLocals() {
  return {
    contract: "generated-doc-locals",
    contractVersion: "0.1.0-draft-input",
    adapterId: "pug",
    inputId: "fixture:generated-binding-runtime",
    bindingAllowlist: ["colors", "theme", "item", "summary"],
    privacyClassification: "metadata-only",
    values: {
      colors: {
        sky: { id: "sky", name: "Sky" },
        sun: { id: "sun", name: "Sun" }
      },
      theme: {
        primary: { id: "primary", name: "Primary" },
        accent: { id: "accent", name: "Accent" }
      },
      item: { id: "included", name: "Included" },
      summary: { id: "summary", name: "Summary" }
    }
  };
}

function expansionCountForSymbol(sidecar, symbolId) {
  const targets = new Map(sidecar.targets.map((target) => [target.id, target]));
  return sidecar.expansions.filter((expansion) => expansion.targetIds.some((targetId) => targets.get(targetId)?.identity?.symbolId === symbolId)).length;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
