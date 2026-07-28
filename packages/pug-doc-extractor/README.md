# PugDoc Extractor

Extracts Pug documentation artifacts from Pug source.

Current P1 extractor support:

- attached Pug comment blocks
- `@component`, `@attr` and `@mixin`
- `extends`, `block`, `include` and simple mixin-call relation records
- source ranges using 1-based line/column positions

Generated documentation binding P1 additionally provides an AST-backed optional
sidecar for canonical unprefixed fields containing inline
`<bind ref="..."/>` and optional `@instanceKey`. It uses the official
`pug-lexer`, `pug-parser`, `pug-load`, `pug-linker`, and `pug-walk` pipeline.
Only an identifier or a non-computed member path rooted in a visible lexical
declaration is accepted; references are parsed and structurally resolved, never
evaluated. The sidecar contains neutral binding/expansion/target/diagnostic
records and no Pug AST objects, source body, runtime values, digest, or secret.
