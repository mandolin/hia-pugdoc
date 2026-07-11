import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import pug from "pug";

import { pugDocToHiaDocument } from "@hia-doc/pug-doc-adapter";
import { extractPugProject } from "@hia-doc/pug-doc-extractor";
import { pugDocToHtmlExtraction } from "@hia-doc/pug-htmdoc-bridge";
import { createPugHtmlDocSourceMap } from "@hia-doc/pug-to-html-doc-source-map";
import {
  PUGDOC_EXTRACTION_CONTRACT,
  PUGDOC_EXTRACTION_CONTRACT_VERSION
} from "@hia-doc/pugdoc-spec";

export {
  PUGDOC_CONFIG_JSON_SCHEMA,
  PUGDOC_CONFIG_SCHEMA_ID,
  PUGDOC_CONFIG_SCHEMA_VERSION
} from "./schema.mjs";
import { PUGDOC_CONFIG_SCHEMA_ID, PUGDOC_CONFIG_SCHEMA_VERSION } from "./schema.mjs";

export const PUGDOC_RUNNER_VERSION = "0.0.0";
export const PUGDOC_INPUT_KINDS = Object.freeze(["pug-entry"]);
export const PUGDOC_OUTPUT_KINDS = Object.freeze([
  "generated-html",
  "pugdoc-extraction",
  "htmdoc-extraction",
  "hia-document",
  "doc-source-map"
]);

const RESULT_CONTRACT = "documentation-producer-result";
const RESULT_CONTRACT_VERSION = "0.1.0-draft";
const PRODUCER_ID = "pugdoc";
const SAFE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/**
 * 执行一次 PugDoc 项目构建，并返回标准 documentation producer result。
 * Runs one PugDoc project build and returns the standard documentation producer result.
 *
 * @param {object} request PugDoc runner request with absolute workspace/output directories.
 * @param {{ signal?: AbortSignal, reportProgress?: Function }} [context] Optional producer runtime context.
 * @returns {Promise<object>} Documentation producer result.
 */
export async function runPugDoc(request, context = {}) {
  const normalized = normalizeRequest(request);
  await mkdir(normalized.outputDirectory, { recursive: true });

  const artifacts = [];
  const diagnostics = [];
  let completed = 0;

  for (const [index, input] of normalized.inputs.entries()) {
    if (context.signal?.aborted) {
      diagnostics.push(createDiagnostic("PUGDOC_RUNNER_ABORTED", "PugDoc runner was aborted before all inputs completed.", "error"));
      break;
    }

    context.reportProgress?.({
      phase: "extract",
      current: index,
      total: normalized.inputs.length,
      message: input.path
    });

    try {
      const generated = await processInput(input, normalized, index);
      artifacts.push(...generated.artifacts);
      diagnostics.push(...generated.diagnostics);
      completed += 1;
    } catch (error) {
      diagnostics.push(createDiagnostic(
        "PUGDOC_RUNNER_INPUT_FAILED",
        `Unable to process PugDoc input ${input.path} (${errorCode(error)}).`,
        "error",
        input.path
      ));
    }
  }

  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  const result = {
    contract: RESULT_CONTRACT,
    contractVersion: RESULT_CONTRACT_VERSION,
    producer: {
      id: PRODUCER_ID,
      version: PUGDOC_RUNNER_VERSION
    },
    status: hasErrors ? (artifacts.length > 0 ? "partial" : "failed") : "success",
    artifacts,
    diagnostics
  };

  if (normalized.options.writeResultManifest) {
    await writeJson(path.join(normalized.outputDirectory, "pugdoc.producer-result.json"), result);
  }

  context.reportProgress?.({
    phase: "complete",
    current: completed,
    total: normalized.inputs.length
  });

  return result;
}

/**
 * 读取 versioned PugDoc JSON config 并转成 runner request。
 * Loads a versioned PugDoc JSON config and converts it into a runner request.
 *
 * @param {string} configPath Config path relative to cwd or absolute.
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<object>} Normalized runner request.
 */
export async function loadPugDocConfig(configPath, options = {}) {
  const absoluteConfigPath = path.resolve(options.cwd ?? process.cwd(), configPath);
  const config = JSON.parse(await readFile(absoluteConfigPath, "utf8"));
  assertRecord(config, "PugDoc config must be a JSON object.");
  assertKnownKeys(config, ["$schema", "schemaVersion", "workspaceRoot", "outputDirectory", "inputs", "options", "profileIds"], "config");
  if (config.schemaVersion !== PUGDOC_CONFIG_SCHEMA_VERSION) {
    throw new TypeError(`schemaVersion must be ${PUGDOC_CONFIG_SCHEMA_VERSION}.`);
  }
  if (config.$schema !== undefined && config.$schema !== PUGDOC_CONFIG_SCHEMA_ID) {
    throw new TypeError(`$schema must be ${PUGDOC_CONFIG_SCHEMA_ID}.`);
  }

  const configDirectory = path.dirname(absoluteConfigPath);
  const workspaceDirectory = normalizeConfigDirectory(config.workspaceRoot ?? ".", "workspaceRoot");
  const outputDirectory = normalizeConfigDirectory(config.outputDirectory ?? "dist/pugdoc", "outputDirectory");
  const workspaceRoot = path.resolve(configDirectory, workspaceDirectory);

  return normalizeRequest({
    workspaceRoot,
    outputDirectory: path.resolve(workspaceRoot, outputDirectory),
    inputs: config.inputs,
    options: config.options,
    profileIds: config.profileIds
  });
}

async function processInput(input, request, index) {
  const entryAbsolutePath = path.resolve(request.workspaceRoot, input.path);
  const basePath = outputBasePath(input, index);
  const htmlPath = `${basePath}.html`;
  const pugDocPath = `${basePath}.pugdoc.json`;
  const htmDocPath = `${basePath}.htmdoc.json`;
  const hiaDocumentPath = `${basePath}.hia.json`;
  const docSourceMapPath = `${basePath}.docmap.json`;
  const projectFiles = await collectPugProjectFiles(request.workspaceRoot, input.path);
  const html = pug.renderFile(entryAbsolutePath, {
    ...(input.locals ?? {}),
    pretty: request.options.pretty,
    compileDebug: true
  });
  const pugArtifact = extractPugProject(projectFiles, {
    entryPath: input.path,
    sourcesContentPolicy: request.options.sourcesContentPolicy
  });
  const htmlArtifact = pugDocToHtmlExtraction(pugArtifact, {
    htmlPath,
    docSourceMapPath
  });
  const hiaDocument = pugDocToHiaDocument(pugArtifact, {
    id: `pugdoc:${input.path}`,
    title: path.posix.basename(input.path),
    docSourceMapPath,
    entryArtifact: htmlPath
  });
  const docSourceMap = createPugHtmlDocSourceMap({
    id: `docmap:pug-html:${slug(input.path)}`,
    pugArtifact,
    htmlPath,
    pugDocPath,
    htmDocPath,
    hiaDocumentPath
  });

  await writeText(path.join(request.outputDirectory, htmlPath), ensureTrailingNewline(html));
  await writeJson(path.join(request.outputDirectory, pugDocPath), pugArtifact);
  await writeJson(path.join(request.outputDirectory, htmDocPath), htmlArtifact);
  await writeJson(path.join(request.outputDirectory, hiaDocumentPath), hiaDocument);
  if (request.options.emitDocSourceMap) {
    await writeJson(path.join(request.outputDirectory, docSourceMapPath), docSourceMap);
  }

  const artifactIdBase = `input-${index + 1}`;
  const artifacts = [
    artifact(`${artifactIdBase}-html`, "generated-html", htmlPath, "html", "text/html", request.profileIds),
    {
      ...artifact(`${artifactIdBase}-pugdoc`, "pugdoc-extraction", pugDocPath, "json", "application/json", request.profileIds),
      contract: PUGDOC_EXTRACTION_CONTRACT,
      contractVersion: PUGDOC_EXTRACTION_CONTRACT_VERSION
    },
    {
      ...artifact(`${artifactIdBase}-htmdoc`, "htmdoc-extraction", htmDocPath, "json", "application/json", request.profileIds),
      contract: "hia-htmdoc-extraction",
      contractVersion: "0.1.0-draft"
    },
    artifact(`${artifactIdBase}-hia-document`, "hia-document", hiaDocumentPath, "json", "application/json", request.profileIds)
  ];

  if (request.options.emitDocSourceMap) {
    artifacts.push({
      ...artifact(`${artifactIdBase}-doc-source-map`, "doc-source-map", docSourceMapPath, "json", "application/json", request.profileIds),
      contract: "doc-source-map",
      contractVersion: "0.1.0-draft"
    });
  }

  return {
    artifacts,
    diagnostics: normalizeDiagnostics(pugArtifact.diagnostics, input.path)
  };
}

async function collectPugProjectFiles(workspaceRoot, entryPath) {
  const seen = new Set();
  const files = [];

  async function visit(relativePath) {
    const normalizedPath = normalizeSafeRelativePath(relativePath, "Pug dependency path");
    if (seen.has(normalizedPath)) {
      return;
    }
    seen.add(normalizedPath);
    const source = await readFile(path.resolve(workspaceRoot, normalizedPath), "utf8");
    files.push({ path: normalizedPath, source });

    for (const dependency of findPugDependencies(source, normalizedPath)) {
      await visit(dependency);
    }
  }

  await visit(entryPath);
  return files;
}

function findPugDependencies(source, sourcePath) {
  const directory = path.posix.dirname(sourcePath);
  const dependencies = [];
  for (const line of String(source).split(/\r?\n/)) {
    const trimmed = line.trim();
    const match = /^(?:extends|include)\s+(.+)$/.exec(trimmed);
    if (!match) {
      continue;
    }
    const rawTarget = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(rawTarget) || rawTarget.startsWith("/")) {
      continue;
    }
    const target = rawTarget.endsWith(".pug") ? rawTarget : `${rawTarget}.pug`;
    dependencies.push(normalizeSafeRelativePath(path.posix.normalize(path.posix.join(directory, target)), "Pug dependency path"));
  }
  return dependencies;
}

function normalizeRequest(value) {
  assertRecord(value, "PugDoc runner request must be an object.");
  assertAbsoluteDirectory(value.workspaceRoot, "workspaceRoot");
  assertAbsoluteDirectory(value.outputDirectory, "outputDirectory");
  if (!Array.isArray(value.inputs) || value.inputs.length === 0) {
    throw new TypeError("inputs must be a non-empty array.");
  }

  const inputs = value.inputs.map((input, index) => {
    assertRecord(input, `inputs[${index}] must be an object.`);
    assertKnownKeys(input, ["kind", "path", "artifactBasePath", "locals"], `inputs[${index}]`);
    const inputPath = normalizeSafeRelativePath(input.path, `inputs[${index}].path`);
    const kind = input.kind ?? "pug-entry";
    if (!PUGDOC_INPUT_KINDS.includes(kind)) {
      throw new TypeError(`Unsupported PugDoc input kind: ${kind}`);
    }
    return {
      kind,
      path: inputPath,
      ...(typeof input.artifactBasePath === "string" ? {
        artifactBasePath: normalizeSafeRelativePath(input.artifactBasePath, `inputs[${index}].artifactBasePath`)
      } : {}),
      locals: isJsonObject(input.locals) ? input.locals : {}
    };
  });

  const runnerOptions = value.options ?? {};
  assertRecord(runnerOptions, "options must be an object.");
  assertKnownKeys(runnerOptions, ["emitDocSourceMap", "pretty", "sourcesContentPolicy", "writeResultManifest"], "options");
  const sourcesContentPolicy = runnerOptions.sourcesContentPolicy ?? "none";
  if (!["none", "reference", "embed"].includes(sourcesContentPolicy)) {
    throw new TypeError(`Unsupported sourcesContentPolicy: ${sourcesContentPolicy}`);
  }
  const profileIds = value.profileIds ?? ["pugdoc", "pug-htmdoc-bridge", "doc-source-map"];
  if (!Array.isArray(profileIds) || profileIds.length === 0 || profileIds.some((id) => typeof id !== "string" || !SAFE_ID_PATTERN.test(id))) {
    throw new TypeError("profileIds must be a non-empty array of lower-case identifiers.");
  }

  return {
    workspaceRoot: path.resolve(value.workspaceRoot),
    outputDirectory: path.resolve(value.outputDirectory),
    inputs,
    profileIds: [...profileIds],
    options: {
      emitDocSourceMap: runnerOptions.emitDocSourceMap !== false,
      pretty: runnerOptions.pretty !== false,
      sourcesContentPolicy,
      writeResultManifest: runnerOptions.writeResultManifest !== false
    }
  };
}

function outputBasePath(input, index) {
  if (input.artifactBasePath) {
    return input.artifactBasePath;
  }
  const parsed = path.posix.parse(input.path);
  const directory = parsed.dir ? `${parsed.dir}/` : "";
  return normalizeSafeRelativePath(
    `artifacts/${directory}${parsed.name}.pug-entry-${index + 1}`,
    "artifact base path"
  );
}

function normalizeDiagnostics(diagnostics, fallbackPath) {
  return (diagnostics ?? []).map((diagnostic) => ({
    code: typeof diagnostic?.code === "string" ? diagnostic.code : "PUGDOC_RUNNER_DIAGNOSTIC",
    message: typeof diagnostic?.message === "string" ? diagnostic.message : "PugDoc runner diagnostic.",
    severity: ["error", "warning", "info"].includes(diagnostic?.severity) ? diagnostic.severity : "info",
    path: typeof diagnostic?.path === "string" ? diagnostic.path : fallbackPath,
    ...(isJsonObject(diagnostic?.data) ? { data: diagnostic.data } : {})
  }));
}

function artifact(id, kind, artifactPath, language, mediaType, profileIds) {
  return {
    id,
    kind,
    path: artifactPath,
    language,
    mediaType,
    profileIds
  };
}

function createDiagnostic(code, message, severity, diagnosticPath) {
  return {
    code,
    message,
    severity,
    ...(diagnosticPath ? { path: diagnosticPath } : {})
  };
}

async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf8");
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function normalizeSafeRelativePath(value, label) {
  if (typeof value !== "string" || !isSafeRelativePath(value)) {
    throw new TypeError(`${label} must be a safe relative path.`);
  }
  return value.replaceAll("\\", "/");
}

function isSafeRelativePath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  return Boolean(normalized)
    && !path.posix.isAbsolute(normalized)
    && !path.win32.isAbsolute(value)
    && !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)
    && !normalized.split("/").includes("..");
}

function normalizeConfigDirectory(value, label) {
  if (typeof value !== "string" || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) {
    throw new TypeError(`${label} must be relative to the config/project directory.`);
  }
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.split("/").includes("..")) {
    throw new TypeError(`${label} must not escape its base directory.`);
  }
  return normalized;
}

function assertAbsoluteDirectory(value, label) {
  if (typeof value !== "string" || (!path.posix.isAbsolute(value) && !path.win32.isAbsolute(value))) {
    throw new TypeError(`${label} must be an absolute runtime path.`);
  }
}

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new TypeError(`${label}.${key} is not supported.`);
    }
  }
}

function assertRecord(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(message);
  }
}

function isJsonObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

function errorCode(error) {
  return typeof error?.code === "string" ? error.code : error?.name ?? "Error";
}

function slug(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "input";
}
