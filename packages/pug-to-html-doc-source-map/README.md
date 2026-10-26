# Pug To HTML Doc Source Map

Defines source linkage between Pug documentation and generated HTML documentation.

The P1 manifest records Pug source ranges, generated HTML artifact references, linkage confidence and deferred diagnostics for template inheritance cases.

When the optional generated documentation binding extractor is enabled, the map
adds a versioned `generatedBindingSidecars` declaration and safe
`generatedBindingRefs` on affected entries. The full binding model remains in
its `.gdb.json` sidecar, so normal source-map consumers retain a position/linkage
manifest rather than a Pug-private semantic AST.

Source ids use `source:pug:${workspaceRelativePath}`, matching the binding
extractor. Backslashes become `/`; case, hierarchy, Unicode and punctuation
remain intact. Symbol/relation source references and the initial chain stage
refer to these same declared ids. This corrects the earlier lossy lowercase
slug in newly generated maps. Rebuild complete groups instead of mixing an old
map with a new sidecar or editing saved versions/ids. Existing binding ids and
content are unchanged; package and contract versions are unchanged and this
source correction is unreleased.
