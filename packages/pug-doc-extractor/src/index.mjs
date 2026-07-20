import {
  PUGDOC_EXTRACTION_CONTRACT,
  PUGDOC_EXTRACTION_CONTRACT_VERSION,
  PUGDOC_PROFILE_VERSION,
  getPugDocSymbolKind,
  isPugDocTag,
  normalizePugDocTag
} from "@hia-doc/pugdoc-spec";

const PRIMARY_TAGS = new Set(["component", "element", "template", "mixin"]);
const DEFAULT_LOCALE = "en";
const HIA_TEXT_I18N_MODEL = "hia-text-i18n";
const HIA_TEXT_I18N_MODEL_VERSION = "0.2.0";

export function extractPugDoc(source, options = {}) {
  return extractPugProject([{ path: options.path ?? "input.pug", source }], options);
}

export function extractPugProject(files, options = {}) {
  const defaultLocale = normalizeLocale(options.defaultLocale) || DEFAULT_LOCALE;
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

    const fileModel = extractPugFile(source, sourcePath, usedIds, { defaultLocale });
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
    defaultLocale,
    locales: collectLocales([defaultLocale, ...symbols.flatMap((symbol) => symbol.i18n?.locales ?? [])]),
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

export function parsePugDocComment(rawComment, options = {}) {
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

  const defaultLocale = normalizeLocale(options.defaultLocale) || DEFAULT_LOCALE;
  const descriptionTag = annotations.find((annotation) => annotation.tag === "description");
  const summary = descriptionTag?.value || prose.join(" ").trim() || null;
  return {
    annotations,
    summary,
    i18n: createDescriptionI18n(summary, annotations, defaultLocale, "pugdoc.comment")
  };
}

function extractPugFile(source, sourcePath, usedIds, options) {
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const commentBlocks = collectPugDocCommentBlocks(lines, sourcePath);
  const symbols = [];
  const annotations = [];
  const relations = collectPugRelations(lines, sourcePath);
  const diagnostics = [];

  for (const block of commentBlocks) {
    const parsed = parsePugDocComment(block.raw, options);
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
      const symbol = createSymbolFromAnnotation(primary, parsed, block, target, sourcePath, usedIds, null, options.defaultLocale);
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
      symbols.push(createSymbolFromAnnotation(annotation, parsed, block, target, sourcePath, usedIds, parentId, options.defaultLocale));
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

function createSymbolFromAnnotation(annotation, parsed, block, target, sourcePath, usedIds, parentId = null, defaultLocale = DEFAULT_LOCALE) {
  const kind = getPugDocSymbolKind(annotation.tag);
  const name = getAnnotationName(annotation, target.info);
  const summary = getAnnotationSummary(annotation, parsed);
  const i18n = PRIMARY_TAGS.has(annotation.tag)
    ? createDescriptionI18n(summary, parsed.annotations, defaultLocale, "pugdoc.comment")
    : createDescriptionI18n(summary, [], defaultLocale, `pugdoc.${annotation.tag}`);
  const symbol = {
    id: allocateSymbolId(annotation.tag, name, parentId, usedIds),
    kind,
    name,
    parentId: parentId ?? undefined,
    summary: i18n?.fields.description?.defaultText ?? summary,
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
  if (i18n) {
    symbol.i18n = i18n;
  }
  return removeUndefined(symbol);
}

// 中文：把 PugDoc 的 `@lang` 与 inline `<lang>/<l>` 规整成 HIA field-level i18n。
// English: Normalizes PugDoc `@lang` and inline `<lang>/<l>` into HIA field-level i18n.
function createDescriptionI18n(defaultText, annotations, defaultLocale, source) {
  const blocks = collectLangBlocks(annotations, "description", source);
  const segments = parseInlineSegments(defaultText, "description");
  if (blocks.length === 0 && segments.length === 0) {
    return null;
  }

  const field = createTextField({
    fieldPath: "description",
    kind: "text",
    defaultLocale,
    defaultText,
    blocks,
    segments,
    source
  });

  return {
    enabled: true,
    model: HIA_TEXT_I18N_MODEL,
    modelVersion: HIA_TEXT_I18N_MODEL_VERSION,
    defaultLocale,
    locales: collectLocales([defaultLocale, ...Object.keys(field.localizedText)]),
    fields: {
      description: field
    }
  };
}

function collectLangBlocks(annotations, fieldPath, source) {
  return annotations
    .filter((annotation) => annotation.tag === "lang")
    .map((annotation) => parseLangBlock(annotation.value, fieldPath, source))
    .filter(Boolean);
}

function parseLangBlock(value, fieldPath, source) {
  const match = /^(\S+)(?:\s+([\s\S]+))?$/.exec(String(value ?? "").trim());
  const locale = normalizeLocale(match?.[1]);
  const text = compactWhitespace(match?.[2] ?? "");
  if (!locale || !text) {
    return null;
  }
  return {
    kind: "lang-block",
    locale,
    fieldPath,
    text,
    source,
    rangeInComment: null
  };
}

function createTextField(options) {
  const localizedText = {};
  const locales = collectLocales([
    options.defaultLocale,
    ...options.blocks.map((block) => block.locale),
    ...options.segments.flatMap((segment) => Object.keys(segment.localized))
  ]);

  for (const locale of locales) {
    const block = options.blocks.find((item) => item.locale === locale);
    localizedText[locale] = block?.text ?? renderInlineText(options.defaultText, options.segments, locale, options.defaultLocale);
  }

  const defaultText = localizedText[options.defaultLocale] || firstLocalizedText(localizedText) || compactWhitespace(options.defaultText);

  return {
    fieldPath: options.fieldPath,
    kind: options.kind,
    defaultLocale: options.defaultLocale,
    defaultText,
    source: options.source,
    localizedText,
    ...(options.blocks.length > 0 ? { blocks: options.blocks } : {}),
    ...(options.segments.length > 0 ? { segments: options.segments } : {}),
    resolutions: Object.fromEntries(Object.keys(localizedText).map((locale) => [
      locale,
      {
        requestedLocale: locale,
        resolvedLocale: locale,
        fallbackChain: fallbackChain(locale, options.defaultLocale),
        usedFallback: false,
        missing: false,
        sourceKind: options.blocks.some((block) => block.locale === locale) ? "lang-block" : "default-text",
        sourceLocale: locale,
        source: options.source
      }
    ])),
    missingLocales: []
  };
}

function parseInlineSegments(text, fieldPath) {
  const sourceText = String(text ?? "");
  const segments = [];
  const pattern = /<(lang|l)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = pattern.exec(sourceText))) {
    const localized = parseInlineLocalizedValues(match[3]);
    if (Object.keys(localized).length === 0) {
      continue;
    }
    const attributes = parseAttributes(match[2]);
    segments.push({
      kind: "lang-inline",
      id: `${fieldPath}.${segments.length}`,
      key: attributes.key ?? "",
      path: attributes.path ?? "",
      fieldPath,
      raw: match[0],
      localized,
      rangeInField: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }
  return segments;
}

function parseInlineLocalizedValues(innerText) {
  const localized = {};
  const pattern = /<([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})*)>([\s\S]*?)<\/\1>/g;
  let match;
  while ((match = pattern.exec(innerText || ""))) {
    const locale = normalizeLocale(match[1]);
    const text = compactWhitespace(match[2]);
    if (locale && text) {
      localized[locale] = text;
    }
  }
  return localized;
}

function renderInlineText(text, segments, locale, defaultLocale) {
  let rendered = compactWhitespace(text);
  for (const segment of segments) {
    rendered = rendered.replace(segment.raw, resolveInlineLocalizedText(segment.localized, locale, defaultLocale));
  }
  return rendered;
}

function resolveInlineLocalizedText(localized, locale, defaultLocale) {
  return localized[locale]
    ?? localized[getParentLocale(locale)]
    ?? localized[defaultLocale]
    ?? firstLocalizedText(localized)
    ?? "";
}

function parseAttributes(rawAttributes) {
  const attributes = {};
  const pattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = pattern.exec(rawAttributes || ""))) {
    attributes[match[1]] = match[2] || match[3] || "";
  }
  return attributes;
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

function collectLocales(values) {
  return [...new Set(values.map((value) => normalizeLocale(value)).filter(Boolean))];
}

function normalizeLocale(value) {
  const locale = String(value ?? "").trim().replace(/_/g, "-");
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale) ? locale : "";
}

function getParentLocale(locale) {
  return String(locale).split("-")[0] || locale;
}

function fallbackChain(locale, defaultLocale) {
  const chain = collectLocales([locale, getParentLocale(locale), defaultLocale]);
  return chain.length > 0 ? chain : [DEFAULT_LOCALE];
}

function firstLocalizedText(localizedText) {
  return Object.values(localizedText).find((text) => typeof text === "string" && text.length > 0) ?? "";
}

function compactWhitespace(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
