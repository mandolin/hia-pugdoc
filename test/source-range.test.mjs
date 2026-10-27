/**
 * @file
 * @lang zh-CN 以真实 Pug 提取入口验证映射和绑定源码范围的列单位与终点，不替旧版工件声明新版契约。
 * @lang en Probes mapping and binding source ranges through real Pug extraction without assigning a new contract to legacy artifacts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { extractPugDoc, extractPugGeneratedDocumentationBinding } from "../packages/pug-doc-extractor/src/index.mjs";
import { createPugHtmlDocSourceMap } from "../packages/pug-to-html-doc-source-map/src/index.mjs";
import { runPugDoc } from "../packages/pugdoc-runner/src/index.mjs";

test("CRLF and non-BMP Pug symbols distinguish annotation and target-line fallback", () => {
  // <lang><zh-CN>同一真实提取工件同时给出注释块与目标行，供映射的两个分支对照。</zh-CN><en>The same real extraction exposes a comment block and its target line for both mapping branches.</en></lang>
  const source = '//-\r\n  @component Card 🔥\r\narticle(data-component="Card🔥")\r\n';
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const artifact = extractPugDoc(source, { path: "src/card.pug" });
  const symbol = artifact.symbols[0];
  assert.ok(symbol);
  assert.equal(symbol.annotation.range.end.line, 2);
  assert.equal(symbol.annotation.range.end.column, lines[1].length + 1);
  assert.notEqual(symbol.annotation.range.end.column, [...lines[1]].length + 1);
  assert.equal(symbol.source.range.end.line, 3);
  assert.equal(symbol.source.range.end.column, lines[2].length + 1);
  assert.notEqual(symbol.source.range.end.column, [...lines[2]].length + 1);

  // <lang><zh-CN>正常写入优先使用注释范围；显式移除注释仅探测兼容回退，不能据此宣称真实提取会产生无注释符号。</zh-CN><en>Normal writing prefers the comment range; removing it only probes the compatibility fallback, not a naturally annotation-free symbol.</en></lang>
  const normal = createPugHtmlDocSourceMap({ pugArtifact: artifact });
  assert.equal(normal.contractVersion, "1.1.0");
  assert.deepEqual(normal.entries[0].sourceRefs[0].range, symbol.annotation.range);
  assert.deepEqual(normal.entries[0].sourceRefs[0].rangeConvention, {
    endBoundary: "exclusive", columnUnit: "utf16-code-unit"
  });
  const fallbackArtifact = structuredClone(artifact);
  delete fallbackArtifact.symbols[0].annotation;
  const fallback = createPugHtmlDocSourceMap({ pugArtifact: fallbackArtifact });
  assert.deepEqual(fallback.entries[0].sourceRefs[0].range, symbol.source.range);
  assert.deepEqual(fallback.entries[0].sourceRefs[0].rangeConvention, {
    endBoundary: "unknown", columnUnit: "unknown"
  });
  assert.ok(artifact.symbols[0].annotation);
});

test("CRLF and non-BMP relation rows use UTF-16 columns and an exclusive line end", () => {
  // <lang><zh-CN>include、block 与 mixin-call 各走关系生成分支，行尾位置应在最后 UTF-16 单元之后。</zh-CN><en>Include, block and mixin-call traverse relation branches whose ends follow the final UTF-16 unit.</en></lang>
  const source = "include ./part🔥.pug\r\nblock content\r\n  +badge(item)\r\n";
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  const artifact = extractPugDoc(source, { path: "src/page.pug" });
  const map = createPugHtmlDocSourceMap({ pugArtifact: artifact });
  assert.deepEqual(artifact.relations.map((relation) => relation.kind), ["include", "block", "mixin-call"]);
  for (const [index, relation] of artifact.relations.entries()) {
    const range = relation.source.range;
    const line = lines[index];
    assert.equal(range.start.line, index + 1);
    assert.equal(range.end.line, index + 1);
    assert.equal(range.end.column, line.length + 1);
    assert.equal(line.slice(range.start.column - 1, range.end.column - 1), line.trimStart());
    assert.deepEqual(map.entries[index].sourceRefs[0].range, range);
    assert.deepEqual(map.entries[index].sourceRefs[0].rangeConvention, {
      endBoundary: "exclusive", columnUnit: "utf16-code-unit"
    });
  }
  assert.notEqual(artifact.relations[0].source.range.end.column, [...lines[0]].length + 1);
});

test("unproven extends relation keeps its source convention unknown", () => {
  // <lang><zh-CN>extends 尚未覆盖完整解析分支，只保留来源线索，不让它参加精确位置查询。</zh-CN><en>The complete extends parser branch remains unproven, so preserve its source hint without admitting it to exact position queries.</en></lang>
  const artifact = extractPugDoc("extends ./base.pug\n", { path: "src/page.pug" });
  const map = createPugHtmlDocSourceMap({ pugArtifact: artifact });
  const relation = map.entries.find((entry) => entry.relationKind === "extends");
  assert.deepEqual(relation.sourceRefs[0].rangeConvention, {
    endBoundary: "unknown", columnUnit: "unknown"
  });
});

test("binding source intent and composition contribution retain the same CRLF/non-BMP source span", async () => {
  // <lang><zh-CN>隔离临时目录只用于 Pug 官方 load/parser 的文件入口，finally 总会清理。</zh-CN><en>An isolated temporary directory serves the Pug load/parser file entry point and is always removed.</en></lang>
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hia-pug-range-"));
  const source = 'extends base.pug\r\nappend content\r\n  //-\r\n    @element Fire\r\n    @description 🔥 <bind ref="item.name"/>.\r\n  article= item.name\r\n';
  try {
    await fs.writeFile(path.join(workspaceRoot, "base.pug"), "block content\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "page.pug"), source, "utf8");
    const sidecar = extractPugGeneratedDocumentationBinding({
      workspaceRoot,
      entryPath: "page.pug",
      sidecarPath: "page.gdb.json"
    });
    assert.equal(sidecar.contractVersion, "0.3.0-draft");
    assert.equal(sidecar.docSourceMapLinkage.contractVersion, "1.1.0");
    assert.equal(sidecar.bindings.length, 1);
    const binding = sidecar.bindings[0];
    const sourceRef = binding.sourceIntent.sourceRef;
    const range = sourceRef.range;
    const finalLine = source.replaceAll("\r\n", "\n").split("\n")[4];
    assert.equal(sourceRef.sourceId, "source:pug:page.pug");
    assert.deepEqual(range.start, { line: 3, column: 3 });
    assert.equal(range.end.line, 5);
    assert.equal(range.end.column, finalLine.length + 1);
    assert.notEqual(range.end.column, [...finalLine].length + 1);
    assert.deepEqual(sourceRef.rangeConvention, {
      endBoundary: "exclusive", columnUnit: "utf16-code-unit"
    });
    assert.equal(binding.composition.relation, "inheritance");
    assert.equal(binding.composition.contributions.length, 1);
    assert.deepEqual(binding.composition.contributions[0].sourceRef, sourceRef);
    // <lang><zh-CN>两处引用分别承载版本化约定；修改一个内存引用不得隐式改变另一处。</zh-CN><en>Each reference owns its versioned convention; mutating one in memory must not silently alter the other.</en></lang>
    assert.notStrictEqual(binding.composition.contributions[0].sourceRef, sourceRef);
    assert.notStrictEqual(binding.composition.contributions[0].sourceRef.range, sourceRef.range);
    assert.notStrictEqual(binding.composition.contributions[0].sourceRef.rangeConvention, sourceRef.rangeConvention);
  } finally {
    // <lang><zh-CN>旧回归也须先核临时目录的真实路径，避免递归删除越过本测试边界。</zh-CN><en>Validate this older test's real temporary path before recursive removal.</en></lang>
    const realTempRoot = await fs.realpath(os.tmpdir());
    const realWorkspaceRoot = await fs.realpath(workspaceRoot);
    const relativeWorkspace = path.relative(realTempRoot, realWorkspaceRoot);
    if (relativeWorkspace === path.basename(realWorkspaceRoot) && relativeWorkspace.startsWith("hia-pug-range-")) {
      await fs.rm(realWorkspaceRoot, { recursive: true, force: true });
    } else {
      throw new Error("Refusing recursive cleanup outside the Pug range test directory.");
    }
  }
});

test("empty input and a dangling annotation emit no synthetic point range", () => {
  // <lang><zh-CN>无目标的注释只留下诊断，不把空行或 1:1 占位伪装成可精确定位的符号。</zh-CN><en>An unattached comment leaves a diagnostic rather than fabricating a precise symbol at a blank line or 1:1.</en></lang>
  const empty = extractPugDoc("", { path: "src/empty.pug" });
  const dangling = extractPugDoc("//-\r\n  @component Ghost\r\n\r\n", { path: "src/dangling.pug" });
  assert.deepEqual(createPugHtmlDocSourceMap({ pugArtifact: empty }).entries, []);
  assert.deepEqual(createPugHtmlDocSourceMap({ pugArtifact: dangling }).entries, []);
  assert.ok(dangling.diagnostics.some((diagnostic) => diagnostic.code === "PUGDOC_COMMENT_TARGET_MISSING"));
});

test("annotation-free Pug runner retains real relations and an empty paired binding", async () => {
  // <lang><zh-CN>入口与依赖都不含文档注释；运行实际 Pug 渲染、提取、映射及绑定写入路径。</zh-CN><en>Entries and dependencies contain no documentation comments; run real Pug rendering, extraction, mapping and binding writes.</en></lang>
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hia-pug-no-comment-"));
  const outputDirectory = path.join(workspaceRoot, "out");
  const sources = {
    "plain.pug": 'mixin badge(item)\r\n  span= item\r\ninclude ./part🔥.pug\r\n+badge("🔥")\r\n',
    "part🔥.pug": "block content\r\n  p Included\r\n",
    "extends.pug": "extends ./base.pug\r\nblock content\r\n  p Child\r\n",
    "base.pug": "block content\r\n  p Base\r\n"
  };
  try {
    for (const [name, source] of Object.entries(sources)) {
      await fs.writeFile(path.join(workspaceRoot, name), source, "utf8");
    }
    const result = await runPugDoc({
      workspaceRoot,
      outputDirectory,
      inputs: [
        { kind: "pug-entry", path: "plain.pug", artifactBasePath: "plain" },
        { kind: "pug-entry", path: "extends.pug", artifactBasePath: "extends" }
      ],
      options: { emitDocSourceMap: true, emitGeneratedDocumentationBinding: true, sourcesContentPolicy: "none", writeResultManifest: false }
    });
    assert.equal(result.status, "success");
    assert.deepEqual(result.diagnostics, []);

    for (const [stem, kinds] of [["plain", ["include", "mixin-call", "block"]], ["extends", ["extends", "block", "block"]]]) {
      const extraction = JSON.parse(await fs.readFile(path.join(outputDirectory, `${stem}.pugdoc.json`), "utf8"));
      const map = JSON.parse(await fs.readFile(path.join(outputDirectory, `${stem}.docmap.json`), "utf8"));
      const binding = JSON.parse(await fs.readFile(path.join(outputDirectory, `${stem}.gdb.json`), "utf8"));
      assert.equal(extraction.symbols.length, 0);
      assert.deepEqual(extraction.relations.map((relation) => relation.kind), kinds);
      assert.equal(map.contractVersion, "1.1.0");
      assert.equal(map.entries.length, 3);
      assert.ok(map.entries.every((entry) => entry.kind !== "symbol"));
      assert.equal(binding.contractVersion, "0.3.0-draft");
      assert.equal(binding.docSourceMapLinkage.contractVersion, map.contractVersion);
      assert.equal(binding.bindings.length, 0);
      assert.equal(map.generatedBindingSidecars[0].contractVersion, binding.contractVersion);
      // <lang><zh-CN>无注释的关系仍可有已证范围；extends 保持未知，不能用人工删注释的 symbol 回退替代自然证据。</zh-CN><en>Unannotated relations can carry proven spans; extends stays unknown, and a manually stripped symbol fallback is not natural evidence.</en></lang>
      for (const [index, entry] of map.entries.entries()) {
        const relation = extraction.relations[index];
        const sourceRef = entry.sourceRefs[0];
        assert.equal(entry.relationKind, relation.kind);
        assert.equal(sourceRef.sourceId, `source:pug:${relation.source.path}`);
        assert.deepEqual(sourceRef.range, relation.source.range);
        assert.deepEqual(sourceRef.rangeConvention, entry.relationKind === "extends"
          ? { endBoundary: "unknown", columnUnit: "unknown" }
          : { endBoundary: "exclusive", columnUnit: "utf16-code-unit" });
      }
      if (stem === "plain") {
        // <lang><zh-CN>非 BMP 路径与实参各占两个 UTF-16 单元，锁定实际写出的排除终点。</zh-CN><en>Non-BMP characters in the path and argument each occupy two UTF-16 units; pin the written exclusive ends.</en></lang>
        assert.deepEqual(map.entries.slice(0, 2).map((entry) => entry.sourceRefs[0].range.end), [
          { line: 3, column: 21 },
          { line: 4, column: 13 }
        ]);
      }
    }
  } finally {
    // <lang><zh-CN>递归删除前解析真实路径，只允许系统临时目录中本测试前缀的直接子目录。</zh-CN><en>Resolve real paths before recursive deletion and allow only this test's direct child of the system temp directory.</en></lang>
    const realTempRoot = await fs.realpath(os.tmpdir());
    const realWorkspaceRoot = await fs.realpath(workspaceRoot);
    const relativeWorkspace = path.relative(realTempRoot, realWorkspaceRoot);
    if (relativeWorkspace === path.basename(realWorkspaceRoot) && relativeWorkspace.startsWith("hia-pug-no-comment-")) {
      await fs.rm(realWorkspaceRoot, { recursive: true, force: true });
    } else {
      throw new Error("Refusing recursive cleanup outside the Pug no-comment test directory.");
    }
  }
});
