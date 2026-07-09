import {
  PUGDOC_EXTRACTION_CONTRACT,
  PUGDOC_EXTRACTION_CONTRACT_VERSION,
  PUGDOC_PROFILE_VERSION,
  getPugDocSymbolKind,
  isPugDocTag,
  normalizePugDocTag
} from "@hia-doc/pugdoc-spec";

const PRIMARY_TAGS = new Set(["component", "element", "template", "mixin"]);

export function extractPugDoc(source, options = {}) {
  return extractPugProject([{ path: options.path ?? "input.pug", source }], options);
}

export function extractPugProject(files, options = {}) {
  const usedIds = new Set();
  const sources = [];
  const symbols = [];
  const annotations = [];
  const relations = [];
  const diagnostics = [];

  for (const file of files) {
    const sourcePath = normalizeSourcePath(file.path);
    const source = String(file.source ?? "");
    sources.push({
      kind: "pug",
      path: sourcePath,
      language: "pug",
      role: options.entryPath === sourcePath ? "entry" : "dependency",
      sourcesContentPolicy: options.sourcesContentPolicy ?? "none"
    });

    const fileModel = extractPugFile(source, sourcePath, usedIds);
    symbols.push(...fileModel.symbols);
    annotations.push(...fileModel.annotations);
    relations.push(...fileModel.relations);
    diagnostics.push(...fileModel.diagnostics);
  }

  return {
    contract: PUGDOC_EXTRACTION_CONTRACT,
    contractVersion: PUGDOC_EXTRACTION_CONTRACT_VERSION,
    producer: {
      name: "@hia-doc/pug-doc-extractor",
      version: "0.0.0"
    },
    profile: {
      name: "pugdoc",
      version: PUGDOC_PROFILE_VERSION
    },
    sources,
    symbols,
    annotations,
    relations,
    diagnostics,
    metadata: {
      parser: "pug-lineage-p1",
      sourceRangeModel: "1-based-line-column",
      sourcesContentPolicy: options.sourcesContentPolicy ?? "none"
    }
  };
}

export function parsePugDocComment(rawComment) {
  const lines = String(rawComment)
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*\* ?/, "").trim());

  const annotations = [];
  const prose = [];

  for (const line of lines) {
    if (!line) {
      continue;
    }
    const match = /^@([A-Za-z][\w-]*)(?:\s+(.*))?$/.exec(line);
    if (!match) {
      prose.push(line);
      continue;
    }
    const tag = normalizePugDocTag(match[1]);
    const value = (match[2] ?? "").trim();
    annotations.push({
      tag,
      value,
      known: isPugDocTag(tag)
    });
  }

  const descriptionTag = annotations.find((annotation) => annotation.tag === "description");
  return {
    annotations,
    summary: descriptionTag?.value || prose.join(" ").trim() || null
  };
}

function extractPugFile(source, sourcePath, usedIds) {
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const commentBlocks = collectPugDocCommentBlocks(lines, sourcePath);
  const symbols = [];
  const annotations = [];
  const relations = collectPugRelations(lines, sourcePath);
  const diagnostics = [];

  for (const block of commentBlocks) {
    const parsed = parsePugDocComment(block.raw);
    if (parsed.annotations.length === 0) {
      continue;
    }
    const target = findAttachedTarget(lines, block.endLineIndex + 1, sourcePath);
    annotations.push({
      tags: parsed.annotations,
      source: {
        path: sourcePath,
        range: block.range
      },
      target: target ? target.info : null
    });

    if (!target) {
      diagnostics.push(createDiagnostic("PUGDOC_COMMENT_TARGET_MISSING", "PugDoc comment block has no attached target.", "warning", sourcePath, block.range));
      continue;
    }

    const primary = parsed.annotations.find((annotation) => PRIMARY_TAGS.has(annotation.tag));
    let parentId = null;
    if (primary) {
      const symbol = createSymbolFromAnnotation(primary, parsed, block, target, sourcePath, usedIds);
      symbols.push(symbol);
      parentId = symbol.id;
    }

    for (const annotation of parsed.annotations) {
      if (PRIMARY_TAGS.has(annotation.tag) || annotation.tag === "description" || annotation.tag === "lang") {
        continue;
      }
      const kind = getPugDocSymbolKind(annotation.tag);
      if (!kind) {
        diagnostics.push(createDiagnostic("PUGDOC_UNKNOWN_TAG", `Unknown PugDoc annotation tag: @${annotation.tag}`, "warning", sourcePath, block.range, { tag: annotation.tag }));
        continue;
      }
      symbols.push(createSymbolFromAnnotation(annotation, parsed, block, target, sourcePath, usedIds, parentId));
    }
  }

  return { symbols, annotations, relations, diagnostics };
}

function collectPugDocCommentBlocks(lines, sourcePath) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed.startsWith("//-") && !trimmed.startsWith("//")) {
      continue;
    }

    const inline = trimmed.replace(/^\/\/-?/, "").trim();
    const indent = getIndent(line);
    const body = inline ? [inline] : [];
    let end = index;
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextLine = lines[next];
      if (!nextLine.trim()) {
        body.push("");
        end = next;
        continue;
      }
      if (getIndent(nextLine) <= indent) {
        break;
      }
      body.push(nextLine.slice(Math.min(getIndent(nextLine), indent + 2)).trimEnd());
      end = next;
    }

    blocks.push({
      raw: body.join("\n"),
      range: {
        start: { line: index + 1, column: indent + 1 },
        end: { line: end + 1, column: lines[end].length + 1 }
      },
      endLineIndex: end,
      sourcePath
    });
    index = end;
  }
  return blocks;
}

function findAttachedTarget(lines, startIndex, sourcePath) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("//")) {
      return null;
    }
    return {
      info: classifyPugTarget(trimmed),
      range: {
        start: { line: index + 1, column: getIndent(line) + 1 },
        end: { line: index + 1, column: line.length + 1 }
      },
      path: sourcePath,
      raw: trimmed
    };
  }
  return null;
}

function classifyPugTarget(trimmed) {
  const mixin = /^mixin\s+([A-Za-z_$][\w$-]*)/.exec(trimmed);
  if (mixin) {
    return { kind: "mixin", name: mixin[1] };
  }
  const block = /^block\s+([A-Za-z_$][\w$-]*)/.exec(trimmed);
  if (block) {
    return { kind: "block", name: block[1] };
  }
  const call = /^\+([A-Za-z_$][\w$-]*)/.exec(trimmed);
  if (call) {
    return { kind: "mixin-call", name: call[1] };
  }
  const tag = /^([A-Za-z][\w-]*)/.exec(trimmed);
  return { kind: "element", name: tag?.[1] ?? "fragment" };
}

function collectPugRelations(lines, sourcePath) {
  const relations = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const range = {
      start: { line: index + 1, column: getIndent(line) + 1 },
      end: { line: index + 1, column: line.length + 1 }
    };
    const relation = parseRelation(trimmed, sourcePath, range);
    if (relation) {
      relations.push(relation);
    }
  }
  return relations;
}

function parseRelation(trimmed, sourcePath, range) {
  const extendsMatch = /^extends\s+(.+)$/.exec(trimmed);
  if (extendsMatch) {
    return createRelation("extends", sourcePath, range, { target: extendsMatch[1].trim(), confidence: "low" });
  }
  const includeMatch = /^include\s+(.+)$/.exec(trimmed);
  if (includeMatch) {
    return createRelation("include", sourcePath, range, { target: includeMatch[1].trim(), confidence: "medium" });
  }
  const blockMatch = /^block\s+([A-Za-z_$][\w$-]*)/.exec(trimmed);
  if (blockMatch) {
    return createRelation("block", sourcePath, range, { name: blockMatch[1], confidence: "low" });
  }
  const callMatch = /^\+([A-Za-z_$][\w$-]*)/.exec(trimmed);
  if (callMatch) {
    return createRelation("mixin-call", sourcePath, range, { name: callMatch[1], confidence: "medium" });
  }
  return null;
}

function createRelation(kind, sourcePath, range, data) {
  return {
    id: `relation:${kind}:${slug(data.name ?? data.target ?? `${range.start.line}`)}`,
    kind,
    source: {
      path: sourcePath,
      range,
      rangeSource: "parser",
      confidence: data.confidence
    },
    target: data.target,
    name: data.name,
    diagnostics: relationDiagnostics(kind)
  };
}

function relationDiagnostics(kind) {
  if (kind === "mixin-call") {
    return ["PUG_HTMDOC_MIXIN_LINKAGE_PARTIAL"];
  }
  if (kind === "extends" || kind === "block") {
    return ["PUG_HTMDOC_EXTENDS_BLOCK_LINKAGE_DEFERRED"];
  }
  return [];
}

function createSymbolFromAnnotation(annotation, parsed, block, target, sourcePath, usedIds, parentId = null) {
  const kind = getPugDocSymbolKind(annotation.tag);
  const name = getAnnotationName(annotation, target.info);
  const symbol = {
    id: allocateSymbolId(annotation.tag, name, parentId, usedIds),
    kind,
    name,
    parentId: parentId ?? undefined,
    summary: getAnnotationSummary(annotation, parsed),
    source: {
      path: sourcePath,
      range: target.range,
      rangeSource: "parser",
      confidence: "high"
    },
    annotation: {
      tag: annotation.tag,
      value: annotation.value,
      range: block.range
    },
    metadata: {
      target: target.info,
      rawTarget: target.raw
    }
  };
  return removeUndefined(symbol);
}

function allocateSymbolId(tag, name, parentId, usedIds) {
  let baseId;
  if (tag === "component") {
    baseId = `component:${name}`;
  } else if (tag === "mixin") {
    baseId = `mixin:${name}`;
  } else if (parentId) {
    baseId = `${tag}:${parentId}:${name}`;
  } else {
    baseId = `${tag}:${name}`;
  }
  return allocateId(baseId.replace(/\s+/g, ""), usedIds);
}

function getAnnotationName(annotation, target) {
  const [first] = annotation.value.split(/\s+/).filter(Boolean);
  if (first) {
    return first;
  }
  return target.name;
}

function getAnnotationSummary(annotation, parsed) {
  if (annotation.tag === "component" || annotation.tag === "element" || annotation.tag === "template" || annotation.tag === "mixin") {
    return parsed.summary ?? getAnnotationDescription(annotation);
  }
  return getAnnotationDescription(annotation);
}

function getAnnotationDescription(annotation) {
  const [, ...rest] = annotation.value.split(/\s+/).filter(Boolean);
  return rest.join(" ") || undefined;
}

function getIndent(line) {
  return /^\s*/.exec(line)?.[0].length ?? 0;
}

function normalizeSourcePath(sourcePath) {
  const normalized = String(sourcePath).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[a-zA-Z]:\//.test(normalized) || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe PugDoc source path: ${sourcePath}`);
  }
  return normalized;
}

function createDiagnostic(code, message, severity, sourcePath, range, data = {}) {
  return {
    code,
    message,
    severity,
    path: sourcePath,
    data: {
      ...data,
      range
    }
  };
}

function allocateId(baseId, usedIds) {
  let id = baseId;
  let index = 2;
  while (usedIds.has(id)) {
    id = `${baseId}-${index}`;
    index += 1;
  }
  usedIds.add(id);
  return id;
}

function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "unnamed";
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
