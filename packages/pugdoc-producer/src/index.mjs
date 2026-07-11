import {
  PUGDOC_INPUT_KINDS,
  PUGDOC_OUTPUT_KINDS,
  PUGDOC_RUNNER_VERSION,
  runPugDoc
} from "@hia-doc/pugdoc-runner";

export const pugdocProducerDescriptor = Object.freeze({
  contract: "documentation-producer",
  contractVersion: "0.1.0-draft",
  id: "pugdoc",
  version: PUGDOC_RUNNER_VERSION,
  displayName: "PugDoc",
  inputKinds: [...PUGDOC_INPUT_KINDS],
  outputKinds: [...PUGDOC_OUTPUT_KINDS],
  capabilities: {
    sourceLinkage: true,
    incremental: false,
    watch: false
  }
});

export const pugdocProducer = Object.freeze({
  descriptor: pugdocProducerDescriptor,
  produce(request, context = {}) {
    return runPugDoc(request, context);
  }
});

export default pugdocProducer;
