import { PUGDOC_EXTRACTION_CONTRACT } from "@hia-doc/pugdoc-spec";

export function createPugHtmlDocSourceMap(options) {
  const {
    pugArtifact,
    htmlPath,
    pugDocPath,
    htmDocPath,
    hiaDocumentPath
  } = options ?? {};

  assertPugDocArtifact(pugArtifact);
  const normalizedHtmlPath = normalizePath(htmlPath ?? "dist/output.html");
  const normalizedPugDocPath = normalizePath(pugDocPath ?? "dist/output.pugdoc.json");
  const normalizedHtmDocPath = normalizePath(htmDocPath ?? "dist/output.htmdoc.json");
  const normalizedHiaDocumentPath = normalizePath(hiaDocumentPath ?? "dist/output.hia.json");

  return {
    contract: "doc-source-map",
    contractVersion: "0.1.0-draft",
    id: options.id ?? "docmap:pug-html:document",
    producer: {
      name: "@hia-doc/pug-to-html-doc-source-map",
      version: "0.0.0",
      profile: "pug-htmdoc-bridge"
    },
    artifacts: [
      {
        id: "artifact:html:generated",
        kind: "generated-html",
        path: normalizedHtmlPath,
        language: "html",
        role: "generated",
        contractRefs: [
          {
            contract: "hia-htmdoc-extraction",
            path: normalizedHtmDocPath
          }
        ]
      },
      {
        id: "artifact:pugdoc:extraction",
        kind: "extraction-artifact",
        path: normalizedPugDocPath,
        language: "json",
        role: "generated",
        contractRefs: [
          {
            contract: PUGDOC_EXTRACTION_CONTRACT,
            path: normalizedPugDocPath
          }
        ]
      },
      {
        id: "artifact:hia:document",
        kind: "extraction-artifact",
        path: normalizedHiaDocumentPath,
        language: "json",
        role: "generated"
      }
    ],
    sources: pugArtifact.sources.map((source) => ({
      id: sourceIdForPath(source.path),
      kind: "template-source",
      path: normalizePath(source.path),
      language: "pug",
      role: source.role === "entry" ? "original" : "external",
      sourcesContentPolicy: "none"
    })),
    sourceMaps: [],
    chains: [
      {
        id: "chain:pug-html:document",
        stages: [
          {
            from: sourceIdForPath(pugArtifact.sources.find((source) => source.role === "entry")?.path ?? pugArtifact.sources[0]?.path ?? "input.pug"),
            to: "artifact:html:generated",
            transform: "pug-compile",
            sourceMap: null,
            linkage: pugArtifact.symbols.map((symbol) => entryIdForSymbol(symbol))
          },
          {
            from: "artifact:html:generated",
            to: "artifact:hia:document",
            transform: "pugdoc-to-hia-core",
            sourceMap: null,
            linkage: pugArtifact.symbols.map((symbol) => entryIdForSymbol(symbol))
          }
        ]
      }
    ],
    entries: [
      ...pugArtifact.symbols.map((symbol) => createSymbolEntry(symbol)),
      ...pugArtifact.relations.map((relation) => createRelationEntry(relation))
    ],
    privacy: {
      sourcesContentPolicy: "none",
      allowAbsolutePaths: false,
      allowUncPaths: false,
      allowPathTraversal: false,
      releaseGate: {
        requireExplicitEmbedOptIn: true,
        failOnUnsafePath: true,
        failOnUnexpectedSourcesContent: true
      }
    },
    diagnostics: [
      {
        code: "PUG_SOURCE_MAP_NOT_PRODUCED",
        severity: "info",
        message: "Pug P1 uses parser ranges and doc-source-map linkage; no ordinary source map is produced.",
        data: {
          ordinarySourceMap: "not-produced"
        }
      }
    ]
  };
}

function createSymbolEntry(symbol) {
  return {
    id: entryIdForSymbol(symbol),
    kind: "symbol",
    symbolKind: symbol.kind,
    symbolId: symbol.id,
    annotation: symbol.annotation
      ? {
          tag: symbol.annotation.tag,
          value: symbol.annotation.value
        }
      : null,
    sourceRefs: [
      {
        sourceId: sourceIdForPath(symbol.source.path),
        range: symbol.annotation?.range ?? symbol.source.range,
        rangeSource: "parser",
        confidence: symbol.source.confidence ?? "high"
      }
    ],
    artifactRefs: [
      {
        artifactId: "artifact:html:generated",
        selector: selectorForSymbol(symbol),
        rangeSource: symbol.kind === "pug-mixin" ? "heuristic" : "adapter",
        confidence: symbol.kind === "pug-mixin" ? "medium" : "high"
      }
    ],
    diagnostics: symbol.kind === "pug-mixin" ? ["PUG_HTMDOC_MIXIN_LINKAGE_PARTIAL"] : []
  };
}

function createRelationEntry(relation) {
  const unresolved = relation.kind === "extends" || relation.kind === "block";
  return {
    id: `entry:${relation.id}`,
    kind: relation.kind === "include" ? "resource-reference" : "source-anchor",
    relationKind: relation.kind,
    sourceRefs: [
      {
        sourceId: sourceIdForPath(relation.source.path),
        range: relation.source.range,
        rangeSource: relation.source.rangeSource,
        confidence: unresolved ? "low" : relation.source.confidence
      }
    ],
    artifactRefs: [
      {
        artifactId: "artifact:html:generated",
        selector: selectorForRelation(relation),
        rangeSource: unresolved ? "unresolved" : "heuristic",
        confidence: unresolved ? "none" : relation.source.confidence
      }
    ],
    diagnostics: relation.diagnostics ?? []
  };
}

function selectorForSymbol(symbol) {
  if (symbol.kind === "html-component") {
    return `[data-component="${symbol.name}"]`;
  }
  if (symbol.kind === "pug-mixin") {
    return `[data-pug-mixin="${symbol.name}"]`;
  }
  if (symbol.kind === "html-attribute" && symbol.parentId?.startsWith("component:")) {
    return `[data-component="${symbol.parentId.slice("component:".length)}"]`;
  }
  return null;
}

function selectorForRelation(relation) {
  if (relation.kind === "mixin-call" && relation.name) {
    return `[data-pug-mixin="${relation.name}"]`;
  }
  if (relation.kind === "include") {
    return "[data-pug-include]";
  }
  return null;
}

function sourceIdForPath(sourcePath) {
  return `source:pug:${slug(sourcePath)}`;
}

function entryIdForSymbol(symbol) {
  return `entry:${slug(symbol.id)}`;
}

function assertPugDocArtifact(artifact) {
  if (!artifact || artifact.contract !== PUGDOC_EXTRACTION_CONTRACT) {
    throw new Error(`Expected ${PUGDOC_EXTRACTION_CONTRACT} artifact.`);
  }
}

function normalizePath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe doc-source-map path: ${value}`);
  }
  return normalized;
}

function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "unnamed";
}
