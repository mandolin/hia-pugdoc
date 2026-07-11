# HIA PugDoc

HIA PugDoc is the Pug documentation workspace for HIA.

This repository is an umbrella monorepo for Pug documentation specification, extraction, generated HTML documentation bridging, HIA adapter output and documentation source-map linkage.

## Packages

- `@hia-doc/pugdoc-spec`: Pug documentation annotation, tag registry and rule drafts.
- `@hia-doc/pug-doc-extractor`: Pug source to PugDoc extraction artifact.
- `@hia-doc/pug-doc-adapter`: PugDoc extraction artifact to HIA core document.
- `@hia-doc/pug-to-html-doc-source-map`: Pug to HTML documentation source-map linkage.
- `@hia-doc/pug-htmdoc-bridge`: PugDoc and HTMDoc bridge.
- `@hia-doc/pugdoc-runner`: standalone PugDoc project runner and CLI.
- `@hia-doc/pugdoc-producer`: HIA documentation producer adapter backed by the runner.

## Status

This workspace now includes the first Pug -> HTML generated-source fixture. The P1 path uses Pug 3 compilation plus Pug parser-range style metadata owned by HIA:

- Pug source files are compiled to generated HTML.
- PugDoc annotations are extracted from Pug comments.
- PugDoc artifacts are bridged to HTMDoc extraction artifacts.
- `doc-source-map` records Pug source ranges, generated HTML artifact references and linkage confidence.
- A HIA core document fixture is generated for integration validation.
- `@hia-doc/pugdoc-runner` can run the same pipeline from JSON config or CLI inputs and emit a `documentation-producer-result`.
- `@hia-doc/pugdoc-producer` exposes the same runner through the producer contract for HIA-Documentation-Sys orchestration.

Public package publishing remains disabled while the PugDoc contract is still `0.1.0-draft`.

## Fixture

The P1 fixture covers:

- `extends`
- `block`
- `include`
- simple `mixin` declaration and call
- explicit `@component`
- attached comment documentation

`extends` and `block` are intentionally recorded with deferred/low-confidence linkage diagnostics. Pug P1 does not pretend to provide exact source-map quality mapping for template inheritance.

## Development

```sh
npm install
npm run build:fixtures
npm run smoke:standalone
npm run check:fixtures
npm run release:gate
```
