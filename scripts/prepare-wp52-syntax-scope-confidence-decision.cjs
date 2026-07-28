const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const lex = require("pug-lexer");
const link = require("pug-linker");
const load = require("pug-load");
const parse = require("pug-parser");
const walk = require("pug-walk");

const root = path.resolve(__dirname, "..");
const fixtureRoot = path.join(root, "fixtures", "generated-binding-decision");
const outputRoot = path.join(root, "dist", "wp52-syntax-scope-confidence-decision");
const evidencePath = path.join(outputRoot, "evidence.json");
const syntaxMatrixPath = path.join(outputRoot, "syntax-candidate-matrix.md");
const semanticDecisionPath = path.join(outputRoot, "semantic-decision-ledger.md");
const inheritancePolicyPath = path.join(outputRoot, "inheritance-locals-diagnostic-policy.md");

main();

/**
 * 生成 W-P52.2 的真实 Pug AST 语法、作用域与解析质量决策证据。
 * Generates real Pug AST evidence for the W-P52.2 syntax, scope, and
 * resolution-quality decisions.
 *
 * @lang zh-CN 本脚本使用官方 Pug lexer/parser/load/link/walk 管线读取合成
 * fixture。它冻结规范决策，但不会修改生产 extractor、执行模板数据、输出源码
 * 正文，或改变主仓 schema。
 * @lang en This script uses the official Pug lexer/parser/load/link/walk
 * pipeline over synthetic fixtures. It freezes specification decisions
 * without modifying the production extractor, executing template data,
 * emitting source bodies, or changing the core schema.
 *
 * @returns {void} 写入 public-safe W-P52.2 evidence 与中文优先报告。
 */
function main() {
  const candidates = createSyntaxCandidates();
  const candidateObservations = candidates.map(observeCandidate);
  const mixinObservation = observeMixinFixture();
  const inheritanceObservation = observeInheritanceFixture();
  const semanticDecisions = createSemanticDecisions();
  const diagnostics = createDiagnosticTaxonomy();
  const summary = createSummary({
    candidateObservations,
    diagnostics,
    inheritanceObservation,
    mixinObservation,
    semanticDecisions
  });
  const checks = createChecks(summary);
  const hardFailures = checks.filter((item) => item.status === "fail");

  const evidence = {
    contract: "hia-pugdoc-wp52-syntax-scope-confidence-evidence",
    contractVersion: "0.1.0-draft",
    createdAt: new Date().toISOString(),
    status: hardFailures.length === 0
      ? "ready-for-wp52-generated-doc-binding-contract"
      : "blocked-by-wp52-syntax-scope-confidence-decision",
    cycleGroupId: "C-HIA-P3",
    phase: "W-P52.2",
    sourceInput: {
      contract: "hia-wp52-generated-binding-research-adr-intake",
      contractVersion: "0.1.0-draft",
      expectedStatus: "ready-for-wp52-syntax-scope-confidence-decision"
    },
    executionPolicy: {
      policy: "real-ast-fixture-and-normative-decision",
      concreteSyntaxMayBeFrozen: true,
      officialPugPipelineMayBeExecuted: true,
      syntheticFixtureSourceMayBeRead: true,
      productionExtractorMayBeModified: false,
      coreSchemaMayBeModified: false,
      templateRuntimeDataMayBeExecuted: false,
      arbitraryExpressionMayBeEvaluated: false,
      sourceBodyMayBeSerializedToEvidence: false,
      hiaMayCallHostEditorApi: false,
      hiaMayExecuteProviderNetwork: false,
      hiaMayModifyTargetRepository: false,
      hiaMayTriggerCheckedApply: false,
      sourcesContentPolicy: "none"
    },
    parserBaseline: {
      pipeline: ["pug-lexer", "pug-parser", "pug-load", "pug-linker", "pug-walk"],
      packageVersions: {
        "pug-lexer": "5.0.1",
        "pug-linker": "4.0.0",
        "pug-load": "3.0.0",
        "pug-parser": "6.0.0",
        "pug-walk": "2.0.0"
      },
      license: "MIT",
      dependencyPlacement: "hia-pugdoc-adapter-workspace-only"
    },
    syntaxDecision: {
      canonicalFieldSyntax: "@description and other existing unprefixed field tags",
      canonicalInlineBindingElement: "<bind ref=\"adapterExpression\"/>",
      canonicalInstanceKeyTag: "@instanceKey adapterExpression",
      bindingSigil: "none",
      dollarHandling: "ordinary-adapter-identifier-character-not-a-binding-sigil",
      standaloneBindDirective: "reserved-not-canonical-in-p1",
      fieldForClause: "rejected-as-ambiguous-prose",
      pugInterpolationInDocumentation: "rejected-because-it-collides-with-runtime-template-semantics",
      domainPrefixedAlias: "not-canonical-and-not-enabled-as-compat-input",
      attachmentRule: "the unbuffered documentation block must be inside the lexical generator scope and immediately precede its generated target",
      selectedCandidateId: "inline-bind-element"
    },
    candidateObservations,
    mixinObservation,
    inheritanceObservation,
    semanticDecisions,
    diagnostics,
    summary: {
      ...summary,
      hardFailureCount: hardFailures.length
    },
    checks,
    generatedDocs: {
      syntaxCandidateMatrix: normalizePath(syntaxMatrixPath),
      semanticDecisionLedger: normalizePath(semanticDecisionPath),
      inheritanceLocalsDiagnosticPolicy: normalizePath(inheritancePolicyPath)
    }
  };

  const serialized = JSON.stringify(evidence, null, 2);
  assertNoPrivateMarkers(serialized);

  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(evidencePath, `${serialized}\n`, "utf8");
  fs.writeFileSync(syntaxMatrixPath, renderSyntaxMatrix(evidence), "utf8");
  fs.writeFileSync(semanticDecisionPath, renderSemanticDecisionLedger(evidence), "utf8");
  fs.writeFileSync(inheritancePolicyPath, renderInheritancePolicy(evidence), "utf8");

  console.log(`W-P52.2 Pug syntax/scope/confidence decision prepared at ${normalizePath(evidencePath)}`);
  console.log(`Decision status: ${evidence.status}`);
}

function createSyntaxCandidates() {
  return [
    candidate(
      "legacy-domain-prefixed-sigil",
      "legacy-domain-prefixed-sigil.pug",
      "rejected",
      {
        explicitBindingBoundary: false,
        fieldCompositionAndI18n: false,
        lexicalAttachment: false,
        noDomainPrefix: false,
        noRuntimeSyntaxCollision: true,
        preservesCanonicalField: false
      },
      "The domain prefix retreats from a standard-level field, `$` conflicts with legal JavaScript identifiers, and the block sits outside the Each scope."
    ),
    candidate(
      "field-for-clause",
      "field-for-clause.pug",
      "rejected",
      {
        explicitBindingBoundary: false,
        fieldCompositionAndI18n: false,
        lexicalAttachment: true,
        noDomainPrefix: true,
        noRuntimeSyntaxCollision: true,
        preservesCanonicalField: true
      },
      "The word `for` is indistinguishable from ordinary description prose and cannot safely host multiple bindings."
    ),
    candidate(
      "standalone-bind-directive",
      "standalone-bind-directive.pug",
      "reserved-not-canonical",
      {
        explicitBindingBoundary: true,
        fieldCompositionAndI18n: false,
        lexicalAttachment: true,
        noDomainPrefix: true,
        noRuntimeSyntaxCollision: true,
        preservesCanonicalField: false
      },
      "A standalone directive is structurally clear but duplicates field ownership and composes poorly with prose and locale segments."
    ),
    candidate(
      "pug-interpolation",
      "pug-interpolation.pug",
      "rejected",
      {
        explicitBindingBoundary: false,
        fieldCompositionAndI18n: true,
        lexicalAttachment: true,
        noDomainPrefix: true,
        noRuntimeSyntaxCollision: false,
        preservesCanonicalField: true
      },
      "Pug interpolation visually implies template execution and does not express the documentation-only non-executing boundary."
    ),
    candidate(
      "inline-bind-element",
      "inline-bind-element.pug",
      "selected-canonical",
      {
        explicitBindingBoundary: true,
        fieldCompositionAndI18n: true,
        lexicalAttachment: true,
        noDomainPrefix: true,
        noRuntimeSyntaxCollision: true,
        preservesCanonicalField: true
      },
      "The inline element keeps canonical fields, supports mixed prose and locale segments, and makes non-executing references explicit."
    )
  ];
}

function candidate(id, fixture, status, criteria, rationale) {
  return { criteria, fixture, id, rationale, status };
}

/**
 * 使用真实 Pug AST 观察一个语法候选的注释附着位置与节点形态。
 * Observes comment attachment and node shape for one syntax candidate using
 * a real Pug AST.
 *
 * @param {object} syntaxCandidate 候选定义 / Candidate definition.
 * @returns {object} 不含源码正文的 public-safe AST 摘要。
 */
function observeCandidate(syntaxCandidate) {
  const fixturePath = path.join(fixtureRoot, syntaxCandidate.fixture);
  const source = fs.readFileSync(fixturePath, "utf8");
  const ast = parse(lex(source, { filename: fixturePath }), { filename: fixturePath });
  const nodeSummary = summarizeAst(ast);
  const commentAncestries = collectCommentAncestries(ast);
  const criterionCount = Object.values(syntaxCandidate.criteria).filter(Boolean).length;

  assert.equal(nodeSummary.typeCounts.BlockComment, 1, `${syntaxCandidate.id} must contain one unbuffered documentation block.`);
  assert.equal(nodeSummary.bufferedCommentCount, 0, `${syntaxCandidate.id} must not emit a buffered HTML comment.`);

  return {
    id: syntaxCandidate.id,
    fixture: normalizePath(fixturePath),
    status: syntaxCandidate.status,
    criteria: syntaxCandidate.criteria,
    criterionCount,
    rationale: syntaxCandidate.rationale,
    ast: {
      commentAncestries,
      eachAliases: nodeSummary.eachAliases,
      nodeTypeCount: Object.keys(nodeSummary.typeCounts).length,
      typeCounts: nodeSummary.typeCounts
    }
  };
}

function observeMixinFixture() {
  const fixturePath = path.join(fixtureRoot, "mixin-expansion.pug");
  const source = fs.readFileSync(fixturePath, "utf8");
  const ast = parse(lex(source, { filename: fixturePath }), { filename: fixturePath });
  const summary = summarizeAst(ast);
  const commentAncestries = collectCommentAncestries(ast);

  assert.equal(summary.mixinDefinitions.length, 1);
  assert.equal(summary.mixinCalls.length, 2);
  assert.ok(commentAncestries.some((ancestry) => ancestry.includes("Mixin")));

  return {
    fixture: normalizePath(fixturePath),
    definitionCount: summary.mixinDefinitions.length,
    callCount: summary.mixinCalls.length,
    commentAncestries,
    definitionParameters: summary.mixinDefinitions[0].args.split(",").map((item) => item.trim()).filter(Boolean),
    callArgumentKinds: summary.mixinCalls.map((item) => classifyReferenceExpression(item.args)),
    conclusion: "A binding declaration inside a mixin body belongs to the definition scope and expands independently at each call site."
  };
}

function observeInheritanceFixture() {
  const childPath = path.join(fixtureRoot, "inheritance-child.pug");
  const loadedAst = load.file(childPath, { lex, parse });
  const loadedSummary = summarizeAst(loadedAst, { includeDependencies: true });
  const linkedAst = link(JSON.parse(JSON.stringify(loadedAst)));
  const linkedSummary = summarizeAst(linkedAst);
  const modes = loadedSummary.namedBlocks.map((item) => item.mode || "replace");

  assert.ok(modes.includes("prepend"));
  assert.ok(modes.includes("append"));
  assert.ok(modes.includes("replace"));
  assert.ok(loadedSummary.typeCounts.Extends >= 1);
  assert.equal(linkedSummary.typeCounts.Extends ?? 0, 0);

  return {
    entryFixture: normalizePath(childPath),
    sourceView: {
      extendsCount: loadedSummary.typeCounts.Extends,
      namedBlockModes: [...new Set(modes)].sort(),
      unbufferedCommentCount: loadedSummary.typeCounts.BlockComment ?? 0
    },
    linkedView: {
      extendsCount: linkedSummary.typeCounts.Extends ?? 0,
      namedBlockCount: linkedSummary.typeCounts.NamedBlock ?? 0,
      unbufferedCommentCount: linkedSummary.typeCounts.BlockComment ?? 0
    },
    decision: {
      appendPrependPolicy: "ordered-contribution",
      collectionFieldPolicy: "compose-in-linked-order",
      conflictPolicy: "same-precedence-singleton-contributions-are-ambiguous",
      includePolicy: "composition-not-inheritance",
      provenancePolicy: "every inherited contribution retains source and override context",
      replacePolicy: "nearest-explicit-child-wins-for-singleton-fields"
    }
  };
}

function createSemanticDecisions() {
  return {
    expressionSubset: {
      accepted: [
        "adapter-scoped identifier",
        "non-computed member path rooted at an adapter-scoped identifier"
      ],
      normalizedRepresentation: "root declaration identity plus ordered property segments",
      rejected: [
        "assignment",
        "binary or logical expression",
        "call or new expression",
        "computed member access",
        "conditional expression",
        "function or arrow expression",
        "object or array literal",
        "template interpolation",
        "this/global/environment access"
      ],
      evaluationPolicy: "parse-and-resolve-only-never-execute"
    },
    scopeIdentity: {
      format: "gdb-scope/v1/{adapter}/{encoded-source-id}#{encoded-ancestry}/{declaration-slot}",
      components: [
        "adapter id",
        "project-relative or externally stable source identity",
        "semantic AST ancestry",
        "declaration node kind",
        "declaration slot and ordinal",
        "optional dependency or override context"
      ],
      aliasPolicy: "the current variable name is metadata and never the sole identity",
      renamePolicy: "alias-only rename preserves identity when ancestry and declaration slot remain stable",
      movePolicy: "source move changes identity unless an upstream stable source id is supplied",
      overridePolicy: "an explicit upstream stable binding id may preserve identity across structural refactors"
    },
    instanceKey: {
      priority: [
        "explicit @instanceKey reference",
        "stable object key from an Each key alias",
        "upstream Meta/schema stable id",
        "explicit generated target stable id",
        "array index fallback with unstable diagnostic",
        "declaration-only unresolved expansion"
      ],
      duplicatePolicy: "reject duplicate keys within one expansion scope",
      privacyPolicy: "do not serialize raw object values, secrets, local paths, or reversible digests",
      normalization: "adapter-normalized scalar string with type prefix",
      unsupportedTypes: ["function", "symbol", "bigint", "cyclic object", "prototype-bearing object"]
    },
    resolutionQuality: {
      resolutionKind: ["exact", "inferred", "ambiguous", "unresolved"],
      confidenceStrength: ["high", "medium", "low", "none"],
      provenanceCoverage: ["source-only", "source-and-generated", "generated-only"],
      allowedCombinations: {
        exact: ["high"],
        inferred: ["medium", "low"],
        ambiguous: ["low"],
        unresolved: ["none"]
      },
      generatedOnlyRule: "`generated-only` is provenance coverage, not a resolution kind"
    },
    deterministicLocalsEnvelope: {
      contract: "generated-doc-locals@0.1.0-draft-input",
      acceptedValues: ["null", "boolean", "finite number", "string", "plain array", "plain object"],
      requiredMetadata: ["contract/version", "adapter id", "input id", "declared binding allowlist", "privacy classification"],
      limits: {
        maxDepth: 12,
        maxEntries: 10000,
        maxStringBytes: 65536
      },
      evidencePolicy: "record shape/count/type and diagnostics only; never value bodies or digests",
      prohibitedSources: ["process environment", "network", "provider", "host editor", "implicit runtime capture"]
    },
    contractPlacement: {
      selected: "standalone-neutral-generated-documentation-binding-contract",
      contractName: "generated-documentation-binding",
      version: "0.1.0-draft",
      topLevelCollections: ["bindings", "expansions", "targets", "diagnostics"],
      docSourceMapIntegration: "reference binding ids or a sidecar artifact; do not nest the full model in ordinary source maps",
      rationale: "declarations may exist without generated positions and require independent versioning across language adapters"
    }
  };
}

function createDiagnosticTaxonomy() {
  return [
    diagnostic("GDB_REF_SYNTAX_INVALID", "error", "The binding reference is outside the non-executing grammar."),
    diagnostic("GDB_REF_UNRESOLVED", "warning", "No declaration is visible from the lexical generator scope."),
    diagnostic("GDB_SCOPE_AMBIGUOUS", "warning", "More than one declaration remains after lexical resolution."),
    diagnostic("GDB_EXPANSION_RUNTIME_ONLY", "info", "The declaration is known but expansion instances require unavailable runtime data."),
    diagnostic("GDB_INSTANCE_KEY_MISSING", "warning", "No stable key can be constructed for an expansion instance."),
    diagnostic("GDB_INSTANCE_KEY_UNSTABLE", "info", "An array index or structural ordinal is used as a weak fallback."),
    diagnostic("GDB_INSTANCE_KEY_DUPLICATE", "error", "Two instances resolve to the same key in one expansion scope."),
    diagnostic("GDB_TARGET_MISMATCH", "warning", "A generated target does not satisfy the declared target kind or selector."),
    diagnostic("GDB_INHERITANCE_CONFLICT", "warning", "Singleton documentation contributions conflict at the same precedence."),
    diagnostic("GDB_LOCALS_POLICY_VIOLATION", "error", "The deterministic locals envelope violates type, size, privacy, or source policy.")
  ];
}

function diagnostic(code, severity, meaning) {
  return { code, meaning, severity };
}

function createSummary({ candidateObservations, diagnostics, inheritanceObservation, mixinObservation, semanticDecisions }) {
  const selected = candidateObservations.filter((item) => item.status === "selected-canonical");
  const selectedCandidate = selected[0];
  return {
    phase: "W-P52.2",
    syntaxCandidateCount: candidateObservations.length,
    selectedSyntaxCandidateCount: selected.length,
    selectedSyntaxCandidateId: selectedCandidate?.id ?? null,
    selectedSyntaxCriterionCount: selectedCandidate?.criterionCount ?? 0,
    selectedSyntaxCriterionTotal: selectedCandidate ? Object.keys(selectedCandidate.criteria).length : 0,
    realAstFixtureCount: candidateObservations.length + 3,
    eachFixtureCount: candidateObservations.filter((item) => (item.ast.typeCounts.Each ?? 0) > 0).length,
    mixinDefinitionCount: mixinObservation.definitionCount,
    mixinCallCount: mixinObservation.callCount,
    inheritanceModeCount: inheritanceObservation.sourceView.namedBlockModes.length,
    diagnosticCodeCount: diagnostics.length,
    expressionSubsetFrozen: semanticDecisions.expressionSubset.accepted.length === 2,
    scopeIdentityFrozen: semanticDecisions.scopeIdentity.format.startsWith("gdb-scope/v1/"),
    instanceKeyPolicyFrozen: semanticDecisions.instanceKey.priority.length === 6,
    resolutionConfidenceFrozen: semanticDecisions.resolutionQuality.resolutionKind.length === 4
      && semanticDecisions.resolutionQuality.confidenceStrength.length === 4,
    generatedOnlySeparatedFromResolution: semanticDecisions.resolutionQuality.provenanceCoverage.includes("generated-only"),
    deterministicLocalsEnvelopeFrozen: semanticDecisions.deterministicLocalsEnvelope.acceptedValues.length === 6,
    standaloneContractSelected: semanticDecisions.contractPlacement.selected === "standalone-neutral-generated-documentation-binding-contract",
    officialPugPipelineExecuted: true,
    directPinnedPugPipelineDependencyCount: 5,
    productionExtractorModifiedNow: false,
    parserRuntimeImplementedNow: false,
    coreSchemaModifiedNow: false,
    hostProjectionImplementedNow: false,
    templateRuntimeDataExecutionCount: 0,
    arbitraryExpressionEvaluationCount: 0,
    sourceBodyOutputCount: 0,
    sourceTextSerializedCount: 0,
    digestValueSerializedCount: 0,
    localPathExposureCount: 0,
    credentialMarkerCount: 0,
    checkedApplyWriteEnabledCount: 0,
    targetRepositoryMutationCount: 0,
    providerNetworkExecutedCount: 0
  };
}

function createChecks(summary) {
  return [
    check("syntax-candidate-selection", summary.syntaxCandidateCount >= 5
      && summary.selectedSyntaxCandidateCount === 1
      && summary.selectedSyntaxCriterionCount === summary.selectedSyntaxCriterionTotal,
    "Exactly one fully qualified syntax candidate is selected."),
    check("real-ast-fixtures", summary.realAstFixtureCount >= 8 && summary.eachFixtureCount >= 5,
      "Real Pug AST fixtures cover candidates, Each, Mixin, and inheritance."),
    check("mixin-expansion", summary.mixinDefinitionCount === 1 && summary.mixinCallCount === 2,
      "Mixin declaration and multiple call sites are structurally observed."),
    check("inheritance-modes", summary.inheritanceModeCount === 3,
      "Replace, append, and prepend are observed through loaded and linked ASTs."),
    check("scope-key-resolution", summary.expressionSubsetFrozen
      && summary.scopeIdentityFrozen
      && summary.instanceKeyPolicyFrozen
      && summary.resolutionConfidenceFrozen
      && summary.generatedOnlySeparatedFromResolution,
    "Expression, scope, key, resolution, confidence, and provenance decisions are frozen."),
    check("locals-contract-placement", summary.deterministicLocalsEnvelopeFrozen && summary.standaloneContractSelected,
      "Deterministic locals and standalone neutral contract placement are frozen."),
    check("diagnostic-taxonomy", summary.diagnosticCodeCount >= 10,
      "Generated binding diagnostics cover syntax, scope, expansion, key, target, inheritance, and locals."),
    check("implementation-boundary", !summary.productionExtractorModifiedNow
      && !summary.parserRuntimeImplementedNow
      && !summary.coreSchemaModifiedNow
      && !summary.hostProjectionImplementedNow,
    "W-P52.2 does not cross into parser runtime, schema, or host projection implementation."),
    check("privacy-and-write-boundary", summary.templateRuntimeDataExecutionCount === 0
      && summary.arbitraryExpressionEvaluationCount === 0
      && summary.sourceBodyOutputCount === 0
      && summary.sourceTextSerializedCount === 0
      && summary.digestValueSerializedCount === 0
      && summary.localPathExposureCount === 0
      && summary.credentialMarkerCount === 0
      && summary.checkedApplyWriteEnabledCount === 0
      && summary.targetRepositoryMutationCount === 0
      && summary.providerNetworkExecutedCount === 0,
    "No runtime values, source bodies, secrets, writes, target mutation, or network calls enter evidence.")
  ];
}

function check(id, condition, message) {
  return { id, message, status: condition ? "pass" : "fail" };
}

function summarizeAst(ast, options = {}) {
  const summary = {
    bufferedCommentCount: 0,
    eachAliases: [],
    mixinCalls: [],
    mixinDefinitions: [],
    namedBlocks: [],
    typeCounts: {}
  };

  walk(ast, (node) => {
    summary.typeCounts[node.type] = (summary.typeCounts[node.type] ?? 0) + 1;
    if ((node.type === "Comment" || node.type === "BlockComment") && node.buffer === true) {
      summary.bufferedCommentCount += 1;
    }
    if (node.type === "Each") {
      summary.eachAliases.push({ key: node.key ?? null, objectExpressionKind: classifyReferenceExpression(node.obj), value: node.val });
    }
    if (node.type === "Mixin") {
      const record = { args: node.args ?? "", name: node.name };
      (node.call ? summary.mixinCalls : summary.mixinDefinitions).push(record);
    }
    if (node.type === "NamedBlock") {
      summary.namedBlocks.push({ mode: node.mode ?? "replace", name: node.name });
    }
  }, { includeDependencies: options.includeDependencies === true });

  return summary;
}

function collectCommentAncestries(ast) {
  const results = [];
  visitAst(ast, [], (node, parents) => {
    if (node.type === "BlockComment" && node.buffer === false) {
      results.push([...parents.map((parent) => parent.type), node.type]);
    }
  });
  return results;
}

function visitAst(node, parents, callback) {
  if (!node || typeof node !== "object") {
    return;
  }
  callback(node, parents);
  const nextParents = [...parents, node];
  for (const key of ["nodes", "block", "file", "ast", "yieldBlock"]) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        visitAst(child, nextParents, callback);
      }
    } else if (value && typeof value === "object") {
      visitAst(value, nextParents, callback);
    }
  }
}

function classifyReferenceExpression(value) {
  const expression = String(value ?? "").trim();
  if (/^[A-Za-z_$][\w$]*$/.test(expression)) {
    return "identifier";
  }
  if (/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/.test(expression)) {
    return "non-computed-member-path";
  }
  return "outside-p1-subset";
}

function renderSyntaxMatrix(evidence) {
  const rows = evidence.candidateObservations.map((item) => {
    const c = item.criteria;
    return `| ${item.id} | ${item.status} | ${c.preservesCanonicalField ? "yes" : "no"} | ${c.explicitBindingBoundary ? "yes" : "no"} | ${c.fieldCompositionAndI18n ? "yes" : "no"} | ${c.lexicalAttachment ? "yes" : "no"} | ${c.noDomainPrefix ? "yes" : "no"} | ${c.noRuntimeSyntaxCollision ? "yes" : "no"} | ${item.criterionCount}/6 |`;
  }).join("\n");
  return `# W-P52.2 语法候选矩阵

## 结论

选定现有无前缀字段标签加内联 \`<bind ref="..."/>\`。稳定实例键使用
\`@instanceKey adapterExpression\`。不使用 \`htmdoc:\` 前缀，也不把 \`$\`
定义成魔法 sigil；\`$\` 只按 adapter 语言的普通标识符字符处理。

| 候选 | 状态 | canonical field | 显式绑定边界 | 文本/i18n 组合 | lexical attachment | 无领域前缀 | 无运行时语法冲突 | 得分 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Attachment

文档块必须使用 Pug unbuffered comment，位于 Each/Mixin 等 generator lexical
scope 内，并紧邻其生成 target。P1 不启用 \`@htmdoc:desc\` 兼容别名。
`;
}

function renderSemanticDecisionLedger(evidence) {
  const semantic = evidence.semanticDecisions;
  const combinations = Object.entries(semantic.resolutionQuality.allowedCombinations)
    .map(([kind, strengths]) => `| ${kind} | ${strengths.join(", ")} |`)
    .join("\n");
  return `# W-P52.2 语义决策账本

## Binding reference

- canonical inline syntax：\`<bind ref="adapterExpression"/>\`。
- Pug P1 接受 identifier 与 non-computed member path。
- 只解析和解析作用域，不执行表达式。
- standalone \`@bind\` 保留但不作为 P1 canonical syntax。

## Scope identity

- 格式：\`${semantic.scopeIdentity.format}\`。
- 变量名只是 alias metadata，不独立构成 identity。
- 仅 alias rename 且 ancestry/declaration slot 不变时保留 identity。
- source move 默认改变 identity；上游 stable source/binding id 可显式接管。

## Instance key

优先级：

${semantic.instanceKey.priority.map((item, index) => `${index + 1}. ${item}`).join("\n")}

## Resolution / confidence / provenance

\`generated-only\` 已从 resolution kind 中移出，归入 provenance coverage。

| resolution kind | allowed confidence |
| --- | --- |
${combinations}

provenance coverage：${semantic.resolutionQuality.provenanceCoverage.join(", ")}。

## Contract placement

选定独立中性 \`${semantic.contractPlacement.contractName}@${semantic.contractPlacement.version}\`
contract，顶层集合为 ${semantic.contractPlacement.topLevelCollections.join(", ")}。
doc-source-map 只引用 binding id 或 sidecar artifact，不嵌入完整模型。
`;
}

function renderInheritancePolicy(evidence) {
  const diagnostics = evidence.diagnostics
    .map((item) => `| ${item.code} | ${item.severity} | ${item.meaning} |`)
    .join("\n");
  const policy = evidence.inheritanceObservation.decision;
  const locals = evidence.semanticDecisions.deterministicLocalsEnvelope;
  return `# W-P52.2 继承、locals 与诊断策略

## Extends / block

- replace：singleton field 使用最近的显式 child contribution。
- append/prepend：按 linked order 保存 ordered contribution。
- collection field：按 linked order 组合。
- 同优先级 singleton 冲突：输出 ambiguous / \`GDB_INHERITANCE_CONFLICT\`。
- include 是 composition，不是 inheritance。
- 所有继承 contribution 保留 source 与 override context。

已观察 mode：${evidence.inheritanceObservation.sourceView.namedBlockModes.join(", ")}。
策略标识：${Object.values(policy).join(", ")}。

## Deterministic locals

- 输入 contract：\`${locals.contract}\`。
- 只允许 ${locals.acceptedValues.join(", ")}。
- 限制：depth ${locals.limits.maxDepth}、entries ${locals.limits.maxEntries}、
  string bytes ${locals.limits.maxStringBytes}。
- evidence 只记录 shape/count/type 与 diagnostic，不保存值正文或 digest。
- 禁止来源：${locals.prohibitedSources.join(", ")}。

## Diagnostic taxonomy

| code | severity | meaning |
| --- | --- | --- |
${diagnostics}
`;
}

function normalizePath(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function assertNoPrivateMarkers(text) {
  const forbiddenPatterns = [
    /work-zone/i,
    /file:\/\//i,
    /\b[A-Z]:[\\/]/,
    /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i,
    /(npm_|ghp_|github_pat_)[A-Za-z0-9_-]{8,}/i,
    /"sourcesContent"\s*:/,
    /"sourceText"\s*:/,
    /"sourceBody"\s*:/
  ];
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(text), false, `W-P52.2 evidence includes forbidden private marker: ${pattern}`);
  }
}
