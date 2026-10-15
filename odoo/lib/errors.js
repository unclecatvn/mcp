/**
 * The one error type the server throws. `code` is stable so Claude can decide
 * whether to retry, re-search or ask the user; the message is pre-prefixed with
 * `[CODE]` so the MCP SDK's default tool-error envelope carries it verbatim.
 */
export class OdooError extends Error {
  constructor(code, message, cause = undefined) {
    super(`[${code}] ${message}`, { cause });
    this.name = "OdooError";
    this.code = code;
  }
}

const ODOO_EXCEPTION_CODES = {
  "odoo.exceptions.AccessDenied": "ODOO_AUTH_FAILED",
  "odoo.exceptions.AccessError": "ODOO_ACCESS_DENIED",
  "odoo.exceptions.MissingError": "ODOO_MISSING_RECORD",
  "odoo.exceptions.ValidationError": "ODOO_FIELD_INVALID",
  "odoo.exceptions.UserError": "ODOO_USER_ERROR",
  "odoo.exceptions.RedirectWarning": "ODOO_USER_ERROR",
};

/** Map an Odoo JSON-RPC error envelope (`json.error`) to an OdooError. */
export function fromOdooError(envelope) {
  const data = envelope?.data ?? {};
  return new OdooError(
    ODOO_EXCEPTION_CODES[data.name] ?? "ODOO_SERVER_ERROR",
    data.message || envelope?.message || "Unknown Odoo error",
  );
}
