import path from "node:path";

import lex from "pug-lexer";
import link from "pug-linker";
import load from "pug-load";
import parse from "pug-parser";
import walk from "pug-walk";

/**
 * @lang zh-CN Pug adapter 对齐 W-P52.3 的中性生成式文档绑定 contract 名称。
 * @lang en Neutral generated documentation binding contract name aligned with W-P52.3.
 */
export const GENERATED_DOCUMENTATION_BINDING_CONTRACT = "generated-documentation-binding";

/**
 * @lang zh-CN Pug P1 当前消费的中性生成式文档绑定 contract 版本。
 * @lang en Neutral generated documentation binding contract version consumed by Pug P1.
 */
export const GENERATED_DOCUMENTATION_BINDING_CONTRACT_VERSION = "0.1.0-draft";

const ADAPTER_ID = "pug";
const LOCALS_CONTRACT = "generated-doc-locals";
const LOCALS_CONTRACT_VERSION = "0.1.0-draft-input";
const LOCALS_LIMITS = Object.freeze({ maxDepth: 12, maxEntries: 10000, maxStringBytes: 65536 });
const PROHIBITED_LOCAL_SOURCES = Object.freeze([
  "process-environment",
  "network",
  "provider",
  "host-editor",
  "implicit-runtime-capture"
]);
const DIAGNOSTIC_SEVERITIES = Object.freeze({
  GDB_REF_SYNTAX_INVALID: "error",
  GDB_REF_UNRESOLVED: "warning",
  GDB_SCOPE_AMBIGUOUS: "warning",
  GDB_EXPANSION_RUNTIME_ONLY: "info",
  GDB_INSTANCE_KEY_MISSING: "warning",
  GDB_INSTANCE_KEY_UNSTABLE: "info",
  GDB_INSTANCE_KEY_DUPLICATE: "error",
  GDB_TARGET_MISMATCH: "warning",
  GDB_INHERITANCE_CONFLICT: "warning",
  GDB_LOCALS_POLICY_VIOLATION: "error"
});
const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const SAFE_INSTANCE_FRAGMENT = /^[A-Za-z0-9._~-]+$/;
const BLOCKED_MEMBER_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * 使用官方 Pug AST/load/link/walk 管线构造中性 generated-documentation-binding
 * sidecar。它只解析和解析受限 binding reference，不执行 Pug/JavaScript expression，
 * 也不会把 source body 或 deterministic locals value 写入结果。
 * Builds a neutral generated-documentation-binding sidecar using the official
 * Pug AST/load/link/walk pipeline. It only parses and resolves the restricted
 * binding-reference subset, never executes Pug/JavaScript expressions, and
 * never writes source bodies or deterministic-local values to the result.
 *
 * @lang zh-CN `locals` 仅接受受审计的 JSON-compatible envelope；其值只在进程内
 * 用于 each/mixin fixture 的结构化路径查询。
 * @lang en `locals` accepts only an audited JSON-compatible envelope; values
 * remain in process and are used solely for structured each/mixin fixture lookup.
 *
 * @param {{ workspaceRoot: string, entryPath: string, sidecarId?: string, sidecarPath: string, docSourceMapId?: string, locals?: object }} options Pug binding extraction options.
 * @returns {object} Versioned neutral binding sidecar without Pug AST internals.
 */
export function extractPugGeneratedDocumentationBinding(options) {
  const normalized = normalizeOptions(options);
  const state = createExtractionState(normalized);
  const loadedAst = load.file(normalized.entryAbsolutePath, { lex, parse });

  // <lang zh-CN>linked AST 只用于确认继承已走官方 linker；不把 AST 内容带出 adapter。</lang>
  // <lang en>The linked AST only confirms official inheritance linking; adapter results never expose AST content.</lang>
  const linkedAst = link(JSON.parse(JSON.stringify(loadedAst)));
  state.parserViews.sourceAstNodeCount = countAstNodes(loadedAst, false);
  state.parserViews.loadedDependencyNodeCount = countAstNodes(loadedAst, true);
  state.parserViews.linkedAstNodeCount = countAstNodes(linkedAst, false);

  const rootScope = createRootScope(state, normalized.entryPath);
  visitBlock(loadedAst, rootScope, state);
  materializeMixinInvocationFrames(state);
  materializeBindings(state);

  return {
    contract: GENERATED_DOCUMENTATION_BINDING_CONTRACT,
    contractVersion: GENERATED_DOCUMENTATION_BINDING_CONTRACT_VERSION,
    id: normalized.sidecarId,
    producer: {
      name: "@hia-doc/pug-doc-extractor",
      version: "0.0.0",
      adapterId: ADAPTER_ID
    },
    docSourceMapLinkage: {
      contract: "doc-source-map",
      contractVersion: "0.1.0-draft",
      ...(normalized.docSourceMapId ? { docSourceMapId: normalized.docSourceMapId } : {}),
      sidecarId: normalized.sidecarId,
      sidecarPath: normalized.sidecarPath,
      entryReferenceField: "generatedBindingRefs"
    },
    privacy: createPrivacyPolicy(),
    deterministicLocalsPolicy: createLocalsPolicy(normalized.locals),
    compatibility: {
      minimumConsumerContractVersion: GENERATED_DOCUMENTATION_BINDING_CONTRACT_VERSION,
      unknownFieldPolicy: "ignore-unknown-optional-fields",
      breakingChangePolicy: "new-contract-version-and-schema-id"
    },
    bindings: state.bindings,
    expansions: state.expansions,
    targets: state.targets,
    diagnostics: state.diagnostics
  };
}

/**
 * 从 generated-documentation-binding sidecar 收集 doc-source-map entry 所需的
 * symbol -> binding reference；它不建立 W-P52.5 的查询 index。
 * Collects symbol-to-binding references needed by doc-source-map entries from a
 * generated-documentation-binding sidecar; it does not build the W-P52.5 query index.
 *
 * @param {object} sidecar Neutral binding sidecar returned by the extractor.
 * @returns {Map<string, Array<{ bindingId: string, sidecarId: string }>>} Safe entry reference map.
 */
export function collectGeneratedBindingRefsBySymbolId(sidecar) {
  const targets = new Map((sidecar?.targets ?? []).map((target) => [target.id, target]));
  const references = new Map();
  for (const expansion of sidecar?.expansions ?? []) {
    for (const targetId of expansion.targetIds ?? []) {
      const symbolId = targets.get(targetId)?.identity?.symbolId;
      if (!symbolId) {
        continue;
      }
      const current = references.get(symbolId) ?? [];
      if (!current.some((item) => item.bindingId === expansion.bindingId)) {
        current.push({ bindingId: expansion.bindingId, sidecarId: sidecar.id });
      }
      references.set(symbolId, current);
    }
  }
  return references;
}

function normalizeOptions(options) {
  if (!isRecord(options)) {
    throw new TypeError("Generated binding extraction options must be an object.");
  }
  if (typeof options.workspaceRoot !== "string" || !path.isAbsolute(options.workspaceRoot)) {
    throw new TypeError("workspaceRoot must be an absolute directory.");
  }
  const entryPath = normalizeSafeRelativePath(options.entryPath, "entryPath");
  const sidecarPath = normalizeSafeRelativePath(options.sidecarPath, "sidecarPath");
  const sidecarId = nonEmptyString(options.sidecarId) ? options.sidecarId : `sidecar:pug:${slug(entryPath)}`;
  return {
    workspaceRoot: path.resolve(options.workspaceRoot),
    entryPath,
    entryAbsolutePath: path.resolve(options.workspaceRoot, entryPath),
    sidecarPath,
    sidecarId,
    docSourceMapId: nonEmptyString(options.docSourceMapId) ? options.docSourceMapId : undefined,
    locals: normalizeLocalsEnvelope(options.locals)
  };
}

function normalizeLocalsEnvelope(value) {
  if (value === undefined) {
    return {
      mode: "none",
      adapterId: ADAPTER_ID,
      inputId: undefined,
      bindingAllowlist: [],
      privacyClassification: "metadata-only",
      values: Object.create(null)
    };
  }
  if (!isRecord(value)
    || value.contract !== LOCALS_CONTRACT
    || value.contractVersion !== LOCALS_CONTRACT_VERSION
    || value.adapterId !== ADAPTER_ID
    || !nonEmptyString(value.inputId)
    || !Array.isArray(value.bindingAllowlist)
    || value.bindingAllowlist.some((name) => !IDENTIFIER_PATTERN.test(name))
    || !["metadata-only", "sensitive-not-serialized"].includes(value.privacyClassification)
    || !isRecord(value.values)) {
    throw new TypeError("generatedBindingLocals must use the frozen generated-doc-locals envelope.");
  }
  const bindingAllowlist = [...new Set(value.bindingAllowlist)].sort();
  assertJsonCompatible(value.values, "$", { count: 0, depth: 0 });
  for (const name of bindingAllowlist) {
    if (!Object.hasOwn(value.values, name)) {
      throw new TypeError(`generatedBindingLocals.values is missing allowlisted binding ${name}.`);
    }
  }
  return {
    mode: "deterministic-json-compatible",
    adapterId: ADAPTER_ID,
    inputId: value.inputId,
    bindingAllowlist,
    privacyClassification: value.privacyClassification,
    values: value.values
  };
}

function assertJsonCompatible(value, location, state) {
  state.count += 1;
  if (state.count > LOCALS_LIMITS.maxEntries) {
    throw new TypeError("generatedBindingLocals exceeds maxEntries.");
  }
  if (value === null || typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`generatedBindingLocals contains a non-finite number at ${location}.`);
    }
    return;
  }
  if (typeof value === "string") {
    if (Buffer.byteLength(value, "utf8") > LOCALS_LIMITS.maxStringBytes) {
      throw new TypeError(`generatedBindingLocals string exceeds maxStringBytes at ${location}.`);
    }
    return;
  }
  if (state.depth >= LOCALS_LIMITS.maxDepth || (!Array.isArray(value) && !isPlainRecord(value))) {
    throw new TypeError(`generatedBindingLocals only accepts plain JSON-compatible values at ${location}.`);
  }
  const next = { count: state.count, depth: state.depth + 1 };
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonCompatible(item, `${location}[${index}]`, next));
  } else {
    Object.entries(value).forEach(([key, item]) => assertJsonCompatible(item, `${location}.${key}`, next));
  }
  state.count = next.count;
}

function createExtractionState(options) {
  return {
    options,
    bindings: [],
    expansions: [],
    targets: [],
    diagnostics: [],
    candidates: [],
    mixinDefinitions: new Map(),
    mixinCalls: [],
    mixinFrames: new Map(),
    hasExtends: false,
    ids: new Set(),
    parserViews: {
      sourceAstNodeCount: 0,
      loadedDependencyNodeCount: 0,
      linkedAstNodeCount: 0
    }
  };
}

function createRootScope(state, sourcePath) {
  const declarations = new Map();
  for (const name of state.options.locals.bindingAllowlist) {
    declarations.set(name, `decl:pug:locals:${name}`);
  }
  const values = copyValues(state.options.locals.values);
  return createScope(state, null, {
    sourcePath,
    semantic: "template-root",
    declarationSlot: "root",
    declarations,
    frames: [{ id: "root", values, keys: Object.create(null), expansionScope: null }],
    composition: noComposition()
  });
}

function createScope(state, parent, details) {
  const sourcePath = normalizeSourcePath(details.sourcePath, state.options);
  const sourceId = sourceIdForPath(sourcePath);
  const semanticAncestry = [...(parent?.scope.semanticAncestry ?? []), details.semantic];
  const declarationSlot = details.declarationSlot;
  const id = `gdb-scope/v1/${ADAPTER_ID}/${encodeScopePart(sourceId)}#${semanticAncestry.map(encodeScopePart).join("~")}/${encodeScopePart(declarationSlot)}`;
  const declarations = details.declarations ?? new Map(parent?.declarations ?? []);
  return {
    id,
    sourcePath,
    sourceId,
    declarations,
    frames: details.frames ?? parent?.frames ?? [],
    composition: details.composition ?? parent?.composition ?? noComposition(),
    eachKeyAliases: details.eachKeyAliases ?? parent?.eachKeyAliases ?? [],
    mixinDefinition: details.mixinDefinition,
    scope: {
      id,
      adapterId: ADAPTER_ID,
      sourceId,
      semanticAncestry,
      declarationSlot,
      aliasMetadata: [...declarations.keys()].sort()
    }
  };
}

function visitBlock(block, scope, state) {
  if (!block || !Array.isArray(block.nodes)) {
    return;
  }
  visitNodes(block.nodes, scope, state);
}

function visitNodes(nodes, scope, state) {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node || typeof node !== "object") {
      continue;
    }
    if (node.type === "BlockComment" && node.buffer === false) {
      collectBindingCandidates(node, nodes[index + 1], scope, state);
      continue;
    }
    visitNode(node, scope, state);
  }
}

function visitNode(node, scope, state) {
  if (node.type === "Each") {
    visitEach(node, scope, state);
    return;
  }
  if (node.type === "Mixin") {
    visitMixin(node, scope, state);
    return;
  }
  if (node.type === "Include") {
    visitInclude(node, scope, state);
    return;
  }
  if (node.type === "Extends") {
    visitExtends(node, scope, state);
    return;
  }
  if (node.type === "NamedBlock") {
    visitNamedBlock(node, scope, state);
    return;
  }
  visitBlock(node.block, scope, state);
  if (Array.isArray(node.nodes)) {
    visitNodes(node.nodes, scope, state);
  }
}

function visitEach(node, scope, state) {
  const sourcePath = sourcePathForNode(node, scope.sourcePath, state.options);
  const declarations = new Map(scope.declarations);
  const valueAlias = typeof node.val === "string" && IDENTIFIER_PATTERN.test(node.val) ? node.val : null;
  const keyAlias = typeof node.key === "string" && IDENTIFIER_PATTERN.test(node.key) ? node.key : null;
  if (valueAlias) {
    declarations.set(valueAlias, allocateId(state, `decl:pug:${slug(sourcePath)}:each:${node.line}:value`));
  }
  if (keyAlias) {
    declarations.set(keyAlias, allocateId(state, `decl:pug:${slug(sourcePath)}:each:${node.line}:key`));
  }
  const child = createScope(state, scope, {
    sourcePath,
    semantic: `generator-each:${node.line ?? 0}`,
    declarationSlot: `each:${node.line ?? 0}`,
    declarations,
    frames: createEachFrames(node, scope, state),
    eachKeyAliases: keyAlias ? [...scope.eachKeyAliases, keyAlias] : scope.eachKeyAliases
  });
  visitBlock(node.block, child, state);
}

function createEachFrames(node, scope, state) {
  const reference = parseBindingReference(node.obj);
  if (!reference) {
    return [];
  }
  const frames = [];
  for (const parentFrame of scope.frames) {
    const resolved = resolveReferenceValue(reference, scope, parentFrame);
    if (!resolved.found || (!Array.isArray(resolved.value) && !isPlainRecord(resolved.value))) {
      continue;
    }
    const entries = Array.isArray(resolved.value)
      ? resolved.value.map((value, index) => [index, value, "array-index"])
      : Object.entries(resolved.value).map(([key, value]) => [key, value, "each-object-key"]);
    entries.forEach(([key, value, origin], order) => {
      const values = copyValues(parentFrame.values);
      if (typeof node.val === "string" && IDENTIFIER_PATTERN.test(node.val)) {
        values[node.val] = value;
      }
      const keys = copyValues(parentFrame.keys);
      if (typeof node.key === "string" && IDENTIFIER_PATTERN.test(node.key)) {
        values[node.key] = key;
        keys[node.key] = { origin, value: key };
      }
      frames.push({
        id: `${parentFrame.id}:each:${node.line ?? 0}:${order}`,
        values,
        keys,
        expansionScope: parentFrame.expansionScope
      });
    });
  }
  return frames;
}

function visitMixin(node, scope, state) {
  if (node.call) {
    state.mixinCalls.push({
      name: String(node.name ?? ""),
      args: String(node.args ?? ""),
      sourcePath: sourcePathForNode(node, scope.sourcePath, state.options),
      line: node.line ?? 0,
      scope,
      frames: scope.frames
    });
    visitBlock(node.block, scope, state);
    return;
  }
  const sourcePath = sourcePathForNode(node, scope.sourcePath, state.options);
  const declarations = new Map(scope.declarations);
  const parameterNames = parseMixinParameters(node.args);
  parameterNames.forEach((name, index) => declarations.set(name, allocateId(state, `decl:pug:${slug(sourcePath)}:mixin:${slug(node.name)}:${index}`)));
  const mixinDefinition = {
    name: String(node.name ?? ""),
    parameterNames,
    sourcePath,
    line: node.line ?? 0
  };
  const child = createScope(state, scope, {
    sourcePath,
    semantic: `template-mixin:${slug(mixinDefinition.name)}`,
    declarationSlot: `mixin:${slug(mixinDefinition.name)}`,
    declarations,
    mixinDefinition
  });
  mixinDefinition.scope = child;
  const definitions = state.mixinDefinitions.get(mixinDefinition.name) ?? [];
  definitions.push(mixinDefinition);
  state.mixinDefinitions.set(mixinDefinition.name, definitions);
  visitBlock(node.block, child, state);
}

function visitInclude(node, scope, state) {
  const includedAst = node.file?.ast;
  if (!includedAst) {
    return;
  }
  const sourcePath = sourcePathForFile(node.file, scope.sourcePath, state.options);
  const child = createScope(state, scope, {
    sourcePath,
    semantic: `template-include:${node.line ?? 0}`,
    declarationSlot: `include:${node.line ?? 0}`,
    declarations: new Map(scope.declarations),
    composition: {
      relation: "composition",
      mergePolicy: "compose-in-linked-order",
      contribution: {
        mode: "include",
        overrideKind: "include",
        contextId: `include:${slug(sourcePath)}:${node.line ?? 0}`
      }
    }
  });
  visitBlock(includedAst, child, state);
}

function visitExtends(node, scope, state) {
  const baseAst = node.file?.ast;
  if (!baseAst) {
    return;
  }
  state.hasExtends = true;
  const sourcePath = sourcePathForFile(node.file, scope.sourcePath, state.options);
  const child = createScope(state, scope, {
    sourcePath,
    semantic: `template-inheritance-base:${node.line ?? 0}`,
    declarationSlot: `extends:${node.line ?? 0}`,
    declarations: new Map(scope.declarations),
    composition: {
      relation: "inheritance",
      mergePolicy: "nearest-explicit-child-wins",
      contribution: {
        mode: "base",
        overrideKind: "base",
        contextId: `extends:${slug(sourcePath)}`
      }
    }
  });
  visitBlock(baseAst, child, state);
}

function visitNamedBlock(node, scope, state) {
  const sourcePath = sourcePathForNode(node, scope.sourcePath, state.options);
  const mode = ["replace", "append", "prepend"].includes(node.mode) ? node.mode : "replace";
  const inherited = state.hasExtends || scope.composition.relation === "inheritance" || sourcePath !== state.options.entryPath;
  const composition = inherited
    ? {
        relation: "inheritance",
        mergePolicy: mode === "replace" ? "nearest-explicit-child-wins" : "ordered-contribution",
        contribution: {
          mode,
          overrideKind: sourcePath === state.options.entryPath ? "child" : "base",
          contextId: `block:${slug(node.name)}:${mode}:${node.line ?? 0}`
        }
      }
    : scope.composition;
  const child = createScope(state, scope, {
    sourcePath,
    semantic: `template-block:${slug(node.name)}`,
    declarationSlot: `block:${slug(node.name)}:${mode}:${node.line ?? 0}`,
    declarations: new Map(scope.declarations),
    composition
  });
  if (Array.isArray(node.nodes)) {
    visitNodes(node.nodes, child, state);
  } else {
    visitBlock(node.block, child, state);
  }
}

function collectBindingCandidates(comment, attachedNode, scope, state) {
  const annotations = parseCommentAnnotations(comment);
  const sourcePath = sourcePathForNode(comment, scope.sourcePath, state.options);
  const sourceRef = createSourceRef(sourcePath, rangeForComment(comment));
  const target = isGeneratedTargetNode(attachedNode)
    ? createTargetSeed(attachedNode, annotations, sourcePath, state.options)
    : null;
  const instanceKey = annotations.find((annotation) => annotation.tag === "instancekey")?.value ?? null;
  const fields = annotations.filter((annotation) => annotation.tag !== "instancekey" && annotation.tag !== "lang");

  for (const field of fields) {
    const references = extractInlineReferences(field.value);
    references.forEach((expression, referenceIndex) => {
      state.candidates.push({
        id: allocateId(state, `binding:pug:${slug(sourcePath)}:${comment.line ?? 0}:${field.tag}:${referenceIndex}`),
        sourceIntent: {
          kind: "documentation-field",
          field: field.tag,
          sourceRef
        },
        expression,
        instanceKey,
        scope,
        target,
        composition: scope.composition,
        mixinDefinition: scope.mixinDefinition
      });
    });
  }
}

function materializeMixinInvocationFrames(state) {
  for (const call of state.mixinCalls) {
    const definitions = state.mixinDefinitions.get(call.name) ?? [];
    if (definitions.length !== 1) {
      continue;
    }
    const definition = definitions[0];
    const argumentsList = splitArguments(call.args);
    const frames = state.mixinFrames.get(definition.scope.id) ?? [];
    for (const parentFrame of call.frames) {
      const values = copyValues(parentFrame.values);
      let resolvable = argumentsList.length === definition.parameterNames.length;
      definition.parameterNames.forEach((name, index) => {
        const reference = parseBindingReference(argumentsList[index]);
        const resolved = reference ? resolveReferenceValue(reference, call.scope, parentFrame) : { found: false };
        if (!resolved.found) {
          resolvable = false;
          return;
        }
        values[name] = resolved.value;
      });
      if (!resolvable) {
        continue;
      }
      const callScope = createScope(state, call.scope, {
        sourcePath: call.sourcePath,
        semantic: `mixin-invocation:${slug(call.name)}:${call.line}`,
        declarationSlot: `mixin-call:${slug(call.name)}:${call.line}`,
        declarations: new Map(definition.scope.declarations),
        frames: []
      });
      frames.push({
        id: `${parentFrame.id}:mixin:${slug(call.name)}:${call.line}`,
        values,
        keys: copyValues(parentFrame.keys),
        expansionScope: callScope
      });
    }
    state.mixinFrames.set(definition.scope.id, frames);
  }
}

function materializeBindings(state) {
  for (const candidate of state.candidates) {
    const reference = parseBindingReference(candidate.expression);
    const declarationId = reference ? candidate.scope.declarations.get(reference.root) : undefined;
    const binding = {
      id: candidate.id,
      adapterId: ADAPTER_ID,
      sourceIntent: candidate.sourceIntent,
      bindingRef: {
        kind: reference?.kind ?? "adapter-defined",
        rootDeclarationId: declarationId ?? `decl:pug:unresolved:${slug(candidate.id)}`,
        memberPath: reference?.memberPath ?? []
      },
      scope: candidate.scope.scope,
      resolution: reference && declarationId
        ? resolution("exact", "high", candidate.target ? "source-and-generated" : "source-only")
        : resolution("unresolved", "none", "source-only"),
      composition: createComposition(candidate.composition, candidate.sourceIntent.sourceRef, candidate.id)
    };
    state.bindings.push(binding);

    if (!reference) {
      pushDiagnostic(state, "GDB_REF_SYNTAX_INVALID", binding.id);
    } else if (!declarationId) {
      pushDiagnostic(state, "GDB_REF_UNRESOLVED", binding.id);
    }
    if (!candidate.target) {
      pushDiagnostic(state, "GDB_TARGET_MISMATCH", binding.id);
    }

    const frames = candidate.mixinDefinition
      ? state.mixinFrames.get(candidate.mixinDefinition.scope.id) ?? []
      : candidate.scope.frames;
    if (!reference || !declarationId || frames.length === 0) {
      createUnresolvedExpansion(state, binding, candidate);
      continue;
    }
    frames.forEach((frame, order) => createResolvedExpansion(state, binding, candidate, reference, frame, order));
  }
}

function createResolvedExpansion(state, binding, candidate, reference, frame, order) {
  const expansionScope = frame.expansionScope?.scope ?? candidate.scope.scope;
  const instanceKey = resolveInstanceKey(candidate.instanceKey, candidate.scope, frame);
  const targetIds = [];
  if (candidate.target) {
    const targetId = allocateId(state, `target:${slug(binding.id)}:${order}`);
    state.targets.push({
      id: targetId,
      identity: candidate.target,
      resolution: resolution("exact", "high", "source-and-generated")
    });
    targetIds.push(targetId);
  }
  const expansion = {
    id: allocateId(state, `expansion:${slug(binding.id)}:${order}`),
    bindingId: binding.id,
    scopeId: expansionScope.id,
    order,
    instanceKey: instanceKey.value,
    resolution: candidate.target
      ? resolution("exact", "high", "source-and-generated")
      : resolution("unresolved", "none", "source-only"),
    targetIds
  };
  state.expansions.push(expansion);
  instanceKey.diagnosticCodes.forEach((code) => pushDiagnostic(state, code, expansion.id));
}

function createUnresolvedExpansion(state, binding, candidate) {
  const expansion = {
    id: allocateId(state, `expansion:${slug(binding.id)}:unresolved`),
    bindingId: binding.id,
    scopeId: candidate.scope.scope.id,
    order: 0,
    instanceKey: { status: "missing", origin: "unavailable", diagnosticCode: "GDB_INSTANCE_KEY_MISSING" },
    resolution: resolution("unresolved", "none", "source-only"),
    targetIds: []
  };
  state.expansions.push(expansion);
  pushDiagnostic(state, "GDB_EXPANSION_RUNTIME_ONLY", binding.id);
  pushDiagnostic(state, "GDB_INSTANCE_KEY_MISSING", expansion.id);
}

function resolveInstanceKey(expression, scope, frame) {
  if (expression) {
    const reference = parseBindingReference(expression);
    const resolved = reference ? resolveReferenceValue(reference, scope, frame) : { found: false };
    const key = resolved.found ? normalizeStableKey(resolved.value, "explicit-instance-key") : null;
    if (key) {
      return { value: key, diagnosticCodes: [] };
    }
    return {
      value: { status: "missing", origin: "unavailable", diagnosticCode: "GDB_INSTANCE_KEY_MISSING" },
      diagnosticCodes: reference ? ["GDB_INSTANCE_KEY_MISSING"] : ["GDB_REF_SYNTAX_INVALID", "GDB_INSTANCE_KEY_MISSING"]
    };
  }
  const keyAlias = scope.eachKeyAliases.at(-1);
  const keyMetadata = keyAlias ? frame.keys[keyAlias] : undefined;
  if (keyMetadata) {
    const key = normalizeStableKey(keyMetadata.value, keyMetadata.origin);
    if (key) {
      return { value: key, diagnosticCodes: [] };
    }
  }
  return {
    value: { status: "missing", origin: "unavailable", diagnosticCode: "GDB_INSTANCE_KEY_MISSING" },
    diagnosticCodes: ["GDB_INSTANCE_KEY_MISSING"]
  };
}

function normalizeStableKey(value, origin) {
  const type = typeof value;
  if ((type !== "string" && type !== "number" && type !== "boolean") || (type === "number" && !Number.isFinite(value))) {
    return null;
  }
  const fragment = String(value);
  if (!SAFE_INSTANCE_FRAGMENT.test(fragment) || isUnsafeKeyFragment(fragment)) {
    return null;
  }
  if (origin === "array-index") {
    return {
      status: "unstable",
      key: `gdb-key/v1/number:${fragment}`,
      origin: "array-index",
      privacySafe: true,
      diagnosticCode: "GDB_INSTANCE_KEY_UNSTABLE"
    };
  }
  const keyType = type === "number" ? "number" : type === "boolean" ? "boolean" : "string";
  return {
    status: "stable",
    key: `gdb-key/v1/${keyType}:${fragment}`,
    origin: origin === "each-object-key" ? "each-object-key" : "explicit-instance-key",
    privacySafe: true
  };
}

function isUnsafeKeyFragment(value) {
  return value.includes("/") || value.includes("\\") || /^[A-Za-z]:/.test(value) || value.includes("..") || /(?:token|secret|password|credential)/i.test(value);
}

function createTargetSeed(node, annotations, sourcePath, options) {
  const primary = annotations.find((annotation) => ["component", "element", "template", "mixin"].includes(annotation.tag));
  const name = primary?.value.split(/\s+/)[0] || node.name || "fragment";
  const symbolPrefix = primary?.tag === "component" ? "component"
    : primary?.tag === "mixin" ? "mixin"
      : primary?.tag === "template" ? "template"
        : "element";
  return {
    kind: "generated-html-element",
    artifactId: "artifact:html:generated",
    symbolId: `${symbolPrefix}:${name}`,
    selector: selectorForTag(node),
    range: rangeForNode(node)
  };
}

function createComposition(composition, sourceRef, bindingId) {
  if (!composition || composition.relation === "none") {
    return { relation: "none", mergePolicy: "not-applicable", contributions: [] };
  }
  const contribution = composition.contribution;
  return {
    relation: composition.relation,
    mergePolicy: composition.mergePolicy,
    contributions: [{
      id: `contribution:${slug(bindingId)}`,
      mode: contribution.mode,
      order: 0,
      sourceRef,
      overrideContext: {
        kind: contribution.overrideKind,
        contextId: contribution.contextId
      }
    }]
  };
}

function parseCommentAnnotations(comment) {
  const raw = (comment.block?.nodes ?? [])
    .filter((node) => node?.type === "Text")
    .map((node) => String(node.val ?? ""))
    .join("");
  return raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const match = /^@([A-Za-z][A-Za-z0-9_-]*)(?:\s+([\s\S]*))?$/.exec(line);
    return match ? [{ tag: match[1].toLowerCase().replaceAll("-", ""), value: (match[2] ?? "").trim() }] : [];
  });
}

function extractInlineReferences(value) {
  const results = [];
  const pattern = /<bind\s+ref\s*=\s*(?:"([^"]*)"|'([^']*)')\s*\/>/g;
  let match;
  while ((match = pattern.exec(String(value ?? "")))) {
    results.push((match[1] ?? match[2] ?? "").trim());
  }
  return results;
}

function parseBindingReference(value) {
  const source = String(value ?? "").trim();
  if (!source || !source.split(".").every((part) => IDENTIFIER_PATTERN.test(part) && !BLOCKED_MEMBER_SEGMENTS.has(part))) {
    return null;
  }
  const [root, ...memberPath] = source.split(".");
  return { kind: memberPath.length === 0 ? "identifier" : "member-path", root, memberPath };
}

function parseMixinParameters(value) {
  return splitArguments(value).filter((name) => IDENTIFIER_PATTERN.test(name));
}

function splitArguments(value) {
  const input = String(value ?? "").trim();
  return input ? input.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

function resolveReferenceValue(reference, scope, frame) {
  if (!scope.declarations.has(reference.root) || !Object.hasOwn(frame.values, reference.root)) {
    return { found: false };
  }
  let value = frame.values[reference.root];
  for (const segment of reference.memberPath) {
    if ((!isPlainRecord(value) && !Array.isArray(value)) || !Object.hasOwn(value, segment)) {
      return { found: false };
    }
    value = value[segment];
  }
  return { found: true, value };
}

function createPrivacyPolicy() {
  return {
    sourcesContentPolicy: "none",
    allowAbsolutePaths: false,
    allowUncPaths: false,
    allowSourceBodySerialization: false,
    allowRuntimeValueSerialization: false,
    allowRuntimeExpressionExecution: false,
    allowDigestSerialization: false,
    allowSecretSerialization: false
  };
}

function createLocalsPolicy(locals) {
  return {
    contract: LOCALS_CONTRACT,
    contractVersion: LOCALS_CONTRACT_VERSION,
    mode: locals.mode,
    ...(locals.inputId ? { inputId: locals.inputId } : {}),
    adapterId: ADAPTER_ID,
    bindingAllowlist: locals.bindingAllowlist,
    privacyClassification: locals.privacyClassification,
    limits: LOCALS_LIMITS,
    prohibitedSources: [...PROHIBITED_LOCAL_SOURCES]
  };
}

function pushDiagnostic(state, code, subjectId) {
  const id = `diagnostic:${slug(code)}:${slug(subjectId)}`;
  if (state.diagnostics.some((diagnostic) => diagnostic.id === id)) {
    return;
  }
  state.diagnostics.push({ id, code, severity: DIAGNOSTIC_SEVERITIES[code], subjectId });
}

function resolution(resolutionKind, confidence, provenanceCoverage) {
  return { resolutionKind, confidence, provenanceCoverage };
}

function noComposition() {
  return { relation: "none", mergePolicy: "not-applicable", contribution: null };
}

function countAstNodes(ast, includeDependencies) {
  let count = 0;
  walk(ast, () => { count += 1; }, { includeDependencies });
  return count;
}

function sourcePathForNode(node, fallback, options) {
  return normalizeSourcePath(node?.filename ?? fallback, options);
}

function sourcePathForFile(file, fallback, options) {
  return normalizeSourcePath(file?.fullPath ?? file?.path ?? fallback, options);
}

function normalizeSourcePath(value, options) {
  const candidate = String(value ?? options.entryPath).replaceAll("\\", "/");
  const absolute = path.isAbsolute(candidate) || path.win32.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(options.workspaceRoot, candidate);
  const relative = path.relative(options.workspaceRoot, absolute).replaceAll("\\", "/");
  return normalizeSafeRelativePath(relative, "Pug source path");
}

function normalizeSafeRelativePath(value, label) {
  const normalized = String(value ?? "").replaceAll("\\", "/");
  if (!normalized || path.posix.isAbsolute(normalized) || path.win32.isAbsolute(value) || normalized.split("/").includes("..") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)) {
    throw new TypeError(`${label} must be a safe relative path.`);
  }
  return normalized;
}

function createSourceRef(sourcePath, range) {
  return { sourceId: sourceIdForPath(sourcePath), range, rangeSource: "parser" };
}

function sourceIdForPath(sourcePath) {
  return `source:pug:${sourcePath}`;
}

function rangeForComment(comment) {
  const textNodes = (comment.block?.nodes ?? []).filter((node) => node?.type === "Text" && String(node.val ?? "").trim());
  const last = textNodes.at(-1);
  return {
    start: { line: integerOr(comment.line, 1), column: integerOr(comment.column, 1) },
    end: {
      line: integerOr(last?.line, comment.line ?? 1),
      column: integerOr(last?.column, 1) + String(last?.val ?? "").length
    }
  };
}

function rangeForNode(node) {
  return {
    start: { line: integerOr(node?.line, 1), column: integerOr(node?.column, 1) },
    end: { line: integerOr(node?.line, 1), column: integerOr(node?.column, 1) + String(node?.name ?? "").length }
  };
}

function selectorForTag(node) {
  const classes = (node?.attrs ?? []).filter((attribute) => attribute.name === "class" && typeof attribute.val === "string")
    .map((attribute) => attribute.val.replace(/["']/g, "").trim()).filter(Boolean);
  return `${node?.name ?? "*"}${classes.map((className) => `.${className}`).join("")}`;
}

function isGeneratedTargetNode(node) {
  return node?.type === "Tag";
}

function allocateId(state, base) {
  let id = base;
  let suffix = 2;
  while (state.ids.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  state.ids.add(id);
  return id;
}

function encodeScopePart(value) {
  return encodeURIComponent(String(value)).replaceAll("%", "_");
}

function copyValues(value) {
  return Object.assign(Object.create(null), value ?? {});
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function integerOr(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function slug(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "unnamed";
}
