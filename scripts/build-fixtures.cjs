const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const pug = require("pug");

const root = path.resolve(__dirname, "..");
const fixtureRoot = path.join(root, "fixtures", "doc-source-map", "pug-html");
const srcRoot = path.join(fixtureRoot, "src");
const distRoot = path.join(fixtureRoot, "dist");

const sourceFiles = [
  "src/pages/card.pug",
  "src/layouts/base.pug",
  "src/partials/action.pug"
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const [
    { extractPugProject },
    { pugDocToHtmlExtraction },
    { pugDocToHiaDocument },
    { createPugHtmlDocSourceMap }
  ] = await Promise.all([
    import(pathToFileURL(path.join(root, "packages", "pug-doc-extractor", "src", "index.mjs"))),
    import(pathToFileURL(path.join(root, "packages", "pug-htmdoc-bridge", "src", "index.mjs"))),
    import(pathToFileURL(path.join(root, "packages", "pug-doc-adapter", "src", "index.mjs"))),
    import(pathToFileURL(path.join(root, "packages", "pug-to-html-doc-source-map", "src", "index.mjs")))
  ]);

  await fs.mkdir(distRoot, { recursive: true });

  const entryAbsolutePath = path.join(srcRoot, "pages", "card.pug");
  const html = pug.renderFile(entryAbsolutePath, {
    pageTitle: "Pug Product Card Fixture",
    title: "Launch Pack",
    pretty: true,
    compileDebug: true
  });

  const htmlPath = "fixtures/doc-source-map/pug-html/dist/card.html";
  const pugDocPath = "fixtures/doc-source-map/pug-html/dist/card.pugdoc.json";
  const htmDocPath = "fixtures/doc-source-map/pug-html/dist/card.htmdoc.json";
  const docMapPath = "fixtures/doc-source-map/pug-html/dist/card.docmap.json";
  const hiaPath = "fixtures/doc-source-map/pug-html/dist/card.hia.json";

  const files = await Promise.all(sourceFiles.map(async (relativePath) => ({
    path: `fixtures/doc-source-map/pug-html/${relativePath}`,
    source: await fs.readFile(path.join(fixtureRoot, relativePath), "utf8")
  })));

  const pugArtifact = extractPugProject(files, {
    entryPath: "fixtures/doc-source-map/pug-html/src/pages/card.pug",
    sourcesContentPolicy: "none"
  });

  const htmlArtifact = pugDocToHtmlExtraction(pugArtifact, {
    htmlPath,
    docSourceMapPath: docMapPath
  });

  const hiaDocument = pugDocToHiaDocument(pugArtifact, {
    id: "fixture.pug.product-card",
    title: "Pug Product Card Fixture",
    docSourceMapPath: docMapPath,
    entryArtifact: htmlPath
  });

  const docSourceMap = createPugHtmlDocSourceMap({
    id: "docmap:pug-html:product-card",
    pugArtifact,
    htmlPath,
    pugDocPath,
    htmDocPath,
    hiaDocumentPath: hiaPath
  });

  await fs.writeFile(path.join(distRoot, "card.html"), ensureTrailingNewline(html), "utf8");
  await writeJson(path.join(distRoot, "card.pugdoc.json"), pugArtifact);
  await writeJson(path.join(distRoot, "card.htmdoc.json"), htmlArtifact);
  await writeJson(path.join(distRoot, "card.docmap.json"), docSourceMap);
  await writeJson(path.join(distRoot, "card.hia.json"), hiaDocument);

  console.log("PugDoc Pug -> HTML fixture artifacts generated.");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}
