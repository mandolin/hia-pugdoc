import { PUGDOC_EXTRACTION_CONTRACT } from "@hia-doc/pugdoc-spec";

const HIA_CORE_SCHEMA_VERSION = "0.2.0";
const HIA_SOURCE_MODEL = "hia-source";
const HIA_SOURCE_MODEL_VERSION = "0.2.0";

export function pugDocToHiaDocument(pugArtifact, options = {}) {
  assertPugDocArtifact(pugArtifact);
  const title = options.title ?? "PugDoc Document";
  const symbols = pugArtifact.symbols.map((symbol) => mapSymbol(symbol));

  return {
    schemaVersion: HIA_CORE_SCHEMA_VERSION,
    id: options.id ?? "pugdoc:document",
    title,
    defaultLocale: options.defaultLocale ?? "en",
    locales: options.locales ?? ["en"],
    nodes: [
      {
        id: "root",
        kind: "root",
        title,
        symbolIds: symbols.map((symbol) => symbol.id)
      }
    ],
    symbols,
    diagnostics: pugArtifact.diagnostics ?? [],
    metadata: {
      sourceContract: pugArtifact.contract,
      sourceContractVersion: pugArtifact.contractVersion,
      producer: pugArtifact.producer,
      docSourceMaps: options.docSourceMapPath
        ? [
            {
              contract: "doc-source-map",
              contractVersion: "0.1.0-draft",
              path: options.docSourceMapPath,
              entryArtifact: options.entryArtifact ?? null
            }
          ]
        : []
    }
  };
}

export function assertPugDocArtifact(artifact) {
  if (!artifact || artifact.contract !== PUGDOC_EXTRACTION_CONTRACT) {
    throw new Error(`Expected ${PUGDOC_EXTRACTION_CONTRACT} artifact.`);
  }
  if (!Array.isArray(artifact.symbols)) {
    throw new Error("PugDoc extraction artifact must contain symbols array.");
  }
}

function mapSymbol(symbol) {
  return {
    id: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    parentId: symbol.parentId,
    summary: symbol.summary,
    source: {
      model: HIA_SOURCE_MODEL,
      modelVersion: HIA_SOURCE_MODEL_VERSION,
      mode: "link",
      definedIn: {
        kind: "defined-in",
        relativePath: symbol.source?.path ?? "input.pug",
        language: "pug",
        position: symbol.source?.range?.start ?? { line: 1, column: 1 },
        range: symbol.source?.range,
        link: {
          enabled: false,
          openMode: "same-tab"
        }
      },
      primaryBlock: null,
      references: [],
      fragments: [],
      diagnostics: []
    },
    diagnostics: symbol.diagnostics ?? [],
    metadata: {
      pugdoc: {
        annotation: symbol.annotation ?? null,
        target: symbol.metadata?.target ?? null
      }
    }
  };
}
