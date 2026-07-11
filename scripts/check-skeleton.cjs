const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

const requiredPaths = [
  "README.md",
  "CHANGELOG.md",
  "RELEASE_CHECKLIST.md",
  "THIRD_PARTY_NOTICES.md",
  "LICENSE",
  ".npmignore",
  "package.json",
  "package-lock.json",
  "pnpm-workspace.yaml",
  "examples/basic/README.md",
  "examples/standalone/README.md",
  "examples/standalone/pugdoc.config.json",
  "examples/standalone/src/pages/card.pug",
  "examples/standalone/src/layouts/base.pug",
  "examples/standalone/src/partials/action.pug",
  "fixtures/README.md",
  "test/README.md",
  "scripts/build-fixtures.cjs",
  "scripts/check-fixtures.cjs",
  "scripts/check-pack.cjs",
  "scripts/check-standalone.cjs",
  "packages/pugdoc-spec/package.json",
  "packages/pugdoc-spec/src/index.mjs",
  "packages/pug-doc-extractor/package.json",
  "packages/pug-doc-extractor/src/index.mjs",
  "packages/pug-doc-adapter/package.json",
  "packages/pug-doc-adapter/src/index.mjs",
  "packages/pug-to-html-doc-source-map/package.json",
  "packages/pug-to-html-doc-source-map/src/index.mjs",
  "packages/pug-htmdoc-bridge/package.json",
  "packages/pug-htmdoc-bridge/src/index.mjs",
  "packages/pugdoc-runner/package.json",
  "packages/pugdoc-runner/src/schema.mjs",
  "packages/pugdoc-runner/src/index.mjs",
  "packages/pugdoc-runner/src/cli.mjs",
  "packages/pugdoc-producer/package.json",
  "packages/pugdoc-producer/src/index.mjs",
  "fixtures/doc-source-map/pug-html/src/pages/card.pug",
  "fixtures/doc-source-map/pug-html/src/layouts/base.pug",
  "fixtures/doc-source-map/pug-html/src/partials/action.pug",
  "test/pugdoc-fixture.test.mjs"
];

let failed = false;

for (const relativePath of requiredPaths) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing required skeleton path: ${relativePath}`);
    failed = true;
  }
}

const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (rootPackage.private !== true) {
  console.error("Root package must stay private until PugDoc package names are finalized.");
  failed = true;
}

if (failed) {
  process.exit(1);
}

console.log("PugDoc skeleton check passed.");
