import { PUGDOC_EXTRACTION_CONTRACT } from "@hia-doc/pugdoc-spec";

const HIA_CORE_SCHEMA_VERSION = "0.2.0";
const HIA_SOURCE_MODEL = "hia-source";
const HIA_SOURCE_MODEL_VERSION = "0.2.0";

export function pugDocToHiaDocument(pugArtifact, options = {}) {
  assertPugDocArtifact(pugArtifact);
  const title = options.title ?? "PugDoc Document";
  const symbols = pugArtifact.symbols.map((symbol) => mapSymbol(symbol));
  const defaultLocale = options.defaultLocale ?? pugArtifact.defaultLocale ?? "en";

  return {
    schemaVersion: HIA_CORE_SCHEMA_VERSION,
    id: options.id ?? "pugdoc:document",
    title,
    defaultLocale,
    locales: collectDocumentLocales(options.locales, pugArtifact.locales, symbols, defaultLocale),
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
  const mapped = {
    id: symbol.id,
    name: symbol.name,
    kind: symbol.kind,
    parentId: symbol.parentId,
    summary: symbol.i18n?.fields?.description?.defaultText ?? symbol.summary,
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
  if (symbol.i18n) {
    mapped.i18n = symbol.i18n;
  }
  return mapped;
}

function collectDocumentLocales(optionLocales, artifactLocales, symbols, defaultLocale) {
  const locales = [
    defaultLocale,
    ...(Array.isArray(optionLocales) ? optionLocales : []),
    ...(Array.isArray(artifactLocales) ? artifactLocales : [])
  ];
  for (const symbol of symbols) {
    locales.push(...(Array.isArray(symbol.i18n?.locales) ? symbol.i18n.locales : []));
  }
  return [...new Set(locales.map((locale) => normalizeLocale(locale)).filter(Boolean))];
}

function normalizeLocale(value) {
  const locale = String(value ?? "").trim().replace(/_/g, "-");
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : "";
}
