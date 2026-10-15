/**
 * Parse vault definitions from environment variables.
 *
 * Naming pattern:   OBSIDIAN_<NAME>_<FIELD>
 * Required:         PATH  (absolute path to the vault folder)
 * Optional:         MODE  ("readonly" | "readwrite", default "readonly")
 *
 * Returns { vaults, errors }. A bad entry is reported in `errors` and skipped,
 * so one broken vault does not take down the server.
 */
import fs from "node:fs";
import path from "node:path";

const MODES = ["readonly", "readwrite"];

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{
 *   vaults: Record<string, { name: string, root: string, mode: "readonly" | "readwrite" }>,
 *   errors: Array<{ name: string, message: string, severity: "error" | "warn" }>
 * }}
 */
export function parseEnv(env) {
  const vaults = {};
  const errors = [];

  for (const key of Object.keys(env)) {
    const m = key.match(/^OBSIDIAN_([A-Z][A-Z0-9_]*)_PATH$/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    const raw = env[key]?.trim();
    if (!raw) continue;

    if (!path.isAbsolute(raw)) {
      errors.push({ name, message: `${key} must be an absolute path`, severity: "error" });
      continue;
    }

    let root;
    try {
      // Resolve symlinks once so every containment check compares real paths.
      root = fs.realpathSync(raw);
      if (!fs.statSync(root).isDirectory()) throw new Error("not a directory");
    } catch (e) {
      errors.push({
        name,
        message: `${key}="${raw}" is not a usable directory: ${e.message}`,
        severity: "error",
      });
      continue;
    }

    let mode = env[`OBSIDIAN_${m[1]}_MODE`]?.trim().toLowerCase() || "readonly";
    if (!MODES.includes(mode)) {
      errors.push({ name, message: `Unknown MODE "${mode}" — using readonly`, severity: "warn" });
      mode = "readonly";
    }

    vaults[name] = { name, root, mode };
  }

  return { vaults, errors };
}
