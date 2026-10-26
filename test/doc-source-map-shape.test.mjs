/**
 * @file
 * @lang zh-CN 映射可选字段、重复发生项与无损源码身份回归，保留所有符号和关系。
 * @lang en Regressions for optional mapping fields, repeated occurrences and lossless source identities, preserving every symbol and relation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { extractPugDoc, extractPugProject } from "../packages/pug-doc-extractor/src/index.mjs";
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

/** @lang zh-CN 使用公开解析入口创建独立内存fixture，source路径是逻辑身份而不是slug。 @lang en Creates independent memory fixtures through the public extractor; source paths are logical identities rather than slugs. */
function artifactForPaths(paths) {
  return extractPugProject(paths.map((sourcePath, index) => ({ path: sourcePath, source: `//-\n  @component Card${index}\narticle(data-component="Card${index}")\n` })), { entryPath: paths[0] });
}

for (const sourcePath of ["src/card.pug", "src/Card.pug", "src/card#v1%.pug", "src/组件.pug"]) {
  test(`retains existing binding-style source identity for ${sourcePath}`, () => {
    const map = createPugHtmlDocSourceMap({ pugArtifact: artifactForPaths([sourcePath]) });
    assert.equal(map.sources[0].id, `source:pug:${sourcePath}`);
    assert.equal(map.entries[0].sourceRefs[0].sourceId, map.sources[0].id);
    assert.equal(map.chains[0].stages[0].from, map.sources[0].id);
  });
}

for (const paths of [["src/a/b.pug", "src/a-b.pug"], ["src/Card.pug", "src/card.pug"], ["src/甲.pug", "src/乙.pug"]]) {
  test(`keeps distinct paths distinct: ${paths.join(" / ")}`, () => {
    const artifact = artifactForPaths(paths);
    const map = createPugHtmlDocSourceMap({ pugArtifact: artifact });
    assert.equal(new Set(map.sources.map(source => source.id)).size, paths.length);
    assert.deepEqual(map.sources.map(source => source.id), paths.map(sourcePath => `source:pug:${sourcePath}`));
    assert.equal(map.entries.length, artifact.symbols.length + artifact.relations.length);
  });
}

test("normalizes Windows separators without changing identity spelling", () => {
  const artifact = artifactForPaths(["src\\Cards\\Card.pug"]);
  const map = createPugHtmlDocSourceMap({ pugArtifact: artifact });
  assert.equal(map.sources[0].id, "source:pug:src/Cards/Card.pug");
  assert.equal(map.sources[0].path, "src/Cards/Card.pug");
});

test("closes symbol/relation and chain source edges without mutating extraction", () => {
  const artifact = artifactForPaths(["src/page.pug", "src/partials/card.pug"]);
  // <lang><zh-CN>关系指向第二源码，以免只验证入口符号而漏掉关系投影。</zh-CN><en>The relation points to the second source so validation covers relation projection beyond the entry symbol.</en></lang>
  artifact.relations = [{ id: "relation:include", kind: "include", source: { ...artifact.symbols[1].source, rangeSource: "parser", confidence: "high" }, diagnostics: [] }];
  const before = JSON.stringify(artifact);
  const map = createPugHtmlDocSourceMap({ pugArtifact: artifact });
  const declared = new Set(map.sources.map(source => source.id));
  for (const entry of map.entries) for (const ref of entry.sourceRefs) assert.ok(declared.has(ref.sourceId));
  assert.equal(map.entries.at(-1).sourceRefs[0].sourceId, "source:pug:src/partials/card.pug");
  assert.ok(declared.has(map.chains[0].stages[0].from));
  assert.equal(JSON.stringify(artifact), before);
});

for (const sourcePath of ["../outside.pug", "/absolute.pug", "C:/private.pug", "\\\\host\\share\\private.pug"]) {
  test(`retains unsafe-path refusal for ${sourcePath}`, () => {
    // <lang><zh-CN>在有效提取工件上只变异声明路径，明确测映射边界而不是提取器的更早拒绝。</zh-CN><en>Mutate only a valid artifact's declared path to test the map boundary rather than the extractor's earlier rejection.</en></lang>
    const artifact = artifactForPaths(["src/card.pug"]);
    artifact.sources[0].path = sourcePath;
    assert.throws(() => createPugHtmlDocSourceMap({ pugArtifact: artifact }), /Unsafe doc-source-map path/);
  });
}
