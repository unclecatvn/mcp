/**
 * Parse Odoo connection definitions from environment variables.
 *
 * Naming pattern:   ODOO_<NAME>_<FIELD>
 * Discovery anchor: the *_URL suffix (URL is mandatory for every connection)
 *
 * Required fields:  URL, DB, USERNAME
 * Auth (one of):    API_KEY (preferred) or PASSWORD
 * Optional:         TIMEOUT_MS  (per-connection request timeout, default 60000)
 *
 * Returns { connections, errors }. Per-connection failures never throw — they
 * are reported in `errors` so a single bad entry does not take down the server.
 */

const NAME_RE = /^[a-z][a-z0-9_]*$/;
const KNOWN_SUFFIXES = "URL|DB|USERNAME|API_KEY|PASSWORD|TIMEOUT_MS";

const TIMEOUT_DEFAULT_MS = 60_000;
const TIMEOUT_MIN_MS = 1_000;
const TIMEOUT_MAX_MS = 600_000;

function pushError(errors, name, message, severity = "error") {
  errors.push({ name, message, severity });
}

/** Trim and return the value; treat null/undefined/empty/whitespace as missing. */
function readEnv(env, key) {
  const v = env[key];
  if (v === undefined || v === null) return undefined;
  const trimmed = String(v).trim();
  return trimmed === "" ? undefined : trimmed;
}

function normalizeUrl(raw, name, errors) {
  let url;
  try {
    url = new URL(raw);
  } catch (e) {
    pushError(errors, name, `Invalid URL "${raw}": ${e.message}`);
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    pushError(errors, name, `URL protocol must be http: or https: (got ${url.protocol})`);
    return null;
  }
  if (url.protocol === "http:") {
    pushError(errors, name, `URL uses http: — credentials will be sent in clear text`, "warn");
  }
  return raw.replace(/\/+$/, "");
}

function parseTimeout(raw, name, errors) {
  if (raw === undefined) return TIMEOUT_DEFAULT_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    pushError(
      errors,
      name,
      `TIMEOUT_MS must be an integer (got "${raw}") — falling back to ${TIMEOUT_DEFAULT_MS}ms`,
      "warn",
    );
    return TIMEOUT_DEFAULT_MS;
  }
  if (n < TIMEOUT_MIN_MS || n > TIMEOUT_MAX_MS) {
    pushError(
      errors,
      name,
      `TIMEOUT_MS=${n} is outside [${TIMEOUT_MIN_MS}, ${TIMEOUT_MAX_MS}] — clamping`,
      "warn",
    );
    return Math.max(TIMEOUT_MIN_MS, Math.min(TIMEOUT_MAX_MS, n));
  }
  return n;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {{
 *   connections: Record<string, {
 *     name: string,
 *     url: string,
 *     db: string,
 *     username: string,
 *     authType: "apikey" | "password",
 *     secret: string,
 *     timeoutMs: number,
 *   }>,
 *   errors: Array<{ name: string, message: string, severity: "error" | "warn" }>
 * }}
 */
export function parseEnv(env) {
  const connections = {};
  const errors = [];
  const discovered = new Set();

  // Discover by *_URL anchor (must be set AND non-empty after trim).
  for (const key of Object.keys(env)) {
    const m = key.match(/^ODOO_([A-Z][A-Z0-9_]*)_URL$/);
    if (!m) continue;
    if (readEnv(env, key) === undefined) continue;
    discovered.add(m[1]);
  }

  // Detect orphan fields (e.g. ODOO_PROD_DB without a usable ODOO_PROD_URL).
  const orphanRe = new RegExp(`^ODOO_([A-Z][A-Z0-9_]*)_(${KNOWN_SUFFIXES})$`);
  const orphans = new Set();
  for (const key of Object.keys(env)) {
    const m = key.match(orphanRe);
    if (!m) continue;
    if (discovered.has(m[1])) continue;
    orphans.add(m[1]);
  }
  for (const NAME of orphans) {
    pushError(
      errors,
      NAME.toLowerCase(),
      `Found ODOO_${NAME}_* fields but ODOO_${NAME}_URL is empty or missing — connection skipped`,
      "warn",
    );
  }

  for (const NAME of discovered) {
    const lower = NAME.toLowerCase();
    if (!NAME_RE.test(lower)) {
      pushError(errors, lower, `Invalid connection name: ${NAME}`);
      continue;
    }

    const rawUrl = readEnv(env, `ODOO_${NAME}_URL`);
    const db = readEnv(env, `ODOO_${NAME}_DB`);
    const username = readEnv(env, `ODOO_${NAME}_USERNAME`);
    const apiKey = readEnv(env, `ODOO_${NAME}_API_KEY`);
    const password = readEnv(env, `ODOO_${NAME}_PASSWORD`);
    const rawTimeout = readEnv(env, `ODOO_${NAME}_TIMEOUT_MS`);

    const missing = [];
    if (!db) missing.push("DB");
    if (!username) missing.push("USERNAME");
    if (missing.length > 0) {
      pushError(
        errors,
        lower,
        `Missing required field(s): ${missing.map((s) => `ODOO_${NAME}_${s}`).join(", ")}`,
      );
      continue;
    }

    if (!apiKey && !password) {
      pushError(
        errors,
        lower,
        `Missing credentials — set either ODOO_${NAME}_API_KEY (preferred) or ODOO_${NAME}_PASSWORD`,
      );
      continue;
    }

    if (apiKey && password) {
      pushError(
        errors,
        lower,
        `Both ODOO_${NAME}_API_KEY and ODOO_${NAME}_PASSWORD are set — API_KEY will be used`,
        "warn",
      );
    }

    const url = normalizeUrl(rawUrl, lower, errors);
    if (!url) continue;

    const timeoutMs = parseTimeout(rawTimeout, lower, errors);

    connections[lower] = {
      name: lower,
      url,
      db,
      username,
      authType: apiKey ? "apikey" : "password",
      secret: apiKey || password,
      timeoutMs,
    };
  }

  return { connections, errors };
}
