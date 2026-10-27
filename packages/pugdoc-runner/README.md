# PugDoc Runner

Standalone PugDoc project runner and CLI.

`runPugDoc()` compiles Pug entry files, collects local `extends` and `include` dependencies, emits PugDoc extraction, HTMDoc bridge artifact, HIA document, doc-source-map manifest and a documentation producer result.

Set `options.emitGeneratedDocumentationBinding` to `true` to additionally emit
a `generated-documentation-binding@0.3.0-draft` `.gdb.json` sidecar paired with
`doc-source-map@1.1.0`. The option
requires `sourcesContentPolicy: "none"` and an input-local
`generatedBindingLocals` envelope with a declared allowlist. Envelope values are
used only for deterministic JSON-compatible fixture/build lookup and are never
serialized into the sidecar or evidence.

The corresponding doc-source-map only declares `generatedBindingSidecars` and
per-entry `generatedBindingRefs`; it does not embed the sidecar collections.
Each ranged source reference declares its end boundary and column unit. Ranges
without sufficient producer evidence explicitly use `unknown`.
