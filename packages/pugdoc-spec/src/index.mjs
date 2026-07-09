export const PUGDOC_EXTRACTION_CONTRACT = "hia-pugdoc-extraction";
export const PUGDOC_EXTRACTION_CONTRACT_VERSION = "0.1.0-draft";
export const PUGDOC_EXTRACTION_SCHEMA_ID = "https://hia-doc.local/schema/hia-pugdoc-extraction-0.1.0-draft.json";
export const PUGDOC_PROFILE_VERSION = "0.1.0-draft";

export const PUGDOC_SYMBOL_KINDS = Object.freeze({
  component: "html-component",
  element: "html-element",
  template: "html-template",
  attribute: "html-attribute",
  slot: "html-slot",
  event: "html-event",
  styleHook: "html-style-hook",
  mixin: "pug-mixin",
  block: "pug-block",
  include: "pug-include",
  extends: "pug-extends"
});

export const PUGDOC_TAGS = Object.freeze([
  "component",
  "element",
  "template",
  "attr",
  "slot",
  "event",
  "stylehook",
  "description",
  "example",
  "lang",
  "mixin",
  "block",
  "include",
  "extends"
]);

const TAG_TO_KIND = Object.freeze({
  component: PUGDOC_SYMBOL_KINDS.component,
  element: PUGDOC_SYMBOL_KINDS.element,
  template: PUGDOC_SYMBOL_KINDS.template,
  attr: PUGDOC_SYMBOL_KINDS.attribute,
  slot: PUGDOC_SYMBOL_KINDS.slot,
  event: PUGDOC_SYMBOL_KINDS.event,
  stylehook: PUGDOC_SYMBOL_KINDS.styleHook,
  mixin: PUGDOC_SYMBOL_KINDS.mixin,
  block: PUGDOC_SYMBOL_KINDS.block,
  include: PUGDOC_SYMBOL_KINDS.include,
  extends: PUGDOC_SYMBOL_KINDS.extends
});

export const PUGDOC_EXTRACTION_JSON_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: PUGDOC_EXTRACTION_SCHEMA_ID,
  type: "object",
  required: ["contract", "contractVersion", "producer", "profile", "sources", "symbols", "annotations", "relations", "diagnostics"],
  additionalProperties: true,
  properties: {
    contract: { const: PUGDOC_EXTRACTION_CONTRACT },
    contractVersion: { const: PUGDOC_EXTRACTION_CONTRACT_VERSION },
    producer: { type: "object" },
    profile: { type: "object" },
    sources: { type: "array" },
    symbols: { type: "array" },
    annotations: { type: "array" },
    relations: { type: "array" },
    diagnostics: { type: "array" },
    metadata: { type: "object" }
  }
});

export function getPugDocSymbolKind(tag) {
  return TAG_TO_KIND[normalizePugDocTag(tag)] ?? null;
}

export function isPugDocTag(tag) {
  return PUGDOC_TAGS.includes(normalizePugDocTag(tag));
}

export function normalizePugDocTag(tag) {
  return String(tag).toLowerCase().replace(/-/g, "");
}
