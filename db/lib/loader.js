import { parseEnv } from "./config.js";
import { parseConfigFile } from "./configFile.js";

/**
 * Choose between the JSON config-file loader and the env-var loader.
 *
 * Selection is exclusive:
 *   - MCP_DB_CONFIG set → use file loader; DB_* env vars are ignored entirely.
 *   - MCP_DB_CONFIG unset → use env loader.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string>} env
 * @returns {{
 *   aliases: Record<string, object>,
 *   errors: Array<{ alias: string, message: string }>,
 *   defaultAlias?: string,
 *   logLevel?: string,
 *   source: "config_file" | "env",
 * }}
 */
export function loadConfig(env) {
  const configPath = env.MCP_DB_CONFIG;
  if (configPath) {
    return { ...parseConfigFile(configPath), source: "config_file" };
  }
  return { ...parseEnv(env), source: "env" };
}
