const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const declared = dependencyFields.flatMap((field) => Object.keys(rootPackage[field] || {}));

if (declared.length > 0) {
  console.error("PugDoc skeleton must not add dependencies before dependency/license review:");
  for (const name of declared) {
    console.error(`- ${name}`);
  }
  process.exit(1);
}

console.log("PugDoc license audit passed: no third-party dependencies declared.");
