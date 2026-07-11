const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const distRoot = path.join(root, "fixtures", "doc-source-map", "pug-html", "dist");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  const { runPugDoc } = await import(pathToFileURL(path.join(root, "packages", "pugdoc-runner", "src", "index.mjs")));

  fs.rmSync(distRoot, { recursive: true, force: true });
  fs.mkdirSync(distRoot, { recursive: true });

  const result = await runPugDoc({
    workspaceRoot: root,
    outputDirectory: distRoot,
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
  });

  if (result.status !== "success") {
    throw new Error(`PugDoc fixture build failed: ${JSON.stringify(result.diagnostics)}`);
  }

  console.log("PugDoc Pug -> HTML fixture artifacts generated.");
}
