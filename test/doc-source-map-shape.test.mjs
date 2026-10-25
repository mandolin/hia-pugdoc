/**
 * @file
 * @lang zh-CN 映射可选字段与重复发生项身份回归，保留所有符号和关系。
 * @lang en Regressions for optional mapping fields and repeated-occurrence identities, preserving every symbol and relation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { extractPugDoc } from "../packages/pug-doc-extractor/src/index.mjs";
import { createPugHtmlDocSourceMap } from "../packages/pug-to-html-doc-source-map/src/index.mjs";

test("omits absent optional selectors/annotations and preserves duplicate relation occurrences", () => {
  // <lang><zh-CN>重复block发生项可有相同上游关系名，但manifest中必须各有身份；不能删除其中一项。</zh-CN>
  // <en>Repeated block occurrences can share an upstream relation name but need separate manifest identities; neither occurrence may be dropped.</en></lang>
  const artifact = extractPugDoc("//-\n  @component Card\narticle(data-component=\"Card\")\n", { path: "src/card.pug" });
  const relation = { id: "relation:block:content", kind: "block", source: { ...artifact.symbols[0].source, rangeSource: "parser", confidence: "high" }, diagnostics: [] };
  artifact.relations = [relation, structuredClone(relation)];
  const manifest = createPugHtmlDocSourceMap({ pugArtifact: artifact });
  assert.equal(manifest.entries.length, artifact.symbols.length + 2);
  assert.equal(new Set(manifest.entries.map(entry => entry.id)).size, manifest.entries.length);
  for (const entry of manifest.entries) {
    if (Object.hasOwn(entry, "annotation")) assert.ok(entry.annotation && typeof entry.annotation === "object");
    for (const ref of entry.artifactRefs) if (Object.hasOwn(ref, "selector")) assert.ok(typeof ref.selector === "string" && ref.selector.length > 0);
  }
  for (const stage of manifest.chains[0].stages) for (const id of stage.linkage) assert.ok(manifest.entries.some(entry => entry.id === id));
});
