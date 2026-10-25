# Changelog

## 未发布 / Unreleased

- 文档源码映射省略缺失的annotation和selector字段，避免输出不符合契约的null。
- 重复关系发生项和符号身份碰撞保留所有条目，追加确定性发生序号；首个身份保持，chain引用实际分配后的身份。
- Extraction comments, binding references and source metadata are preserved. Missing optional annotations/selectors are omitted; colliding entry identities receive deterministic occurrence suffixes and chain references stay aligned.
- 契约与包版本保持；本项描述源码变化，不表示已经发布npm。Contract/package versions are unchanged; these source changes are not an npm publication.

## 0.0.0

- Initialize HIA PugDoc bootstrap workspace.
- Add the first Pug -> HTML -> PugDoc/HTMDoc/doc-source-map/HIA fixture baseline.
- Add the standalone PugDoc runner, CLI, producer adapter and standalone example.
