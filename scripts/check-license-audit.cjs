const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const approvedDependencies = {
  pug: {
    version: "3.0.4",
    license: "MIT",
    purpose: "Compile Pug fixture sources into generated HTML for PugDoc source-linkage validation."
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

console.log("PugDoc license audit passed: approved MIT dependency pug@3.0.4.");
