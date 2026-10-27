/** @file @lang zh-CN Pug文档与生成HTML的被动映射，保留发生项身份并省略缺失可选字段。 @lang en Passive Pug-document/generated-HTML mapping, preserving occurrence identities and omitting absent optional fields. */
import { PUGDOC_EXTRACTION_CONTRACT } from "@hia-doc/pugdoc-spec";

/**
 * @lang zh-CN 生成Pug/HTML文档映射，可选引用独立binding sidecar，不包含其正文或读取源码。
 * @lang en Creates a Pug/HTML documentation map, optionally referencing an independent binding sidecar without embedding its body or reading source.
 *
 * @param {object} options <lang><zh-CN>Pug提取工件、相对产物路径及可选绑定引用；缺省路径使用dist/output系列。</zh-CN><en>Pug extraction, relative output paths and optional binding refs; missing paths use the dist/output family.</en></lang>
 * @returns {object} <lang><zh-CN>1.1.0 映射；逐引用声明已证或未知的范围约定，源码 id 与绑定端路径一致，重复发生项保留唯一 id。仅生成新对象，不重写旧工件。</zh-CN><en>A 1.1.0 map with proven or unknown range conventions per reference, source ids matching binding paths, and unique occurrence ids. Creates a new object without rewriting saved artifacts.</en></lang>
 */
export function createPugHtmlDocSourceMap(options) {
  const {
    pugArtifact,
    htmlPath,
    pugDocPath,
    htmDocPath,
    hiaDocumentPath,
    generatedBindingSidecar,
    generatedBindingRefsBySymbolId = new Map()
  } = options ?? {};

  assertPugDocArtifact(pugArtifact);
  const normalizedHtmlPath = normalizePath(htmlPath ?? "dist/output.html");
  const normalizedPugDocPath = normalizePath(pugDocPath ?? "dist/output.pugdoc.json");
  const normalizedHtmDocPath = normalizePath(htmDocPath ?? "dist/output.htmdoc.json");
  const normalizedHiaDocumentPath = normalizePath(hiaDocumentPath ?? "dist/output.hia.json");

  // <lang><zh-CN>分配器仅对本次manifest生效：首个身份保持，碰撞追加确定性发生序号，不删除语义项。</zh-CN><en>The allocator belongs to this manifest only: preserve first identities and append deterministic occurrence numbers on collisions without dropping semantic items.</en></lang>
  const entryIds = new Set();
  /** @lang zh-CN 保留原entry数据，只为碰撞身份分配未占用后缀。 @lang en Preserves entry data, assigning an unused suffix only when its identity collides. */
  const uniqueEntry = (entry) => {
    // <lang><zh-CN>自然身份和计数器用于同集合消歧，不改变symbolId或上游关系对象。</zh-CN><en>The natural identity and counter disambiguate this collection without changing symbolId or upstream relation objects.</en></lang>
    const base = entry.id;
    let id = base;
    let occurrence = 2;
    while (entryIds.has(id)) id = `${base}~${occurrence++}`;
    entryIds.add(id);
    return { ...entry, id };
  };
  // <lang><zh-CN>链与entries复用同一组实际符号身份，避免碰撞消歧后链仍指向旧id。</zh-CN><en>Chains and entries share actual symbol identities so collision handling cannot leave stale chain ids.</en></lang>
  const symbolEntries = pugArtifact.symbols.map(symbol => uniqueEntry(createSymbolEntry(symbol, generatedBindingRefsBySymbolId.get(symbol.id) ?? [])));
  const relationEntries = pugArtifact.relations.map(relation => uniqueEntry(createRelationEntry(relation)));

  return {
    contract: "doc-source-map",
    contractVersion: "1.1.0",
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
    ...(generatedBindingSidecar ? { generatedBindingSidecars: [generatedBindingSidecar] } : {}),
    chains: [
      {
        id: "chain:pug-html:document",
        stages: [
          {
            from: sourceIdForPath(pugArtifact.sources.find((source) => source.role === "entry")?.path ?? pugArtifact.sources[0]?.path ?? "input.pug"),
            to: "artifact:html:generated",
            transform: "pug-compile",
            sourceMap: null,
            linkage: symbolEntries.map(entry => entry.id)
          },
          {
            from: "artifact:html:generated",
            to: "artifact:hia:document",
            transform: "pugdoc-to-hia-core",
            sourceMap: null,
            linkage: symbolEntries.map(entry => entry.id)
          }
        ]
      }
    ],
    entries: [
      ...symbolEntries,
      ...relationEntries
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

/**
 * @lang zh-CN 把 Pug 符号与最小绑定引用转成映射条目，缺失选择器时省略；有注释时声明已证的 UTF-16 排除终点，未经自然提取证明的目标行回退明确标未知。
 * @lang en Converts a Pug symbol and minimal binding refs to a map entry, omitting absent selectors; annotation spans use proven exclusive UTF-16 coordinates, while an unproven target-line fallback remains unknown.
 * @param {object} symbol Pug 提取符号；Extracted Pug symbol.
 * @param {Array<object>} generatedBindingRefs 绑定 sidecar 的引用；Binding sidecar references.
 * @returns {object} 新版映射条目；Current map entry.
 */
function createSymbolEntry(symbol, generatedBindingRefs) {
  // <lang><zh-CN>选择器是可选定位提示；无法从该符号生成时省略，不伪造CSS定位。</zh-CN><en>The selector is an optional location hint; omit it when unavailable rather than fabricate a CSS location.</en></lang>
  const selector = selectorForSymbol(symbol);
  // <lang><zh-CN>注释块范围已有真实提取实样；仅用目标行回退的分支尚无自然产生的无注释符号证据。</zh-CN><en>Real extraction proves annotation spans; target-line fallback lacks evidence from a naturally annotation-free symbol.</en></lang>
  const range = symbol.annotation?.range ?? symbol.source.range;
  const rangeConvention = symbol.annotation?.range
    ? { endBoundary: "exclusive", columnUnit: "utf16-code-unit" }
    : { endBoundary: "unknown", columnUnit: "unknown" };
  return {
    id: entryIdForSymbol(symbol),
    kind: "symbol",
    symbolKind: symbol.kind,
    symbolId: symbol.id,
    ...(symbol.annotation ? { annotation: {
          tag: symbol.annotation.tag,
          value: symbol.annotation.value
        } } : {}),
    sourceRefs: [
      {
        sourceId: sourceIdForPath(symbol.source.path),
        ...(range ? { range, rangeConvention } : {}),
        rangeSource: "parser",
        confidence: symbol.source.confidence ?? "high"
      }
    ],
    artifactRefs: [
      {
        artifactId: "artifact:html:generated",
        ...(selector ? { selector } : {}),
        rangeSource: symbol.kind === "pug-mixin" ? "heuristic" : "adapter",
        confidence: symbol.kind === "pug-mixin" ? "medium" : "high"
      }
    ],
    diagnostics: symbol.kind === "pug-mixin" ? ["PUG_HTMDOC_MIXIN_LINKAGE_PARTIAL"] : [],
    ...(generatedBindingRefs.length > 0 ? { generatedBindingRefs } : {})
  };
}

/**
 * @lang zh-CN 把 Pug 关系逐发生项转成映射条目，未解析的产物关联不虚构选择器，只有已测的 parser 关系声明精确范围约定。
 * @lang en Converts each Pug relation occurrence to a map entry without fabricating selectors for unresolved artifact links; only sampled parser relations receive precise range conventions.
 * @param {object} relation Pug 提取关系；Extracted Pug relation.
 * @returns {object} 新版映射条目；Current map entry.
 */
function createRelationEntry(relation) {
  // <lang><zh-CN>解析状态与可选选择器独立，缺少选择器不删除关系。</zh-CN><en>Resolution state and optional selector are independent; missing selectors never remove relations.</en></lang>
  const unresolved = relation.kind === "extends" || relation.kind === "block";
  const selector = selectorForRelation(relation);
  // <lang><zh-CN>实样覆盖 include、block 与 mixin-call 的行范围；extends 和其它来源暂保持未知，不能按 parser 标签外推。</zh-CN><en>Samples cover line ranges for include, block and mixin-call; extends and other provenance remain unknown instead of inheriting a parser-label guess.</en></lang>
  const provenRange = ["include", "block", "mixin-call"].includes(relation.kind)
    && relation.source.rangeSource === "parser";
  const rangeConvention = provenRange
    ? { endBoundary: "exclusive", columnUnit: "utf16-code-unit" }
    : { endBoundary: "unknown", columnUnit: "unknown" };
  return {
    id: `entry:${relation.id}`,
    kind: relation.kind === "include" ? "resource-reference" : "source-anchor",
    relationKind: relation.kind,
    sourceRefs: [
      {
        sourceId: sourceIdForPath(relation.source.path),
        ...(relation.source.range ? { range: relation.source.range, rangeConvention } : {}),
        rangeSource: relation.source.rangeSource,
        confidence: unresolved ? "low" : relation.source.confidence
      }
    ],
    artifactRefs: [
      {
        artifactId: "artifact:html:generated",
        ...(selector ? { selector } : {}),
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

/**
 * @lang zh-CN 采用绑定提取器既有逻辑源码身份，保留路径大小写、层级、Unicode和标点，避免slug碰撞。
 * @lang en Uses the binding extractor's existing logical source identity, preserving case, hierarchy, Unicode and punctuation to avoid slug collisions.
 * @param {string} sourcePath <lang><zh-CN>提取工件中的安全工作区相对路径；反斜杠按已有规则转斜杠。</zh-CN><en>Safe workspace-relative extraction path; backslashes become slashes under existing rules.</en></lang>
 * @returns {string} <lang><zh-CN>只用于JSON引用的opaque身份，不是URL或文件读取授权；不改写已存工件。</zh-CN><en>Opaque identity for JSON references only, not a URL or file-read authority; stored artifacts remain unchanged.</en></lang>
 * @throws {Error} <lang><zh-CN>路径违反既有安全相对路径规则时拒绝。</zh-CN><en>Rejects paths violating existing safe-relative-path rules.</en></lang>
 */
function sourceIdForPath(sourcePath) {
  return `source:pug:${normalizePath(sourcePath)}`;
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
