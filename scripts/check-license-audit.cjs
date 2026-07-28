const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const approvedDependencies = {
  pug: {
    version: "3.0.4",
    license: "MIT",
    purpose: "Compile Pug fixture sources into generated HTML for PugDoc source-linkage validation."
  },
  "pug-lexer": {
    version: "5.0.1",
    license: "MIT",
    purpose: "Tokenize Pug source for official AST-backed documentation binding fixtures."
  },
  "pug-linker": {
    version: "4.0.0",
    license: "MIT",
    purpose: "Link loaded include and inheritance ASTs for generated documentation provenance decisions."
  },
  "pug-load": {
    version: "3.0.0",
    license: "MIT",
    purpose: "Resolve and load Pug dependency graphs while retaining source provenance."
  },
  "pug-parser": {
    version: "6.0.0",
    license: "MIT",
    purpose: "Parse official location-bearing Pug ASTs for documentation binding analysis."
  },
  "pug-walk": {
    version: "2.0.0",
    license: "MIT",
    purpose: "Traverse source, loaded and linked Pug AST views without implementing a second parser."
  }
};

let failed = false;

for (const [name, version] of Object.entries(rootPackage.dependencies || {})) {
  const approved = approvedDependencies[name];
  if (!approved) {
    console.error(`Unapproved runtime dependency: ${name}`);
    failed = true;
    continue;
  }
  if (version !== approved.version) {
    console.error(`Dependency ${name} must stay pinned to ${approved.version}; found ${version}.`);
    failed = true;
  }
}

const extraFields = ["devDependencies", "peerDependencies", "optionalDependencies"];
for (const field of extraFields) {
  const declared = Object.keys(rootPackage[field] || {});
  if (declared.length > 0) {
    console.error(`PugDoc P1 dependency audit does not allow ${field}: ${declared.join(", ")}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("PugDoc license audit passed: approved pinned MIT Pug pipeline dependencies.");
