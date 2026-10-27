# PugDoc Adapter

Converts PugDoc extraction artifacts to HIA core documents.

The P1 adapter preserves Pug source ranges in HIA source metadata and records `doc-source-map` references in document metadata.
When the runner emits a map, its HIA document reference carries the emitted
`doc-source-map@1.1.0` version. Disabling map emission leaves no HIA document
map reference.
