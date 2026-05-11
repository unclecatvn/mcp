/**
 * Error class hierarchy for the MCP Odoo server.
 *
 * Each error has a stable `code` (used by Claude to decide whether to retry,
 * re-search, ask the user, etc.), a user-facing `message`, optional `details`,
 * an optional underlying `cause`, and a `retryable` flag.
 *
 * Two layers of errors:
 *  - Server-side (we throw): ConfigError, InputValidationError, AuthError,
 *    UnknownConnectionError, TransportError.
 *  - Odoo-side (mapped from the JSON-RPC error envelope): OdooFieldError,
 *    OdooMissingRecordError, OdooUserError, OdooAccessError, OdooServerError.
 */

export class McpOdooError extends Error {
  constructor(code, message, details = {}, cause = undefined, retryable = false) {
    super(message);
    this.name = "McpOdooError";
    this.code = code;
    this.details = details;
    this.cause = cause;
    this.retryable = retryable;
  }
}

// ---- Server-side errors ----------------------------------------------------

export class ConfigError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_CONFIG_INVALID", message, details, cause, false);
    this.name = "ConfigError";
  }
}

export class InputValidationError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_INPUT_INVALID", message, details, cause, false);
    this.name = "InputValidationError";
  }
}

export class UnknownConnectionError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_UNKNOWN_CONNECTION", message, details, cause, false);
    this.name = "UnknownConnectionError";
  }
}

export class AuthError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_AUTH_FAILED", message, details, cause, false);
    this.name = "AuthError";
  }
}

export class TransportError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_TRANSPORT_FAILED", message, details, cause, true);
    this.name = "TransportError";
  }
}

// ---- Odoo-side errors (mapped from json.error.data.name) -------------------

export class OdooFieldError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_FIELD_INVALID", message, details, cause, false);
    this.name = "OdooFieldError";
  }
}

export class OdooMissingRecordError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_MISSING_RECORD", message, details, cause, false);
    this.name = "OdooMissingRecordError";
  }
}

export class OdooUserError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_USER_ERROR", message, details, cause, false);
    this.name = "OdooUserError";
  }
}

export class OdooAccessError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_ACCESS_DENIED", message, details, cause, false);
    this.name = "OdooAccessError";
  }
}

export class OdooServerError extends McpOdooError {
  constructor(message, details = {}, cause = undefined) {
    super("ODOO_SERVER_ERROR", message, details, cause, false);
    this.name = "OdooServerError";
  }
}

// ---- Mapping ---------------------------------------------------------------

const ODOO_EXCEPTION_MAP = {
  "odoo.exceptions.AccessDenied": AuthError,
  "odoo.exceptions.AccessError": OdooAccessError,
  "odoo.exceptions.MissingError": OdooMissingRecordError,
  "odoo.exceptions.ValidationError": OdooFieldError,
  "odoo.exceptions.UserError": OdooUserError,
  "odoo.exceptions.RedirectWarning": OdooUserError,
  "odoo.exceptions.Warning": OdooUserError,
};

/**
 * Build the right error subclass from an Odoo JSON-RPC error envelope.
 *
 * @param {{ message?: string, data?: { name?: string, message?: string, debug?: string, arguments?: unknown[] } }} envelope
 * @param {object} extraDetails
 */
export function fromOdooError(envelope, extraDetails = {}) {
  const data = envelope?.data || {};
  const message = data.message || envelope?.message || "Unknown Odoo error";
  const odooName = data.name;
  const Cls = ODOO_EXCEPTION_MAP[odooName] ?? OdooServerError;
  return new Cls(message, {
    ...extraDetails,
    odooErrorName: odooName,
    odooDebug: data.debug,
    odooArguments: data.arguments,
  });
}

/**
 * Format any thrown value into the MCP tool error response shape.
 * Output: `[CODE] message` so Claude can pattern-match the code.
 *
 * @param {unknown} err
 * @returns {{ isError: true, content: Array<{type: "text", text: string}> }}
 */
export function formatErrorForMcp(err) {
  let code = "ODOO_INTERNAL";
  let message;
  if (err instanceof McpOdooError) {
    code = err.code;
    message = err.message;
  } else if (err instanceof Error) {
    message = err.message;
  } else {
    message = String(err);
  }
  return {
    isError: true,
    content: [{ type: "text", text: `[${code}] ${message}` }],
  };
}
