# Third Party Notices

## pug

- Version: `3.0.4`
- License: MIT
- Purpose: compile Pug fixture sources into generated HTML for PugDoc source-linkage validation.
- Notes: direct dependency only; Pug transitive packages are part of the official Pug 3 toolchain and are MIT-compatible.

## Pug parser pipeline for generated documentation binding

- Packages: `pug-lexer@5.0.1`, `pug-parser@6.0.0`, `pug-load@3.0.0`,
  `pug-linker@4.0.0`, `pug-walk@2.0.0`.
- License: MIT.
- Purpose: the PugDoc extractor uses the official lexer/parser/load/link/walk
  pipeline for W-P52.4 lexical scope, include/extends provenance, and
  generated-documentation-binding fixture extraction. It parses the frozen P1
  reference subset and never evaluates Pug/JavaScript expressions.
- Notes: packages are declared as exact direct dependencies of
  `@hia-doc/pug-doc-extractor`; no new third-party package is introduced.
