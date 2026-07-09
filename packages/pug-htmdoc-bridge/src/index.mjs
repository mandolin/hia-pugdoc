import { PUGDOC_EXTRACTION_CONTRACT } from "@hia-doc/pugdoc-spec";

const HTMDOC_EXTRACTION_CONTRACT = "hia-htmdoc-extraction";
const HTMDOC_EXTRACTION_CONTRACT_VERSION = "0.1.0-draft";
const HTMDOC_PROFILE_VERSION = "0.1.0-draft";

export function pugDocToHtmlExtraction(pugArtifact, options = {}) {
  assertPugDocArtifact(pugArtifact);
  const htmlPath = normalizeSourcePath(options.htmlPath ?? "dist/output.html");
  const symbols = pugArtifact.symbols
    .filter((symbol) => symbol.kind.startsWith("html-") || symbol.kind === "pug-mixin")
    .map((symbol) => mapPugSymbolToHtmlSymbol(symbol, htmlPath));

  return {
    contract: HTMDOC_EXTRACTION_CONTRACT,
    contractVersion: HTMDOC_EXTRACTION_CONTRACT_VERSION,
    producer: {
      name: "@hia-doc/pug-htmdoc-bridge",
      version: "0.0.0"
    },
    profile: {
      name: "pug-htmdoc-bridge",
      version: HTMDOC_PROFILE_VERSION
    },
    source: {
      kind: "html",
      path: htmlPath
    },
    symbols,
    annotations: pugArtifact.annotations.map((annotation) => ({
      ...annotation,
      source: {
        path: htmlPath,
        range: null
      },
      pugSource: annotation.source
    })),
    diagnostics: pugArtifact.diagnostics ?? [],
    sourceMap: {
      kind: "hia-doc-source-map-ref",
      href: options.docSourceMapPath ?? null,
      sourcesContentPolicy: "none"
    },
    metadata: {
      sourceContract: pugArtifact.contract,
      pugSources: pugArtifact.sources,
      relations: pugArtifact.relations
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

function mapPugSymbolToHtmlSymbol(symbol, htmlPath) {
  const htmlKind = symbol.kind === "pug-mixin" ? "html-template" : symbol.kind;
  return {
    id: symbol.id,
    kind: htmlKind,
    name: symbol.name,
    parentId: symbol.parentId,
    summary: symbol.summary,
    source: {
      path: htmlPath,
      range: null,
      rangeSource: "adapter",
      confidence: symbol.kind === "pug-mixin" ? "medium" : "high"
    },
    annotation: symbol.annotation,
    metadata: {
      bridge: "pug-htmdoc",
      pugSource: symbol.source,
      target: symbol.metadata?.target ?? null,
      selector: selectorForSymbol(symbol)
    }
  };
}

function selectorForSymbol(symbol) {
  if (symbol.kind === "html-component") {
    return `[data-component="${symbol.name}"]`;
  }
  if (symbol.kind === "pug-mixin") {
    return `[data-pug-mixin="${symbol.name}"]`;
  }
  return null;
}

function normalizeSourcePath(sourcePath) {
  const normalized = String(sourcePath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe HTMDoc bridge source path: ${sourcePath}`);
  }
  return normalized;
}
