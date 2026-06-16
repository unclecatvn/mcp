import { readFileSync } from "node:fs";
import { z } from "zod";
import { ConfigError } from "./errors.js";
import {
  JSON_ALIAS_KEY_RE,
  VALID_LOG_LEVELS,
  VALID_MODES,
  VALID_SSL,
  VALID_TYPES,
} from "./aliasConstants.js";
import { normalizeAliasConfig } from "./normalizeAlias.js";

const AliasSchema = z
  .object({
    type: z.enum(VALID_TYPES),
    url: z.string().min(1).optional(),
    host: z.string().min(1).optional(),
    port: z.number().int().min(1).max(65535).optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    database: z.string().optional(),
    mode: z.enum(VALID_MODES).optional(),
    ssl: z.enum(VALID_SSL).optional(),
    caCert: z.string().optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional(),
    maxRows: z.number().int().positive().max(1_000_000).optional(),
    poolMax: z.number().int().positive().max(100).optional(),
    displayName: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    tablesHint: z.array(z.string().min(1).max(128)).max(50).optional(),
    defaultSchema: z
      .string()
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/)
      .optional(),
  })
  .strict();

const RootSchema = z
  .object({
    $schema: z.string().optional(),
    logLevel: z.enum(VALID_LOG_LEVELS).optional(),
    defaultAlias: z.string().optional(),
    aliases: z.record(z.string(), z.unknown()),
  })
  .passthrough();

function jsonFail(code, detail = {}) {
  switch (code) {
    case "invalid_url":
      throw new Error(`url: not a valid URL (${detail.cause})`);
    case "missing_host":
      throw new Error("host: required (set directly or via url)");
    case "invalid_type":
      throw new Error(`type: must be one of ${VALID_TYPES.join(", ")}`);
    case "invalid_port":
      throw new Error("port: must be an integer 1-65535");
    case "invalid_mode":
      throw new Error(`mode: must be one of ${VALID_MODES.join(", ")}`);
    case "invalid_ssl":
      throw new Error(`ssl: must be one of ${VALID_SSL.join(", ")}`);
    case "invalid_timeout_ms":
      throw new Error("timeoutMs: must be a positive integer ≤ 600000");
    case "invalid_max_rows":
      throw new Error("maxRows: must be a positive integer ≤ 1000000");
    case "invalid_pool_max":
      throw new Error("poolMax: must be a positive integer ≤ 100");
    default:
      throw new Error(`${code}: invalid alias configuration`);
  }
}

export function parseConfigJson(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    throw new ConfigError(`Config file is not valid JSON: ${err.message}`, {
      field: "(root)",
    });
  }

  const rootResult = RootSchema.safeParse(parsed);
  if (!rootResult.success) {
    const issues = rootResult.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new ConfigError(`Config schema error: ${issues}`, { issues });
  }

  const root = rootResult.data;
  const aliases = {};
  const errors = [];

  for (const [aliasKey, rawAlias] of Object.entries(root.aliases)) {
    if (!JSON_ALIAS_KEY_RE.test(aliasKey)) {
      errors.push({
        alias: aliasKey,
        message: `alias key '${aliasKey}' must match ^[a-z][a-z0-9_]*$`,
      });
      continue;
    }
    const aliasResult = AliasSchema.safeParse(rawAlias);
    if (!aliasResult.success) {
      const msg = aliasResult.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      errors.push({ alias: aliasKey, message: msg });
      continue;
    }
    try {
      aliases[aliasKey] = normalizeAliasConfig(aliasKey, aliasResult.data, { fail: jsonFail });
    } catch (err) {
      errors.push({ alias: aliasKey, message: err.message });
    }
  }

  let defaultAlias = root.defaultAlias;
  if (defaultAlias !== undefined && !Object.prototype.hasOwnProperty.call(aliases, defaultAlias)) {
    errors.push({
      alias: "(root)",
      message: `defaultAlias '${defaultAlias}' does not reference a loaded alias`,
    });
    defaultAlias = undefined;
  }

  return { aliases, errors, defaultAlias, logLevel: root.logLevel };
}

export function parseConfigFile(filePath) {
  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (err) {
    throw new ConfigError(`Config file not readable at '${filePath}': ${err.message}`, {
      field: "(root)",
      path: filePath,
    });
  }
  return parseConfigJson(contents);
}
