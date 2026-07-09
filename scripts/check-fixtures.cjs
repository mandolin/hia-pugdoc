const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const fixtureRoot = path.join(root, "fixtures", "doc-source-map", "pug-html");
const distRoot = path.join(fixtureRoot, "dist");

const jsonFiles = [
  "card.pugdoc.json",
  "card.htmdoc.json",
  "card.docmap.json",
  "card.hia.json"
];

function main() {
  const html = fs.readFileSync(path.join(distRoot, "card.html"), "utf8");
  assert.match(html, /data-component="ProductCard"/);
  assert.match(html, /data-pug-mixin="actionButton"/);
  assert.match(html, /Launch Pack/);

  for (const file of jsonFiles) {
    assert.ok(fs.existsSync(path.join(distRoot, file)), `Missing fixture artifact: ${file}`);
  }

  const pugdoc = readJson("card.pugdoc.json");
  assert.equal(pugdoc.contract, "hia-pugdoc-extraction");
  assert.equal(pugdoc.contractVersion, "0.1.0-draft");
  assert.ok(pugdoc.symbols.some((symbol) => symbol.id === "component:ProductCard" && symbol.kind === "html-component"));
  assert.ok(pugdoc.symbols.some((symbol) => symbol.id === "mixin:actionButton" && symbol.kind === "pug-mixin"));
  assert.ok(pugdoc.relations.some((relation) => relation.kind === "extends"));
  assert.ok(pugdoc.relations.some((relation) => relation.kind === "block"));
  assert.ok(pugdoc.relations.some((relation) => relation.kind === "include"));
  assert.ok(pugdoc.relations.some((relation) => relation.kind === "mixin-call"));
  for (const source of pugdoc.sources) {
    assertSafeRelativePath(source.path);
    assert.equal(source.sourcesContentPolicy, "none");
    assert.equal(Object.hasOwn(source, "sourcesContent"), false);
  }

  const htmdoc = readJson("card.htmdoc.json");
  assert.equal(htmdoc.contract, "hia-htmdoc-extraction");
  assert.ok(htmdoc.symbols.some((symbol) => symbol.kind === "html-component" && symbol.name === "ProductCard"));
  assert.ok(htmdoc.symbols.some((symbol) => symbol.kind === "html-template" && symbol.name === "actionButton"));
  assert.equal(htmdoc.sourceMap.sourcesContentPolicy, "none");

  const docmap = readJson("card.docmap.json");
  assert.equal(docmap.contract, "doc-source-map");
  assert.equal(docmap.contractVersion, "0.1.0-draft");
  assert.equal(docmap.privacy.sourcesContentPolicy, "none");
  assert.equal(Array.isArray(docmap.sourceMaps), true);
  assert.equal(docmap.sourceMaps.length, 0);
  assert.ok(docmap.diagnostics.some((diagnostic) => diagnostic.code === "PUG_SOURCE_MAP_NOT_PRODUCED"));
  assert.ok(docmap.entries.some((entry) => entry.id === "entry:component-productcard"));
  assert.ok(docmap.entries.some((entry) => entry.relationKind === "include"));
  assert.ok(docmap.entries.some((entry) => entry.relationKind === "extends" && entry.artifactRefs[0].confidence === "none"));
  assert.ok(docmap.entries.some((entry) => entry.relationKind === "block" && entry.diagnostics.includes("PUG_HTMDOC_EXTENDS_BLOCK_LINKAGE_DEFERRED")));
  assert.ok(docmap.entries.some((entry) => entry.relationKind === "mixin-call" && entry.diagnostics.includes("PUG_HTMDOC_MIXIN_LINKAGE_PARTIAL")));
  for (const source of docmap.sources) {
    assertSafeRelativePath(source.path);
    assert.equal(source.sourcesContentPolicy, "none");
  }
  for (const artifact of docmap.artifacts) {
    assertSafeRelativePath(artifact.path);
  }

  const hia = readJson("card.hia.json");
  assert.equal(hia.schemaVersion, "0.2.0");
  assert.ok(hia.symbols.some((symbol) => symbol.id === "component:ProductCard"));
  assert.ok(hia.metadata.docSourceMaps[0].path.endsWith("card.docmap.json"));

  expectNoLocalPathLeakage(fixtureRoot);
  console.log("PugDoc fixture check passed.");
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(distRoot, name), "utf8"));
}

function assertSafeRelativePath(value) {
  assert.equal(typeof value, "string", `Expected path string, got ${typeof value}`);
  assert.equal(path.isAbsolute(value), false, `Path must not be absolute: ${value}`);
  assert.equal(value.startsWith("\\\\"), false, `Path must not be UNC: ${value}`);
  assert.equal(value.split(/[\\/]/).includes(".."), false, `Path must not escape workspace: ${value}`);
}

function expectNoLocalPathLeakage(directory) {
  const forbidden = [
    "K:\\Project",
    "Github_mandolin",
    "HIA-Documentation-Sys"
  ];
  for (const filePath of listFiles(directory)) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const marker of forbidden) {
      assert.equal(content.includes(marker), false, `Local path leakage in ${path.relative(root, filePath).replaceAll("\\", "/")}: ${marker}`);
    }
  }
}

function listFiles(directory) {
  const result = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(entryPath));
    } else {
      result.push(entryPath);
    }
  }
  return result;
}

main();
