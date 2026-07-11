export const PUGDOC_CONFIG_SCHEMA_VERSION = "0.1.0-draft";
export const PUGDOC_CONFIG_SCHEMA_ID = "https://mandolin.github.io/HIA-Documentation/schemas/pugdoc-config-0.1.0-draft.schema.json";

const relativePath = {
  type: "string",
  minLength: 1,
  not: {
    anyOf: [
      { pattern: "^(?:[A-Za-z]:|/|\\\\|[A-Za-z][A-Za-z0-9+.-]*:)" },
      { pattern: "(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)" }
    ]
  }
};

export const PUGDOC_CONFIG_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: PUGDOC_CONFIG_SCHEMA_ID,
  title: "PugDoc Config",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "workspaceRoot", "outputDirectory", "inputs"],
  properties: {
    $schema: { const: PUGDOC_CONFIG_SCHEMA_ID },
    schemaVersion: { const: PUGDOC_CONFIG_SCHEMA_VERSION },
    workspaceRoot: relativePath,
    outputDirectory: relativePath,
    inputs: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "path"],
        properties: {
          kind: { enum: ["pug-entry"] },
          path: relativePath,
          artifactBasePath: relativePath,
          locals: { type: "object" }
        }
      }
    },
    options: {
      type: "object",
      additionalProperties: false,
      properties: {
        emitDocSourceMap: { type: "boolean" },
        pretty: { type: "boolean" },
        sourcesContentPolicy: { enum: ["none", "reference", "embed"] },
        writeResultManifest: { type: "boolean" }
      }
    },
    profileIds: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", pattern: "^[a-z0-9][a-z0-9._-]*$" }
    }
  }
});
