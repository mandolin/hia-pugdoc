# HIA PugDoc

HIA PugDoc is the Pug documentation workspace for HIA.

This repository is planned as an umbrella monorepo for Pug documentation specification, extraction, generated HTML documentation bridging, HIA adapter output and documentation source-map linkage.

## Packages

- `@hia-doc/pugdoc-spec`: Pug documentation annotation, tag registry and rule drafts.
- `@hia-doc/pug-doc-extractor`: Pug source to PugDoc extraction artifact.
- `@hia-doc/pug-doc-adapter`: PugDoc extraction artifact to HIA core document.
- `@hia-doc/pug-to-html-doc-source-map`: Pug to HTML documentation source-map linkage.
- `@hia-doc/pug-htmdoc-bridge`: PugDoc and HTMDoc bridge.

## Status

This workspace is currently a bootstrap skeleton. Runtime parser dependencies and public package publishing remain intentionally disabled until the foundation ADRs are accepted.

## Development

```sh
npm run release:gate
```
