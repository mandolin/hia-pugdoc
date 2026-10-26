# Changelog

## 未发布 / Unreleased

- 新生成映射沿用绑定端已有`source:pug:${相对路径}`源码身份，保留大小写、标点、Unicode及路径层级；同步source声明、符号/关系引用及chain，修复整组迁移断链与slug碰撞。绑定/scope/实例/target及注释内容不变，旧工件不自动重写，契约/包版本保持、未发布npm。
- Newly generated maps use the binding extractor's existing path-based source ids, preserving case, punctuation, Unicode and hierarchy across declarations, symbol/relation references and chains. This fixes bundle source closure and slug collisions while retaining binding/scope/instance/target identities and content. Saved artifacts are not rewritten; contract/package versions are unchanged and unreleased.

- 文档源码映射省略缺失的annotation和selector字段，避免输出不符合契约的null。
- 重复关系发生项和符号身份碰撞保留所有条目，追加确定性发生序号；首个身份保持，chain引用实际分配后的身份。
- Extraction comments, binding references and source metadata are preserved. Missing optional annotations/selectors are omitted; colliding entry identities receive deterministic occurrence suffixes and chain references stay aligned.
- 契约与包版本保持；本项描述源码变化，不表示已经发布npm。Contract/package versions are unchanged; these source changes are not an npm publication.

## 0.0.0

- Initialize HIA PugDoc bootstrap workspace.
- Add the first Pug -> HTML -> PugDoc/HTMDoc/doc-source-map/HIA fixture baseline.
- Add the standalone PugDoc runner, CLI, producer adapter and standalone example.
