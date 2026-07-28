# Pug To HTML Doc Source Map

Defines source linkage between Pug documentation and generated HTML documentation.

The P1 manifest records Pug source ranges, generated HTML artifact references, linkage confidence and deferred diagnostics for template inheritance cases.

When the optional generated documentation binding extractor is enabled, the map
adds a versioned `generatedBindingSidecars` declaration and safe
`generatedBindingRefs` on affected entries. The full binding model remains in
its `.gdb.json` sidecar, so normal source-map consumers retain a position/linkage
manifest rather than a Pug-private semantic AST.
