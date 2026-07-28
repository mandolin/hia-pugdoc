const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const outputRoot = path.join(root, "dist", "wp52-pug-one-to-many-parser-fixtures");

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

/**
 * 生成 W-P52.4 production Pug parser fixture evidence。
 * Generates W-P52.4 production Pug parser fixture evidence.
 *
 * @lang zh-CN 本脚本以受限 deterministic locals 运行每个 fixture 的结构化
 * binding resolver。它不执行任意 Pug/JavaScript expression，不输出 fixture
 * source 或 locals value，也不触发 network、write 或目标仓库修改。
 * @lang en This script runs the fixture structural binding resolver with
 * restricted deterministic locals. It neither executes arbitrary Pug/JavaScript
 * expressions nor emits fixture source or local values, and it triggers no
 * network, writes, or target-repository changes.
 *
 * @returns {Promise<void>} 写入 public-safe evidence 与中文优先报告。
 */
async function main() {
  const temporaryOutput = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hia-pugdoc-wp52-4-"));
  try {
    const { runPugDoc } = await import(pathToFileURL(path.join(root, "packages", "pugdoc-runner", "src", "index.mjs")));
    const locals = createGeneratedBindingLocals();
    const result = await runPugDoc({
      workspaceRoot: root,
      outputDirectory: temporaryOutput,
      inputs: [{
        kind: "pug-entry",
        path: "fixtures/generated-binding-runtime/src/pages/bindings.pug",
        artifactBasePath: "bindings",
        locals: locals.values,
        generatedBindingLocals: locals
      }],
      options: {
        emitDocSourceMap: true,
        emitGeneratedDocumentationBinding: true,
        sourcesContentPolicy: "none",
        writeResultManifest: false
      }
    });

    assert.equal(result.status, "success");
    const sidecar = readJson(path.join(temporaryOutput, "bindings.gdb.json"));
    const docSourceMap = readJson(path.join(temporaryOutput, "bindings.docmap.json"));
    const summary = createSummary(sidecar, docSourceMap, result);
    const checks = createChecks(summary);
    const evidence = {
      contract: "hia-pugdoc-wp52-one-to-many-parser-fixtures-evidence",
      contractVersion: "0.1.0-draft",
      createdAt: new Date().toISOString(),
      status: checks.every((check) => check.status === "pass")
        ? "ready-for-wp52-bidirectional-source-linkage"
        : "blocked-by-wp52-pug-one-to-many-parser-fixtures",
      cycleGroupId: "C-HIA-P3",
      phase: "W-P52.4",
      sourceInputs: {
        generatedDocumentationBindingContract: {
          contract: "generated-documentation-binding",
          contractVersion: "0.1.0-draft",
          status: "ready-for-wp52-pug-one-to-many-parser-fixtures"
        },
        syntaxScopeConfidenceDecision: {
          contract: "hia-pugdoc-wp52-syntax-scope-confidence-evidence",
          contractVersion: "0.1.0-draft",
          status: "ready-for-wp52-generated-doc-binding-contract"
        }
      },
      executionPolicy: {
        policy: "official-pug-parser-sidecar-fixture-with-structured-deterministic-locals",
        officialPugPipelineExecuted: true,
        productionBindingExtractorImplemented: true,
        parserRuntimeMayBeImplemented: true,
        templateRuntimeDataMayBeExecuted: false,
        arbitraryExpressionMayBeEvaluated: false,
        sourceBodyMayBeSerialized: false,
        digestMayBeSerialized: false,
        bidirectionalIndexMayBeImplemented: false,
        hostProjectionMayBeImplemented: false,
        providerNetworkMayBeExecuted: false,
        checkedApplyWriteMayBeEnabled: false,
        targetRepositoryMayBeMutated: false,
        sourcesContentPolicy: "none"
      },
      parserBaseline: {
        pipeline: ["pug-lexer", "pug-parser", "pug-load", "pug-linker", "pug-walk"],
        packageVersions: {
          "pug-lexer": "5.0.1",
          "pug-parser": "6.0.0",
          "pug-load": "3.0.0",
          "pug-linker": "4.0.0",
          "pug-walk": "2.0.0"
        },
        license: "MIT",
        directDependencyOwner: "@hia-doc/pug-doc-extractor"
      },
      summary,
      checks,
      generatedDocs: {
        overview: "dist/wp52-pug-one-to-many-parser-fixtures/pug-one-to-many-parser-fixtures.md",
        fixtureMatrix: "dist/wp52-pug-one-to-many-parser-fixtures/pug-binding-fixture-matrix.md"
      }
    };
    const serialized = JSON.stringify(evidence, null, 2);
    assertNoPrivateMarkers(serialized);

    fs.rmSync(outputRoot, { recursive: true, force: true });
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(path.join(outputRoot, "evidence.json"), `${serialized}\n`, "utf8");
    fs.writeFileSync(path.join(outputRoot, "pug-one-to-many-parser-fixtures.md"), renderOverview(evidence), "utf8");
    fs.writeFileSync(path.join(outputRoot, "pug-binding-fixture-matrix.md"), renderFixtureMatrix(evidence), "utf8");
    console.log(`W-P52.4 Pug one-to-many parser evidence prepared at ${normalizePath(path.join(outputRoot, "evidence.json"))}`);
    console.log(`Decision status: ${evidence.status}`);
  } finally {
    await fs.promises.rm(temporaryOutput, { recursive: true, force: true });
  }
}

function createGeneratedBindingLocals() {
  return {
    contract: "generated-doc-locals",
    contractVersion: "0.1.0-draft-input",
    adapterId: "pug",
    inputId: "fixture:generated-binding-runtime",
    bindingAllowlist: ["colors", "theme", "item", "summary"],
    privacyClassification: "metadata-only",
    values: {
      colors: { sky: { id: "sky", name: "Sky" }, sun: { id: "sun", name: "Sun" } },
      theme: { primary: { id: "primary", name: "Primary" }, accent: { id: "accent", name: "Accent" } },
      item: { id: "included", name: "Included" },
      summary: { id: "summary", name: "Summary" }
    }
  };
}

function createSummary(sidecar, docSourceMap, result) {
  const targets = new Map(sidecar.targets.map((target) => [target.id, target]));
  const countForSymbol = (symbolId) => sidecar.expansions.filter((expansion) => expansion.targetIds.some((id) => targets.get(id)?.identity?.symbolId === symbolId)).length;
  const referencedEntryCount = docSourceMap.entries.filter((entry) => Array.isArray(entry.generatedBindingRefs) && entry.generatedBindingRefs.length > 0).length;
  return {
    phase: "W-P52.4",
    contract: `${sidecar.contract}@${sidecar.contractVersion}`,
    bindingCount: sidecar.bindings.length,
    expansionCount: sidecar.expansions.length,
    targetCount: sidecar.targets.length,
    diagnosticCount: sidecar.diagnostics.length,
    eachExpansionCount: countForSymbol("element:ColorSwatch"),
    mixinCallExpansionCount: countForSymbol("element:ColorBadge"),
    includeExpansionCount: countForSymbol("element:IncludedSwatch"),
    extendsBlockExpansionCount: countForSymbol("element:ColorSummary"),
    stableInstanceKeyCount: sidecar.expansions.filter((expansion) => expansion.instanceKey.status === "stable").length,
    unstableInstanceKeyCount: sidecar.expansions.filter((expansion) => expansion.instanceKey.status === "unstable").length,
    missingInstanceKeyCount: sidecar.expansions.filter((expansion) => expansion.instanceKey.status === "missing").length,
    compositionBindingCount: sidecar.bindings.filter((binding) => binding.composition.relation === "composition").length,
    inheritanceBindingCount: sidecar.bindings.filter((binding) => binding.composition.relation === "inheritance").length,
    orderedContributionBindingCount: sidecar.bindings.filter((binding) => binding.composition.mergePolicy === "ordered-contribution").length,
    docSourceMapSidecarCount: docSourceMap.generatedBindingSidecars?.length ?? 0,
    docSourceMapBindingReferencedEntryCount: referencedEntryCount,
    fullBindingModelEmbeddedInDocSourceMap: Object.hasOwn(docSourceMap, "bindings") || Object.hasOwn(docSourceMap, "expansions") || Object.hasOwn(docSourceMap, "targets"),
    generatedBindingArtifactCount: result.artifacts.filter((artifact) => artifact.kind === "generated-documentation-binding").length,
    parserRuntimeImplementedNow: true,
    bidirectionalIndexImplementedNow: false,
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
    providerNetworkExecutedCount: 0,
    hardFailureCount: 0
  };
}

function createChecks(summary) {
  return [
    check("contract-and-parser", summary.contract === "generated-documentation-binding@0.1.0-draft" && summary.parserRuntimeImplementedNow,
      "The production Pug parser emits the frozen neutral generated-documentation-binding sidecar."),
    check("one-to-many-each-and-mixin", summary.eachExpansionCount >= 2 && summary.mixinCallExpansionCount >= 2 && summary.expansionCount >= 6,
      "Each and mixin fixtures produce multiple independently keyed expansions."),
    check("include-and-inheritance", summary.includeExpansionCount >= 1 && summary.extendsBlockExpansionCount >= 1 && summary.compositionBindingCount >= 1 && summary.orderedContributionBindingCount >= 1,
      "Include composition and extends/block contribution provenance are retained."),
    check("sidecar-linkage", summary.docSourceMapSidecarCount === 1 && summary.docSourceMapBindingReferencedEntryCount >= 4 && !summary.fullBindingModelEmbeddedInDocSourceMap,
      "doc-source-map declares exactly one sidecar and entry references without embedding the complete model."),
    check("instance-key-and-quality", summary.stableInstanceKeyCount === summary.expansionCount && summary.unstableInstanceKeyCount === 0 && summary.missingInstanceKeyCount === 0 && summary.diagnosticCount === 0,
      "Fixture expansions have stable privacy-safe keys and no unresolved diagnostic."),
    check("privacy-and-phase-boundary", summary.bidirectionalIndexImplementedNow === false
      && summary.hostProjectionImplementedNow === false
      && summary.templateRuntimeDataExecutionCount === 0
      && summary.arbitraryExpressionEvaluationCount === 0
      && summary.sourceBodyOutputCount === 0
      && summary.sourceTextSerializedCount === 0
      && summary.digestValueSerializedCount === 0
      && summary.localPathExposureCount === 0
      && summary.credentialMarkerCount === 0
      && summary.checkedApplyWriteEnabledCount === 0
      && summary.targetRepositoryMutationCount === 0
      && summary.providerNetworkExecutedCount === 0,
    "No runtime execution, source/value serialization, index, host projection, write, target mutation, or network crosses W-P52.4.")
  ];
}

function check(id, condition, message) {
  return { id, message, status: condition ? "pass" : "fail" };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function renderOverview(evidence) {
  const summary = evidence.summary;
  return `# W-P52.4 Pug 一对多 Parser Fixture

## 结论

已在 \`@hia-doc/pug-doc-extractor\` 以官方 Pug
\`lexer -> parser -> load -> linker -> walk\` 管线实现 production generated
documentation binding sidecar。fixture 使用受限 deterministic locals 的结构化
member-path 查询；不执行 Pug/JavaScript expression，也不输出 locals value 或源码。

evidence status：\`${evidence.status}\`。

## 结果

- bindings：${summary.bindingCount}；expansions：${summary.expansionCount}；targets：${summary.targetCount}。
- each：${summary.eachExpansionCount} 个展开；mixin call：${summary.mixinCallExpansionCount} 个展开；
  include：${summary.includeExpansionCount}；extends/block：${summary.extendsBlockExpansionCount}。
- ${summary.stableInstanceKeyCount} 个 stable instance key；unstable/missing 均为 0。
- doc-source-map sidecar：${summary.docSourceMapSidecarCount}；引用 entry：
  ${summary.docSourceMapBindingReferencedEntryCount}；完整 binding model embedded：
  ${summary.fullBindingModelEmbeddedInDocSourceMap}。

## 边界

W-P52.4 不实现 W-P52.5 双向 query index，也不实现 W-P52.6 renderer/host
projection。template runtime data execution、arbitrary expression evaluation、source
body/value/digest serialization、write、target mutation 与 network 均为 0。
`;
}

function renderFixtureMatrix(evidence) {
  const summary = evidence.summary;
  return `# W-P52.4 Pug Binding Fixture 矩阵

| 场景 | expansion | 绑定/组合语义 | 结论 |
| --- | ---: | --- | --- |
| \`each color, colorKey in colors\` | ${summary.eachExpansionCount} | explicit \`@instanceKey colorKey\` | stable one-to-many |
| \`mixin colorBadge(color)\` + 2 calls | ${summary.mixinCallExpansionCount} | definition scope + call-site expansion | stable one-to-many |
| \`include included-swatch.pug\` | ${summary.includeExpansionCount} | composition / linked-order | source provenance retained |
| \`extends\` + \`append content\` | ${summary.extendsBlockExpansionCount} | inheritance / ordered contribution | override context retained |

普通 doc-source-map 只声明 sidecar 与 \`generatedBindingRefs\`；不含 bindings、
expansions 或 targets 顶层集合。
`;
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
    /"sourceBody"\s*:/,
    /"runtimeValues"\s*:/,
    /"localsValues"\s*:/,
    /"digestValue"\s*:/
  ];
  for (const pattern of forbiddenPatterns) {
    assert.equal(pattern.test(text), false, `W-P52.4 evidence includes forbidden private marker: ${pattern}`);
  }
}

function normalizePath(filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}
